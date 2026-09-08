import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { cwd } from 'node:process';

import { Env } from '../config/env';
import { RecoveryStatusCheck, RecoveryStatusSnapshot } from './reliability.types';

interface RecoveryStatusFile {
  schemaVersion?: unknown;
  recordedAt?: unknown;
  backup?: unknown;
  restoreDrill?: unknown;
}

interface RecoveryStatusSection {
  status?: unknown;
  completedAt?: unknown;
  artifact?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
  targetDatabase?: unknown;
  tableCount?: unknown;
}

@Injectable()
export class RecoveryStatusService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async getStatus(now = new Date()): Promise<RecoveryStatusSnapshot> {
    const path = this.resolveStatusPath();

    try {
      await access(path, fsConstants.R_OK);
    } catch {
      return this.missingSnapshot(path, now);
    }

    let parsed: RecoveryStatusFile;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8')) as RecoveryStatusFile;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'Recovery status file is not readable JSON.';
      const backup = this.missingCheck('backup', detail);
      const restoreDrill = this.missingCheck('restoreDrill', detail);
      return {
        status: 'degraded',
        generatedAt: now.toISOString(),
        statusFile: {
          configured: true,
          path,
          exists: true,
          readable: false,
          schemaVersion: null,
          recordedAt: null,
        },
        backup,
        restoreDrill,
      };
    }

    const backup = this.buildCheck('backup', parsed.backup, now);
    const restoreDrill = this.buildCheck('restoreDrill', parsed.restoreDrill, now);

    return {
      status: backup.status === 'ok' && restoreDrill.status === 'ok' ? 'ok' : 'degraded',
      generatedAt: now.toISOString(),
      statusFile: {
        configured: true,
        path,
        exists: true,
        readable: true,
        schemaVersion: toIntegerOrNull(parsed.schemaVersion),
        recordedAt: toIsoStringOrNull(parsed.recordedAt),
      },
      backup,
      restoreDrill,
    };
  }

  private missingSnapshot(path: string, now: Date): RecoveryStatusSnapshot {
    const backup = this.missingCheck('backup');
    const restoreDrill = this.missingCheck('restoreDrill');
    return {
      status: backup.status === 'ok' && restoreDrill.status === 'ok' ? 'ok' : 'degraded',
      generatedAt: now.toISOString(),
      statusFile: {
        configured: true,
        path,
        exists: false,
        readable: false,
        schemaVersion: null,
        recordedAt: null,
      },
      backup,
      restoreDrill,
    };
  }

  private buildCheck(name: 'backup' | 'restoreDrill', value: unknown, now: Date): RecoveryStatusCheck {
    const section = asSection(value);
    if (!section) {
      return this.missingCheck(name);
    }

    const completedAt = toIsoStringOrNull(section.completedAt);
    const maxAgeSeconds = name === 'backup'
      ? this.config.get('HEALTH_BACKUP_MAX_AGE_SECONDS', { infer: true })
      : this.config.get('HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS', { infer: true });
    const required = this.isRequired(name);
    const ageSeconds = completedAt ? ageSecondsSince(completedAt, now) : null;
    const stale = ageSeconds !== null && ageSeconds > maxAgeSeconds;
    const normalizedStatus = normalizeStatus(section.status);
    const ok = normalizedStatus === 'ok' && Boolean(completedAt) && !stale;

    return {
      status: ok || (!required && normalizedStatus === 'not_run') ? 'ok' : 'warn',
      required,
      maxAgeSeconds,
      ageSeconds,
      lastSuccessfulAt: completedAt,
      detail: buildDetail(name, normalizedStatus, completedAt, stale, required),
      artifact: toStringOrNull(section.artifact),
      sizeBytes: toIntegerOrNull(section.sizeBytes),
      sha256: toStringOrNull(section.sha256),
      targetDatabase: toStringOrNull(section.targetDatabase),
      tableCount: toIntegerOrNull(section.tableCount),
    };
  }

  private missingCheck(name: 'backup' | 'restoreDrill', detail?: string): RecoveryStatusCheck {
    const required = this.isRequired(name);
    return {
      status: required ? 'warn' : 'ok',
      required,
      maxAgeSeconds: name === 'backup'
        ? this.config.get('HEALTH_BACKUP_MAX_AGE_SECONDS', { infer: true })
        : this.config.get('HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS', { infer: true }),
      ageSeconds: null,
      lastSuccessfulAt: null,
      detail: detail ?? (required
        ? `No successful ${name === 'backup' ? 'backup' : 'restore drill'} has been recorded.`
        : `${name === 'backup' ? 'Backup' : 'Restore drill'} status is optional in this environment.`),
      artifact: null,
      sizeBytes: null,
      sha256: null,
      targetDatabase: null,
      tableCount: null,
    };
  }

  private isRequired(name: 'backup' | 'restoreDrill'): boolean {
    return name === 'backup'
      ? this.config.get('HEALTH_REQUIRE_BACKUP_STATUS', { infer: true })
      : this.config.get('HEALTH_REQUIRE_RESTORE_DRILL', { infer: true });
  }

  private resolveStatusPath(): string {
    const configured = this.config.get('WMS_BACKUP_STATUS_PATH', { infer: true });
    return isAbsolute(configured) ? configured : resolve(cwd(), configured);
  }
}

function asSection(value: unknown): RecoveryStatusSection | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecoveryStatusSection)
    : null;
}

function normalizeStatus(value: unknown): 'ok' | 'failed' | 'not_run' | 'unknown' {
  if (typeof value !== 'string') {
    return 'unknown';
  }
  const normalized = value.trim().toLowerCase();
  if (['ok', 'success', 'succeeded', 'completed', 'passed'].includes(normalized)) {
    return 'ok';
  }
  if (['fail', 'failed', 'error'].includes(normalized)) {
    return 'failed';
  }
  if (['not_run', 'not-run', 'skipped', 'pending'].includes(normalized)) {
    return 'not_run';
  }
  return 'unknown';
}

function buildDetail(
  name: 'backup' | 'restoreDrill',
  normalizedStatus: string,
  completedAt: string | null,
  stale: boolean,
  required: boolean,
): string | null {
  const label = name === 'backup' ? 'Backup' : 'Restore drill';
  if (normalizedStatus === 'not_run' && !required) {
    return `${label} has not been run and is optional in this environment.`;
  }
  if (normalizedStatus !== 'ok') {
    return `${label} status is not successful.`;
  }
  if (!completedAt) {
    return `${label} is missing a completion timestamp.`;
  }
  if (stale) {
    return `${label} is older than the configured readiness threshold.`;
  }
  return null;
}

function ageSecondsSince(isoDate: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(isoDate).getTime()) / 1000));
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toIntegerOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
