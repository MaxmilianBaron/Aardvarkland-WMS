param(
  [string]$TaskName = 'Aardvarkland WMS Backup Restore Drill',
  [string]$At = '03:00',
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$PostgresContainer = 'aardvarkland-storage-postgres-prod',
  [string]$PostgresUser = 'aardvarkland',
  [string]$DatabaseName = 'aardvarkland_storage'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
  throw 'Register-ScheduledTask is not available on this Windows installation.'
}

$drillScript = Join-Path $ProjectRoot 'scripts\Invoke-AardvarklandBackupDrill.ps1'
if (-not (Test-Path -LiteralPath $drillScript)) {
  throw "Backup drill script was not found at $drillScript"
}

$atTime = [DateTime]::ParseExact($At, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$drillScript`"",
  '-RestoreDrill',
  '-PostgresContainer', "`"$PostgresContainer`"",
  '-PostgresUser', "`"$PostgresUser`"",
  '-DatabaseName', "`"$DatabaseName`""
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $atTime
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Runs Aardvarkland WMS pg_dump and non-production restore drill, then updates backend readiness manifest.' `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' at $At."
