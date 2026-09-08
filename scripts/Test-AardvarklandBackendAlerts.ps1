[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://127.0.0.1:4001/api',
  [string]$OutputPath = '.\logs\backend-alert-status.json',
  [string]$BearerToken = '',
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'

function Invoke-Json {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers = @{}
  )

  try {
    Invoke-RestMethod -Uri $Url -Headers $Headers -TimeoutSec 15
  } catch {
    [pscustomobject]@{
      status = 'fail'
      error = $_.Exception.Message
      url = $Url
    }
  }
}

$headers = @{}
if ($BearerToken.Trim().Length -gt 0) {
  $headers['Authorization'] = "Bearer $BearerToken"
}

$base = $ApiBaseUrl.TrimEnd('/')
$startup = Invoke-Json -Url "$base/health/startup"
$ready = Invoke-Json -Url "$base/health/ready"
$alerts = $null
if ($headers.Count -gt 0) {
  $alerts = Invoke-Json -Url "$base/operations/reliability/alerts" -Headers $headers
}

$statuses = @($startup.status, $ready.status)
if ($alerts -ne $null) {
  $statuses += $alerts.status
}

$overall = if ($statuses -contains 'fail') {
  'fail'
} elseif ($statuses -contains 'degraded') {
  'degraded'
} else {
  'ok'
}

$result = [pscustomobject]@{
  status = $overall
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  apiBaseUrl = $base
  startup = $startup
  readiness = $ready
  protectedAlerts = $alerts
}

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resolvedOutputPath -Encoding UTF8

if ($Strict -and $overall -ne 'ok') {
  Write-Error "Aardvarkland backend alert status is $overall. See $resolvedOutputPath."
}

if ($overall -eq 'ok') {
  exit 0
}

exit 2
