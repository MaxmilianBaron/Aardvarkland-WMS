param(
  [Parameter(Mandatory = $true)]
  [string]$UserEmail,

  [string]$DatabaseUrl = $env:DATABASE_URL,

  [string]$Reason = "Local administrator break-glass recovery",

  [string]$LocalOperator = $env:USERNAME
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL is required. Pass -DatabaseUrl or set the DATABASE_URL environment variable."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql was not found in PATH. Run this on the database host or use a shell where PostgreSQL client tools are available."
}

$auditId = [guid]::NewGuid().ToString()
$sql = @"
\set ON_ERROR_STOP on
BEGIN;

WITH target_user AS (
  SELECT id, email
  FROM users
  WHERE lower(email) = lower(:'user_email')
  LIMIT 1
),
disabled AS (
  UPDATE mfa_totp_secrets
  SET disabled_at = NOW(), updated_at = NOW()
  WHERE user_id = (SELECT id FROM target_user)
    AND disabled_at IS NULL
  RETURNING id
),
session_bump AS (
  UPDATE users
  SET session_version = session_version + 1, updated_at = NOW()
  WHERE id = (SELECT id FROM target_user)
  RETURNING id
)
INSERT INTO audit_logs (id, actor_user_id, warehouse_id, action, resource_type, resource_id, metadata, created_at)
SELECT
  :'audit_id'::uuid,
  NULL,
  NULL,
  'auth.mfa_break_glass_disabled',
  'user',
  target_user.id::text,
  jsonb_build_object(
    'userEmail', target_user.email,
    'disabledSecrets', (SELECT count(*) FROM disabled),
    'sessionsInvalidated', EXISTS (SELECT 1 FROM session_bump),
    'reason', :'reason',
    'localOperator', :'local_operator',
    'host', :'host'
  ),
  NOW()
FROM target_user;

COMMIT;
"@

$tempFile = New-TemporaryFile
try {
  Set-Content -LiteralPath $tempFile.FullName -Value $sql -Encoding UTF8
  & psql $DatabaseUrl `
    -v "user_email=$UserEmail" `
    -v "audit_id=$auditId" `
    -v "reason=$Reason" `
    -v "local_operator=$LocalOperator" `
    -v "host=$env:COMPUTERNAME" `
    -f $tempFile.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Break-glass SQL failed with exit code $LASTEXITCODE."
  }
  Write-Host "MFA break-glass completed for $UserEmail. Audit id: $auditId"
}
finally {
  Remove-Item -LiteralPath $tempFile.FullName -Force -ErrorAction SilentlyContinue
}
