param(
  [string]$RepoName = "MaxmilianBaron/Aardvarkland-WMS-Backend-Frontend-Demo",
  [ValidateSet("public", "private", "internal")]
  [string]$Visibility = "public",
  [string]$Description = "Public Aardvarkland WMS showcase demo for warehouse operations, RF scanning, labels, and integrations."
)

$ErrorActionPreference = "Stop"

function Find-Gh {
  $command = Get-Command gh -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $localGh = Join-Path $env:LOCALAPPDATA "Programs\GitHub CLI\bin\gh.exe"
  if (Test-Path -LiteralPath $localGh) {
    return $localGh
  }

  throw "GitHub CLI was not found. Install it from https://cli.github.com/ and rerun this script."
}

$gh = Find-Gh

cmd.exe /c "`"$gh`" auth status >nul 2>nul"
$authExitCode = $LASTEXITCODE
if ($authExitCode -ne 0) {
  Write-Host "Opening GitHub login in your browser..."
  & $gh auth login --hostname github.com --git-protocol https --web --clipboard
}

& $gh auth status

$visibilityFlag = "--$Visibility"
$hasRemote = $false
$remoteNames = @(git remote)
if ($remoteNames -contains "origin") {
  $hasRemote = $true
}

if (-not $hasRemote) {
  & $gh repo create $RepoName $visibilityFlag --description $Description --source . --remote origin --push
} else {
  git branch -M main
  git push -u origin main
}

Write-Host "Published $RepoName."
