param(
  [switch]$ApplyMigrations,
  [switch]$LiveApiE2e,
  [switch]$SkipFrontend,
  [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string[]]$Command
  )

  Write-Host ""
  Write-Host "== $Name =="
  Push-Location $WorkingDirectory
  try {
    $exe = $Command[0]
    [string[]]$arguments = if ($Command.Length -gt 1) { @($Command[1..($Command.Length - 1)]) } else { @() }
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Name failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

function Invoke-NpmAuditStep {
  param(
    [string]$Name,
    [string]$WorkingDirectory
  )

  $previousNodeOptions = $env:NODE_OPTIONS
  $currentNodeOptions = if ($null -eq $env:NODE_OPTIONS) { "" } else { $env:NODE_OPTIONS }
  if ($currentNodeOptions -notmatch "(^| )--use-system-ca( |$)") {
    $env:NODE_OPTIONS = ($currentNodeOptions + " --use-system-ca").Trim()
  }
  try {
    Invoke-Step $Name $WorkingDirectory @("npm", "audit", "--audit-level=high")
  }
  finally {
    $env:NODE_OPTIONS = $previousNodeOptions
  }
}

$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Invoke-Step "Backend Prisma generate" $backend @("npm", "run", "prisma:generate")

if ($ApplyMigrations) {
  Invoke-Step "Backend Prisma migrate deploy" $backend @("npm", "run", "prisma:deploy")
}
else {
  Invoke-Step "Backend Prisma migrate status" $backend @("npm", "run", "prisma:status")
}

Invoke-Step "Backend permission seed check" $backend @("npm", "run", "permissions:check")
Invoke-Step "Backend verify" $backend @("npm", "run", "verify")
if ($LiveApiE2e) {
  Invoke-Step "Backend live API E2E" $backend @("npm", "run", "test:e2e:live")
}
Invoke-Step "Backend OpenAPI export" $backend @("npm", "run", "openapi:export")
Invoke-Step "Frontend OpenAPI contract check" $root @("node", "scripts/Check-AardvarklandFrontendOpenApiContract.mjs")

if (-not $SkipAudit) {
  Invoke-NpmAuditStep "Backend npm audit" $backend
}

$gitRoot = $null
try {
  $gitRoot = (& git -C $root rev-parse --show-toplevel 2>$null)
}
catch {
  $gitRoot = $null
}

if ($gitRoot) {
  & git -C $root diff --exit-code -- backend/openapi.json
  if ($LASTEXITCODE -ne 0) {
    throw "OpenAPI export changed backend/openapi.json. Commit the updated API contract with the backend change."
  }
}

if (-not $SkipFrontend) {
  Invoke-Step "Frontend typecheck" $frontend @("npm", "run", "typecheck")
  Invoke-Step "Frontend lint" $frontend @("npm", "run", "lint")
  Invoke-Step "Frontend test" $frontend @("npm", "test")
  Invoke-Step "Frontend build" $frontend @("npm", "run", "build")
  if (-not $SkipAudit) {
    Invoke-NpmAuditStep "Frontend npm audit" $frontend
  }
}

Write-Host ""
Write-Host "Operational gate completed successfully."
