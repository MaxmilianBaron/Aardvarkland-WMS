param(
  [string]$Url,
  [int]$TimeoutSeconds = 180,
  [int]$IntervalSeconds = 2
)

if (-not $Url) {
  Write-Host 'Missing URL.'
  exit 1
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
      Write-Host ($Url + ' is ready.')
      exit 0
    }
  } catch {
    Start-Sleep -Seconds $IntervalSeconds
  }
}

Write-Host ($Url + ' did not become ready in time.')
exit 1
