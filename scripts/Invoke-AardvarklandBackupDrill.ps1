param(
  [string]$PostgresContainer = 'aardvarkland-storage-postgres-prod',
  [string]$PostgresUser = 'aardvarkland',
  [string]$DatabaseName = 'aardvarkland_storage',
  [string]$BackupDirectory = '.\backups',
  [string]$RuntimeStatusPath = '.\backend\.runtime\backup-status.json',
  [switch]$RestoreDrill,
  [string]$RestoreDatabaseName = 'aardvarkland_restore_check',
  [switch]$KeepRestoreDatabase
)

$ErrorActionPreference = 'Stop'

function Get-UtcTimestamp {
  return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}

function Invoke-External {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Write-BackupStatus {
  param($Status)

  $statusParent = Split-Path -Parent $RuntimeStatusPath
  if ($statusParent) {
    New-Item -ItemType Directory -Path $statusParent -Force | Out-Null
  }

  $Status.recordedAt = Get-UtcTimestamp
  $Status | ConvertTo-Json -Depth 8 | Set-Content -Path $RuntimeStatusPath -Encoding utf8
}

function Get-CriticalEntityCounts {
  param(
    [string]$TargetDatabase
  )

  $query = @"
SELECT json_build_object(
  'warehouses', (SELECT COUNT(*) FROM warehouses),
  'users', (SELECT COUNT(*) FROM users),
  'skus', (SELECT COUNT(*) FROM skus),
  'warehouseLocations', (SELECT COUNT(*) FROM warehouse_locations),
  'stockQuants', (SELECT COUNT(*) FROM stock_quants),
  'stockMovements', (SELECT COUNT(*) FROM stock_movements),
  'reservations', (SELECT COUNT(*) FROM reservations),
  'warehouseTasks', (SELECT COUNT(*) FROM warehouse_tasks),
  'outboxEvents', (SELECT COUNT(*) FROM outbox_events),
  'auditLogs', (SELECT COUNT(*) FROM audit_logs)
);
"@
  $raw = & docker exec $PostgresContainer psql -U $PostgresUser -d $TargetDatabase -tAc $query
  if ($LASTEXITCODE -ne 0) {
    throw "Critical entity count query failed for $TargetDatabase with exit code $LASTEXITCODE."
  }
  return ($raw | Select-Object -First 1 | ConvertFrom-Json)
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI was not found. Run this on the pilot machine with Docker available.'
}

if ($RestoreDrill -and ($RestoreDatabaseName -eq $DatabaseName)) {
  throw 'RestoreDatabaseName must not match DatabaseName.'
}

New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupFileName = "$DatabaseName-$timestamp.dump"
$localBackupPath = Join-Path $BackupDirectory $backupFileName
$remoteBackupPath = "/tmp/$backupFileName"
$remoteRestorePath = "/tmp/restore-$backupFileName"

$status = [ordered]@{
  schemaVersion = 1
  recordedAt = Get-UtcTimestamp
  backup = [ordered]@{
    status = 'failed'
    completedAt = $null
    database = $DatabaseName
    artifact = $backupFileName
    sizeBytes = $null
    sha256 = $null
    source = 'docker-postgres'
    container = $PostgresContainer
    error = $null
  }
  restoreDrill = [ordered]@{
    status = if ($RestoreDrill) { 'failed' } else { 'not_run' }
    completedAt = $null
    targetDatabase = $RestoreDatabaseName
    tableCount = $null
    sourceCounts = $null
    restoredCounts = $null
    countsMatch = $null
    error = $null
  }
}

try {
  Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'pg_dump', '-U', $PostgresUser, '-d', $DatabaseName, '-Fc', '-f', $remoteBackupPath)
  Invoke-External -FilePath docker -Arguments @('cp', "${PostgresContainer}:$remoteBackupPath", $localBackupPath)
  Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'rm', '-f', $remoteBackupPath)

  $backupFile = Get-Item -LiteralPath $localBackupPath
  $backupHash = Get-FileHash -LiteralPath $localBackupPath -Algorithm SHA256
  $status.backup.status = 'ok'
  $status.backup.completedAt = Get-UtcTimestamp
  $status.backup.sizeBytes = $backupFile.Length
  $status.backup.sha256 = $backupHash.Hash.ToLowerInvariant()
  $status.backup.error = $null
  Write-BackupStatus -Status $status

  if ($RestoreDrill) {
    $sourceCounts = Get-CriticalEntityCounts -TargetDatabase $DatabaseName
    Invoke-External -FilePath docker -Arguments @('cp', $localBackupPath, "${PostgresContainer}:$remoteRestorePath")
    Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'dropdb', '--if-exists', '-U', $PostgresUser, $RestoreDatabaseName)
    Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'createdb', '-U', $PostgresUser, $RestoreDatabaseName)
    Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'pg_restore', '-U', $PostgresUser, '-d', $RestoreDatabaseName, '--clean', '--if-exists', $remoteRestorePath)

    $tableCount = & docker exec $PostgresContainer psql -U $PostgresUser -d $RestoreDatabaseName -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
    if ($LASTEXITCODE -ne 0) {
      throw "Restore smoke query failed with exit code $LASTEXITCODE."
    }
    $restoredCounts = Get-CriticalEntityCounts -TargetDatabase $RestoreDatabaseName
    $sourceCountsJson = $sourceCounts | ConvertTo-Json -Compress
    $restoredCountsJson = $restoredCounts | ConvertTo-Json -Compress
    if ($sourceCountsJson -ne $restoredCountsJson) {
      throw "Restored critical WMS entity counts do not match the source database."
    }

    $status.restoreDrill.status = 'ok'
    $status.restoreDrill.completedAt = Get-UtcTimestamp
    $status.restoreDrill.tableCount = [int]($tableCount | Select-Object -First 1)
    $status.restoreDrill.sourceCounts = $sourceCounts
    $status.restoreDrill.restoredCounts = $restoredCounts
    $status.restoreDrill.countsMatch = $true
    $status.restoreDrill.error = $null
    Write-BackupStatus -Status $status

    if (-not $KeepRestoreDatabase) {
      Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'dropdb', '--if-exists', '-U', $PostgresUser, $RestoreDatabaseName)
    }
    Invoke-External -FilePath docker -Arguments @('exec', $PostgresContainer, 'rm', '-f', $remoteRestorePath)
  }

  Write-Host "Backup status written to $RuntimeStatusPath"
  Write-Host "Backup artifact: $localBackupPath"
} catch {
  $message = $_.Exception.Message
  if ($status.backup.status -ne 'ok') {
    $status.backup.error = $message
  } elseif ($RestoreDrill -and $status.restoreDrill.status -ne 'ok') {
    $status.restoreDrill.error = $message
  }
  Write-BackupStatus -Status $status
  throw
}
