import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ConfigService } from '@nestjs/config';

import { Env } from '../src/config/env';
import { BackupReadinessService } from '../src/health/backup-readiness.service';

test('backup readiness reports fresh backup and restore drill as healthy', async () => {
  const { service, cleanup, statusPath } = await createService();
  try {
    await writeStatus(statusPath, {
      schemaVersion: 1,
      recordedAt: '2026-05-22T10:10:00.000Z',
      backup: {
        status: 'ok',
        completedAt: '2026-05-22T10:00:00.000Z',
        artifact: 'aardvarkland_storage-20260522T100000Z.dump',
        sizeBytes: 1024,
        sha256: 'abc123',
      },
      restoreDrill: {
        status: 'ok',
        completedAt: '2026-05-22T10:05:00.000Z',
        targetDatabase: 'aardvarkland_restore_check',
      },
    });

    const snapshot = await service.getSnapshot(new Date('2026-05-22T10:10:00.000Z'));

    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.statusFile.exists, true);
    assert.equal(snapshot.statusFile.readable, true);
    assert.equal(snapshot.checks.find((check) => check.name === 'backup')?.status, 'ok');
    assert.equal(snapshot.checks.find((check) => check.name === 'backup')?.ageSeconds, 600);
    assert.equal(snapshot.checks.find((check) => check.name === 'restoreDrill')?.status, 'ok');
  } finally {
    await cleanup();
  }
});

test('backup readiness warns when required status file is missing', async () => {
  const { service, cleanup } = await createService();
  try {
    const snapshot = await service.getSnapshot(new Date('2026-05-22T10:10:00.000Z'));

    assert.equal(snapshot.status, 'degraded');
    assert.equal(snapshot.statusFile.exists, false);
    assert.equal(snapshot.checks.find((check) => check.name === 'backup')?.status, 'warn');
    assert.equal(snapshot.checks.find((check) => check.name === 'restoreDrill')?.status, 'warn');
  } finally {
    await cleanup();
  }
});

test('backup readiness allows optional restore drill to be not run', async () => {
  const { service, cleanup, statusPath } = await createService({
    HEALTH_REQUIRE_RESTORE_DRILL: false,
  });
  try {
    await writeStatus(statusPath, {
      schemaVersion: 1,
      recordedAt: '2026-05-22T10:10:00.000Z',
      backup: {
        status: 'ok',
        completedAt: '2026-05-22T10:00:00.000Z',
      },
      restoreDrill: {
        status: 'not_run',
        targetDatabase: 'aardvarkland_restore_check',
      },
    });

    const snapshot = await service.getSnapshot(new Date('2026-05-22T10:10:00.000Z'));

    assert.equal(snapshot.status, 'ok');
    assert.equal(snapshot.checks.find((check) => check.name === 'restoreDrill')?.status, 'ok');
  } finally {
    await cleanup();
  }
});

test('backup readiness warns when backup is older than threshold', async () => {
  const { service, cleanup, statusPath } = await createService({
    HEALTH_BACKUP_MAX_AGE_SECONDS: 1800,
  });
  try {
    await writeStatus(statusPath, {
      schemaVersion: 1,
      recordedAt: '2026-05-22T10:10:00.000Z',
      backup: {
        status: 'ok',
        completedAt: '2026-05-22T09:00:00.000Z',
      },
      restoreDrill: {
        status: 'ok',
        completedAt: '2026-05-22T10:00:00.000Z',
      },
    });

    const snapshot = await service.getSnapshot(new Date('2026-05-22T10:10:00.000Z'));
    const backup = snapshot.checks.find((check) => check.name === 'backup');

    assert.equal(snapshot.status, 'degraded');
    assert.equal(backup?.status, 'warn');
    assert.equal(backup?.ageSeconds, 4200);
  } finally {
    await cleanup();
  }
});

async function createService(overrides: Partial<Env> = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'wms-backup-readiness-'));
  const statusPath = join(tempDir, 'backup-status.json');
  const values: Partial<Env> = {
    WMS_BACKUP_STATUS_PATH: statusPath,
    HEALTH_BACKUP_MAX_AGE_SECONDS: 3600,
    HEALTH_REQUIRE_BACKUP_STATUS: true,
    HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS: 86400,
    HEALTH_REQUIRE_RESTORE_DRILL: true,
    ...overrides,
  };
  const config = {
    get(key: keyof Env) {
      return values[key];
    },
  } as unknown as ConfigService<Env, true>;

  return {
    statusPath,
    service: new BackupReadinessService(config),
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}

function writeStatus(path: string, value: unknown): Promise<void> {
  return writeFile(path, JSON.stringify(value), 'utf8');
}
