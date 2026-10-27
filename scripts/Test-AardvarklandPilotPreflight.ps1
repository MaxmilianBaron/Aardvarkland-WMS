[CmdletBinding()]
param(
  [string]$EnvironmentFile = '.\backend\.env.production',
  [switch]$RequireDocker,
  [switch]$RequireAdministrator,
  [switch]$RequireWinSw,
  [switch]$RequireProductionEnvironment,
  [string]$WinSwPath = '.\service\winsw.exe',
  [string]$OutputPath = '.\logs\pilot-preflight.json'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Resolve-ProjectPath {
  param([string]$Path)
  if ([IO.Path]::IsPathRooted($Path)) { return $Path }
  return Join-Path $root $Path
}

function Test-CommandAvailable {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$checks = [Collections.Generic.List[object]]::new()
function Add-Check {
  param([string]$Name, [bool]$Ok, [string]$Detail, [bool]$Required = $true)
  $checks.Add([pscustomobject]@{
    name = $Name
    status = if ($Ok) { 'PASS' } elseif ($Required) { 'FAIL' } else { 'OPEN' }
    required = $Required
    detail = $Detail
  })
}

$nodeOk = Test-CommandAvailable 'node'
$npmOk = Test-CommandAvailable 'npm'
$nodeVersion = if ($nodeOk) { (& node --version) } else { 'missing' }
$npmVersion = if ($npmOk) { (& npm --version) } else { 'missing' }
Add-Check 'node' $nodeOk "Node: $nodeVersion"
Add-Check 'npm' $npmOk "npm: $npmVersion"
Add-Check 'powershell' $true $PSVersionTable.PSVersion.ToString()

$dockerOk = Test-CommandAvailable 'docker'
Add-Check 'docker' $dockerOk $(if ($dockerOk) { 'Docker CLI is available.' } else { 'Docker CLI is not available.' }) $RequireDocker

$admin = Test-IsAdministrator
Add-Check 'administrator' $admin $(if ($admin) { 'Running elevated.' } else { 'Not running elevated.' }) $RequireAdministrator

$winSwResolved = Resolve-ProjectPath $WinSwPath
$winSwOk = Test-Path -LiteralPath $winSwResolved
Add-Check 'winsw' $winSwOk $(if ($winSwOk) { $winSwResolved } else { "Missing: $winSwResolved" }) $RequireWinSw

foreach ($path in @(
  'backend\package.json',
  'backend\prisma\schema.prisma',
  'frontend\package.json',
  'print-agent\package.json'
)) {
  $resolved = Join-Path $root $path
  Add-Check "file:$path" (Test-Path -LiteralPath $resolved) $resolved
}

$environmentPath = Resolve-ProjectPath $EnvironmentFile
$environmentExists = Test-Path -LiteralPath $environmentPath
Add-Check 'production-environment' $environmentExists $(if ($environmentExists) { $environmentPath } else { "Missing: $environmentPath" }) $RequireProductionEnvironment
if ($environmentExists) {
  $environmentText = Get-Content -LiteralPath $environmentPath -Raw
  $placeholder = $environmentText -match 'REPLACE_WITH|replace-with|changeme|docker-local|local-jwt'
  Add-Check 'production-secrets' (-not $placeholder) $(if ($placeholder) { 'Placeholder or local secrets remain.' } else { 'No known placeholder secrets found.' }) $RequireProductionEnvironment
}

$failed = @($checks | Where-Object status -eq 'FAIL')
$result = [ordered]@{
  schemaVersion = 1
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  status = if ($failed.Count) { 'FAIL' } else { 'PASS' }
  projectRoot = $root
  checks = $checks
}
$resolvedOutput = Resolve-ProjectPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutput) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
$result | ConvertTo-Json -Depth 8
if ($failed.Count) { exit 2 }
