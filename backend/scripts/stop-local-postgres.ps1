$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$dataDir = Resolve-Path (Join-Path $projectRoot '.local-postgres\data') -ErrorAction SilentlyContinue
$startScript = Resolve-Path (Join-Path $projectRoot 'scripts\start-local-postgres.mjs') -ErrorAction SilentlyContinue
$stoppedPostgres = $false
$stoppedLauncher = $false

if ($dataDir) {
  $connections = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue

  foreach ($connection in $connections) {
    $pidValue = $connection.OwningProcess
    if ($pidValue -eq 0) {
      continue
    }

    $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $pidValue) -ErrorAction SilentlyContinue
    $commandLine = [string]$process.CommandLine

    if ($commandLine.Contains($dataDir.Path)) {
      $stoppedPostgres = $true
      Write-Host ('Stopping local embedded PostgreSQL PID ' + $pidValue + '.')
      Stop-Process -Id $pidValue -Force
    }
  }

  if (-not $stoppedPostgres -and $connections) {
    Write-Host 'Port 5432 is in use, but not by this project local database. Leaving it running.'
  }
} else {
  Write-Host 'No local embedded database directory found.'
}

if ($startScript) {
  $launchers = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'node.exe' -and
      ([string]$_.CommandLine).Contains($startScript.Path)
    }

  foreach ($launcher in $launchers) {
    $stoppedLauncher = $true
    Write-Host ('Stopping local database launcher PID ' + $launcher.ProcessId + '.')
    Stop-Process -Id $launcher.ProcessId -Force
  }
}

if (-not $stoppedPostgres -and -not $stoppedLauncher) {
  Write-Host 'No local database process from this project was running.'
}
