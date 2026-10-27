[CmdletBinding()]
param(
  [switch]$Json
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

$textExtensions = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($extension in @(
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.md',
    '.prisma',
    '.sql',
    '.ps1',
    '.bat',
    '.cmd',
    '.yml',
    '.yaml',
    '.html',
    '.css',
    '.scss',
    '.txt',
    '.csv',
    '.svg',
    '.example',
    '.gitignore',
    '.editorconfig'
  )) {
  [void]$textExtensions.Add($extension)
}

$textFileNames = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($name in @('Dockerfile', 'README', 'LICENSE')) {
  [void]$textFileNames.Add($name)
}

$skipFileNames = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($name in @(
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'openapi.json'
  )) {
  [void]$skipFileNames.Add($name)
}

$skipDirectoryNames = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($name in @(
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.git',
    '.vite',
    'reports',
    'playwright-report',
    'test-results'
  )) {
  [void]$skipDirectoryNames.Add($name)
}

function Test-PathSegment {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][System.Collections.Generic.HashSet[string]]$Segments
  )

  foreach ($part in ($Path -split '[\\/]')) {
    if ($Segments.Contains($part)) {
      return $true
    }
  }

  return $false
}

function Test-IsGeneratedPrismaPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return $Path -match '[\\/]backend[\\/]src[\\/]generated[\\/]prisma[\\/]'
}

function Test-IsTestSourceFile {
  param([Parameter(Mandatory = $true)][System.IO.FileInfo]$File)

  return $File.Name -match '\.(test|spec)\.[^.]+$'
}

function Test-IsCountableTextFile {
  param([Parameter(Mandatory = $true)][System.IO.FileInfo]$File)

  if (Test-PathSegment -Path $File.FullName -Segments $skipDirectoryNames) {
    return $false
  }

  if ($skipFileNames.Contains($File.Name)) {
    return $false
  }

  if ($File.Extension -eq '.log') {
    return $false
  }

  if (Test-IsGeneratedPrismaPath -Path $File.FullName) {
    return $false
  }

  return $textExtensions.Contains($File.Extension) -or $textFileNames.Contains($File.Name)
}

function Measure-CodeFiles {
  param(
    [Parameter(Mandatory = $true)][string]$Scope,
    [Parameter(Mandatory = $true)][string]$Includes,
    [Parameter(Mandatory = $true)][System.IO.FileInfo[]]$Files
  )

  $lineCount = 0
  foreach ($file in ($Files | Sort-Object FullName)) {
    $lineCount += (Get-Content -LiteralPath $file.FullName | Measure-Object -Line).Lines
  }

  [pscustomobject]@{
    Scope = $Scope
    Files = $Files.Count
    Lines = [int]$lineCount
    Includes = $Includes
  }
}

$backendRoot = Join-Path $root 'backend'
$frontendRoot = Join-Path $root 'frontend'

$backendCleanFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $backendRoot 'src') -Recurse -File -Force |
    Where-Object {
      $_.Extension -eq '.ts' -and
      -not (Test-IsGeneratedPrismaPath -Path $_.FullName) -and
      -not (Test-IsTestSourceFile -File $_)
    }
  Get-Item -LiteralPath (Join-Path $backendRoot 'prisma\schema.prisma')
)

$backendTotalFiles = @(
  Get-ChildItem -LiteralPath $backendRoot -Recurse -File -Force |
    Where-Object { Test-IsCountableTextFile -File $_ }
)

$frontendCleanFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $frontendRoot 'src') -Recurse -File -Force |
    Where-Object {
      @('.ts', '.tsx', '.css') -contains $_.Extension -and
      -not (Test-IsTestSourceFile -File $_)
    }
)

$frontendTotalFiles = @(
  Get-ChildItem -LiteralPath $frontendRoot -Recurse -File -Force |
    Where-Object { Test-IsCountableTextFile -File $_ }
)

$backendClean = Measure-CodeFiles `
  -Scope 'backend clean product code' `
  -Files $backendCleanFiles `
  -Includes 'backend/src TypeScript, excluding generated Prisma and test/spec files, plus backend/prisma/schema.prisma'

$backendTotal = Measure-CodeFiles `
  -Scope 'backend total app scope' `
  -Files $backendTotalFiles `
  -Includes 'backend clean code plus backend tests, Prisma migrations, app config, scripts, examples, and docs'

$frontendClean = Measure-CodeFiles `
  -Scope 'frontend clean product code' `
  -Files $frontendCleanFiles `
  -Includes 'frontend/src TypeScript, TSX, and CSS, excluding test/spec files'

$frontendTotal = Measure-CodeFiles `
  -Scope 'frontend total app scope' `
  -Files $frontendTotalFiles `
  -Includes 'frontend clean code plus frontend config, public text assets, examples, and docs'

$combinedClean = [pscustomobject]@{
  Scope = 'combined clean product code'
  Files = $backendClean.Files + $frontendClean.Files
  Lines = $backendClean.Lines + $frontendClean.Lines
  Includes = 'backend clean product code plus frontend clean product code'
}

$combinedTotal = [pscustomobject]@{
  Scope = 'combined total app scope'
  Files = $backendTotal.Files + $frontendTotal.Files
  Lines = $backendTotal.Lines + $frontendTotal.Lines
  Includes = 'backend total app scope plus frontend total app scope'
}

$measurements = @(
  $backendClean,
  $backendTotal,
  $frontendClean,
  $frontendTotal,
  $combinedClean,
  $combinedTotal
)

if ($Json) {
  $measurements | ConvertTo-Json -Depth 4
} else {
  $measurements | Format-Table -AutoSize
}
