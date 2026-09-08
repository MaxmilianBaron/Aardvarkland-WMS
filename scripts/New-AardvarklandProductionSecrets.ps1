param(
  [int]$Bytes = 32
)

if ($Bytes -lt 32) {
  throw "Use at least 32 bytes for production secrets."
}

function New-Secret {
  param([int]$LengthBytes)
  $bytes = New-Object byte[] $LengthBytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$names = @(
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'WEBHOOK_SHARED_SECRET',
  'CARRIER_CREDENTIAL_ENCRYPTION_KEY',
  'MFA_SECRET_ENCRYPTION_KEY'
)

foreach ($name in $names) {
  "$name=`"$(New-Secret -LengthBytes $Bytes)`""
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
"JWT_KEY_ID=`"jwt-$stamp`""
"JWT_PREVIOUS_SECRETS=`"`""
"CARRIER_CREDENTIAL_ENCRYPTION_KEY_ID=`"carrier-$stamp`""
"CARRIER_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS=`"`""
"MFA_SECRET_ENCRYPTION_KEY_ID=`"mfa-$stamp`""
"MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS=`"`""
