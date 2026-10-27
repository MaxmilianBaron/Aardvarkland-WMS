[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$EnvironmentFile = '.\backend\.env.production',
  [string]$BackupDirectory = '.\releases\rollback',
  [switch]$SkipMigrations,
  [switch]$RestartServices,
  [switch]$KeepFailedBuild
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$rollbackRoot = if ([IO.Path]::IsPathRooted($BackupDirectory)) { Join-Path $BackupDirectory $stamp } else { Join-Path (Join-Path $root $BackupDirectory) $stamp }
$serviceScript = Join-Path $root 'scripts\Install-AardvarklandWindowsServices.ps1'

function Invoke-Checked {
  param([string]$WorkingDirectory, [string]$FilePath, [string[]]$Arguments)
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE." }
  } finally { Pop-Location }
}

function Copy-IfExists {
  param([string]$Source, [string]$Destination)
  if (Test-Path -LiteralPath $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
}

function Assert-WithinProject {
  param([string]$Path)
  $resolvedRoot = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing filesystem mutation outside the WMS project: $resolvedPath"
  }
}

if (-not $PSCmdlet.ShouldProcess($root, 'Build, migrate, verify, and install upgrade with automatic rollback')) { return }
New-Item -ItemType Directory -Force -Path $rollbackRoot | Out-Null
Copy-IfExists (Join-Path $root 'backend\dist') (Join-Path $rollbackRoot 'backend-dist')
Copy-IfExists (Join-Path $root 'frontend\dist') (Join-Path $rollbackRoot 'frontend-dist')

try {
  Invoke-Checked (Join-Path $root 'backend') 'npm' @('ci')
  Invoke-Checked (Join-Path $root 'backend') 'npm' @('run', 'verify')
  if (-not $SkipMigrations) { Invoke-Checked (Join-Path $root 'backend') 'npm' @('run', 'prisma:deploy') }
  Invoke-Checked (Join-Path $root 'frontend') 'npm' @('ci')
  Invoke-Checked (Join-Path $root 'frontend') 'npm' @('run', 'build')
  Invoke-Checked (Join-Path $root 'print-agent') 'npm' @('ci')
  Invoke-Checked (Join-Path $root 'print-agent') 'npm' @('run', 'check')
  if ($RestartServices) {
    & $serviceScript -Action Restart -EnvironmentFile $EnvironmentFile -IncludePrintAgent
  }
  & (Join-Path $root 'scripts\Test-AardvarklandBackendAlerts.ps1') -Strict
} catch {
  $failure = $_
  if (Test-Path (Join-Path $rollbackRoot 'backend-dist')) {
    $backendDist = Join-Path $root 'backend\dist'
    Assert-WithinProject $backendDist
    Remove-Item -LiteralPath $backendDist -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'backend-dist') -Destination (Join-Path $root 'backend\dist') -Recurse -Force
  }
  if (Test-Path (Join-Path $rollbackRoot 'frontend-dist')) {
    $frontendDist = Join-Path $root 'frontend\dist'
    Assert-WithinProject $frontendDist
    Remove-Item -LiteralPath $frontendDist -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -LiteralPath (Join-Path $rollbackRoot 'frontend-dist') -Destination (Join-Path $root 'frontend\dist') -Recurse -Force
  }
  if ($RestartServices) {
    try { & $serviceScript -Action Restart -EnvironmentFile $EnvironmentFile -IncludePrintAgent } catch { Write-Warning $_.Exception.Message }
  }
  if (-not $KeepFailedBuild) { Write-Warning "Failed build was rolled back from $rollbackRoot." }
  throw $failure
}

Write-Host "Upgrade completed. Rollback snapshot: $rollbackRoot"
