[CmdletBinding()]
param(
  [ValidateSet('quick', '30m', '60m')]
  [string]$Profile = 'quick',
  [string]$OutputDirectory = '.\pilot-acceptance',
  [switch]$RunRestoreDrill,
  [switch]$RunWindowsServiceRestart,
  [switch]$RunFullOperationalGate,
  [switch]$SkipHardwareSimulation,
  [switch]$SkipShiftGate,
  [switch]$RequirePhysicalHardware,
  [switch]$RequireExternalPenTest
)

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$outputRoot = if ([IO.Path]::IsPathRooted($OutputDirectory)) { Join-Path $OutputDirectory $stamp } else { Join-Path (Join-Path $root $OutputDirectory) $stamp }
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$checks = [Collections.Generic.List[object]]::new()

function Invoke-AcceptanceCheck {
  param(
    [string]$Name,
    [scriptblock]$Action,
    [bool]$Required = $true,
    [string]$Evidence = ''
  )
  $started = Get-Date
  try {
    $global:LASTEXITCODE = 0
    & $Action
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Exit code $LASTEXITCODE" }
    $status = 'PASS'
    $detail = 'Completed successfully.'
  } catch {
    $status = if ($Required) { 'FAIL' } else { 'OPEN' }
    $detail = $_.Exception.Message
  }
  $checks.Add([pscustomobject]@{
    name = $Name
    status = $status
    required = $Required
    startedAt = $started.ToUniversalTime().ToString('o')
    durationMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds)
    detail = $detail
    evidence = $Evidence
  })
}

function Add-OpenBoundary {
  param([string]$Name, [string]$Detail, [bool]$Required)
  $checks.Add([pscustomobject]@{
    name = $Name
    status = if ($Required) { 'FAIL' } else { 'OPEN' }
    required = $Required
    startedAt = $null
    durationMs = 0
    detail = $Detail
    evidence = ''
  })
}

Invoke-AcceptanceCheck 'pilot_preflight' {
  $preflight = @{
    OutputPath = (Join-Path $outputRoot 'preflight.json')
    RequireDocker = $RunRestoreDrill
    RequireAdministrator = $RunWindowsServiceRestart
    RequireWinSw = $RunWindowsServiceRestart
    RequireProductionEnvironment = $RunWindowsServiceRestart
  }
  & (Join-Path $root 'scripts\Test-AardvarklandPilotPreflight.ps1') @preflight
} $true (Join-Path $outputRoot 'preflight.json')

if ($RunFullOperationalGate) {
  Invoke-AcceptanceCheck 'operational_gate' {
    & (Join-Path $root 'scripts\Invoke-AardvarklandOperationalGate.ps1') -HardwareSimulation
  }
} else {
  Invoke-AcceptanceCheck 'backend_verify' { Push-Location (Join-Path $root 'backend'); try { npm run verify } finally { Pop-Location } }
  Invoke-AcceptanceCheck 'frontend_verify' { Push-Location (Join-Path $root 'frontend'); try { npm run typecheck; npm run lint; npm test; npm run build } finally { Pop-Location } }
  Invoke-AcceptanceCheck 'print_agent_verify' { Push-Location (Join-Path $root 'print-agent'); try { npm run check } finally { Pop-Location } }
}

if ($RunRestoreDrill) {
  Invoke-AcceptanceCheck 'backup_restore_drill' {
    & (Join-Path $root 'scripts\Invoke-AardvarklandBackupDrill.ps1') -RestoreDrill
  } $true (Join-Path $root 'backend\.runtime\backup-status.json')
} else {
  Add-OpenBoundary 'backup_restore_drill' 'Not executed. Run with -RunRestoreDrill on a machine with the production-like PostgreSQL container.' $false
}

if ($RunWindowsServiceRestart) {
  Invoke-AcceptanceCheck 'windows_service_restart' {
    & (Join-Path $root 'scripts\Install-AardvarklandWindowsServices.ps1') -Action Restart -IncludePrintAgent
    Start-Sleep -Seconds 5
    & (Join-Path $root 'scripts\Test-AardvarklandBackendAlerts.ps1') -Strict -OutputPath (Join-Path $outputRoot 'post-restart-health.json')
  } $true (Join-Path $outputRoot 'post-restart-health.json')
} else {
  Add-OpenBoundary 'windows_service_restart' 'Service installer is implemented, but restart acceptance was not requested for this run.' $false
}

if (-not $SkipHardwareSimulation) {
  Invoke-AcceptanceCheck 'hardware_simulation' {
    Push-Location (Join-Path $root 'MCP')
    try { npm run hardware:sim -- --render-mode=offline --screenshots=false } finally { Pop-Location }
  }
}

if (-not $SkipShiftGate) {
  $gate = if ($Profile -eq '60m') { 'shift:gate60' } elseif ($Profile -eq '30m') { 'shift:gate30' } else { $null }
  if ($gate) {
    Invoke-AcceptanceCheck 'shift_readiness_gate' {
      Push-Location (Join-Path $root 'MCP')
      try { npm run $gate } finally { Pop-Location }
    }
  } else {
    Invoke-AcceptanceCheck 'shift_quick_gate' {
      Push-Location (Join-Path $root 'MCP')
      try {
        node run-shift-stress.mjs --duration-minutes=1 --worker-count=10 --run-mode=persistent --screenshots=false --audit=false --hardware-lab=true --reset-database=true
      } finally { Pop-Location }
    }
  }
}

Add-OpenBoundary 'physical_scanner' 'Requires a real USB/Bluetooth scanner or accepted Zebra DataWedge terminal.' $RequirePhysicalHardware
Add-OpenBoundary 'physical_printer_and_rescan' 'Requires a real ZPL printer and scanning the printed QR/barcode back into WMS.' $RequirePhysicalHardware
Add-OpenBoundary 'external_penetration_test' 'Requires an independent security tester and an agreed production-like target.' $RequireExternalPenTest
Add-OpenBoundary 'operator_alert_acceptance' 'Requires a named pilot operator to acknowledge the alert channel and escalation path.' $false

$failures = @($checks | Where-Object status -eq 'FAIL')
$passes = @($checks | Where-Object status -eq 'PASS')
$open = @($checks | Where-Object status -eq 'OPEN')
$report = [ordered]@{
  schemaVersion = 1
  product = 'Aardvarkland WMS'
  profile = $Profile
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  status = if ($failures.Count) { 'FAIL' } elseif ($open.Count) { 'CONDITIONAL_PASS' } else { 'PASS' }
  summary = [ordered]@{ passed = $passes.Count; failed = $failures.Count; open = $open.Count }
  checks = $checks
}
$reportPath = Join-Path $outputRoot 'pilot-acceptance.json'
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $reportPath -Encoding utf8
$hash = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
[ordered]@{
  report = $reportPath
  sha256 = $hash
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputRoot 'pilot-acceptance.sha256.json') -Encoding utf8

Write-Host "Pilot acceptance: $($report.status)"
Write-Host "Report: $reportPath"
Write-Host "SHA256: $hash"
if ($failures.Count) { exit 2 }
