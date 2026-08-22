import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { RecoveryStatusService } from '../src/reliability/recovery-status.service';

test('recovery status reports successful backup and restore drill details', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wms-recovery-'));
  const statusPath = join(directory, 'backup-status.json');
  await writeFile(statusPath, JSON.stringify({
    schemaVersion: 1,
    recordedAt: '2026-05-25T10:00:00.000Z',
    backup: {
      status: 'ok',
      completedAt: '2026-05-25T09:00:00.000Z',
      artifact: 'backup.dump',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    },
    restoreDrill: {
      status: 'ok',
      completedAt: '2026-05-25T09:30:00.000Z',
      targetDatabase: 'aardvarkland_restore_drill',
      tableCount: 42,
    },
  }), 'utf8');

  try {
    const service = new RecoveryStatusService(config({
      WMS_BACKUP_STATUS_PATH: statusPath,
      HEALTH_BACKUP_MAX_AGE_SECONDS: 108000,
      HEALTH_REQUIRE_BACKUP_STATUS: true,
      HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS: 604800,
      HEALTH_REQUIRE_RESTORE_DRILL: true,
    }));
    const snapshot = await service.getStatus(new Date('2026-05-25T10:00:00.000Z'));

    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.backup.artifact, 'backup.dump');
    assert.equal(snapshot.backup.sizeBytes, 2048);
    assert.equal(snapshot.restoreDrill.targetDatabase, 'aardvarkland_restore_drill');
    assert.equal(snapshot.restoreDrill.tableCount, 42);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function config(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  } as never;
}
