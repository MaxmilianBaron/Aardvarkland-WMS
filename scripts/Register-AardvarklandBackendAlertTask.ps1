[CmdletBinding()]
param(
  [string]$TaskName = 'Aardvarkland Backend Alert Check',
  [string]$ApiBaseUrl = 'http://127.0.0.1:4001/api',
  [string]$OutputPath = '.\logs\backend-alert-status.json',
  [int]$EveryMinutes = 5,
  [string]$BearerToken = ''
)

$ErrorActionPreference = 'Stop'

if ($EveryMinutes -lt 1 -or $EveryMinutes -gt 1440) {
  throw 'EveryMinutes must be between 1 and 1440.'
}

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$scriptPath = Join-Path $root 'scripts\Test-AardvarklandBackendAlerts.ps1'
$output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath((Join-Path $root $OutputPath))

$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$scriptPath`"",
  '-ApiBaseUrl', "`"$ApiBaseUrl`"",
  '-OutputPath', "`"$output`""
)
if ($BearerToken.Trim().Length -gt 0) {
  $arguments += @('-BearerToken', "`"$BearerToken`"")
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ($arguments -join ' ')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Checks Aardvarkland backend health/readiness and writes a local alert snapshot.' `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' every $EveryMinutes minute(s)."
Write-Host "Alert snapshot path: $output"
