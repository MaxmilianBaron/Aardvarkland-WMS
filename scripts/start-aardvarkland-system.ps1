$ErrorActionPreference = 'Stop'

$wmsRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$workspaceRoot = Resolve-Path (Join-Path $wmsRoot '..')
$backendDir = Join-Path $wmsRoot 'backend'
$frontendDir = Join-Path $wmsRoot 'frontend'
$logsDir = Join-Path $wmsRoot 'logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$env:AARDVARKLAND_SKIP_BROWSER = '1'
$env:AARDVARKLAND_BACKGROUND = '1'

function Test-LocalPort {
  param([int]$Port)

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(700)) {
      return $false
    }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-Url {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 180
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Start-HiddenCommand {
  param(
    [string]$Command,
    [string]$WorkingDirectory,
    [string]$OutLog,
    [string]$ErrLog
  )

  Start-Process `
    -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $Command) `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog | Out-Null
}

if (-not (Test-LocalPort 3002)) {
  $dashboardScript = Join-Path $wmsRoot 'scripts\launcher-dashboard.mjs'
  Start-Process `
    -FilePath 'node' `
    -ArgumentList @('"' + $dashboardScript + '"') `
    -WorkingDirectory $wmsRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logsDir 'launcher-dashboard.out.log') `
    -RedirectStandardError (Join-Path $logsDir 'launcher-dashboard.err.log') | Out-Null
}

$dashboardReady = $false
for ($i = 0; $i -lt 20; $i++) {
  if (Test-LocalPort 3002) {
    $dashboardReady = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if ($env:AARDVARKLAND_NO_OPEN -ne '1') {
  Start-Process 'http://localhost:3002'
}

if (-not (Test-LocalPort 4001)) {
  Start-HiddenCommand `
    -Command ('"' + (Join-Path $backendDir 'Start Backend.bat') + '"') `
    -WorkingDirectory $backendDir `
    -OutLog (Join-Path $backendDir 'backend-local-start.out.log') `
    -ErrLog (Join-Path $backendDir 'backend-local-start.err.log')
}

$backendReady = Wait-Url -Url 'http://localhost:4001/api/health' -TimeoutSeconds 180
if (-not $backendReady) {
  exit 1
}

$queueWorkerRunning = @(Get-CimInstance Win32_Process | Where-Object {
  $commandLine = [string]$_.CommandLine
  $commandLine.Contains($backendDir) -and $commandLine.Contains('queue-worker.main')
}).Count -gt 0

if (-not $queueWorkerRunning) {
  Start-HiddenCommand `
    -Command 'npm run worker:queue' `
    -WorkingDirectory $backendDir `
    -OutLog (Join-Path $backendDir 'queue-worker-local-start.out.log') `
    -ErrLog (Join-Path $backendDir 'queue-worker-local-start.err.log')
}

if (-not (Test-LocalPort 4000)) {
  Start-HiddenCommand `
    -Command ('"' + (Join-Path $frontendDir 'Start Frontend.bat') + '"') `
    -WorkingDirectory $frontendDir `
    -OutLog (Join-Path $frontendDir 'frontend-local-start.out.log') `
    -ErrLog (Join-Path $frontendDir 'frontend-local-start.err.log')
}

Wait-Url -Url 'http://localhost:4000' -TimeoutSeconds 120 | Out-Null
