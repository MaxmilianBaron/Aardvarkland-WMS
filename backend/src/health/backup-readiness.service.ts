import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { cwd } from 'node:process';

import { Env } from '../config/env';

export interface BackupReadinessCheck {
  name: 'backup' | 'restoreDrill';
  status: 'ok' | 'warn';
  required: boolean;
  maxAgeSeconds: number;
  ageSeconds: number | null;
  lastSuccessfulAt: string | null;
  detail?: string;
  artifact?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  targetDatabase?: string | null;
  [key: string]: unknown;
}

export interface BackupReadinessSnapshot {
  status: 'ok' | 'degraded';
  timestamp: string;
  statusFile: {
    configured: boolean;
    exists: boolean;
    readable: boolean;
    schemaVersion: number | null;
    recordedAt: string | null;
  };
  checks: BackupReadinessCheck[];
}

interface BackupStatusFile {
  schemaVersion?: unknown;
  recordedAt?: unknown;
  backup?: unknown;
  restoreDrill?: unknown;
}

interface BackupStatusSection {
  status?: unknown;
  completedAt?: unknown;
  artifact?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
}

interface RestoreStatusSection {
  status?: unknown;
  completedAt?: unknown;
  targetDatabase?: unknown;
}

@Injectable()
export class BackupReadinessService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async getSnapshot(now = new Date()): Promise<BackupReadinessSnapshot> {
    const statusPath = this.resolveStatusPath();
    const missingSnapshot = this.missingSnapshot(now);

    let parsed: BackupStatusFile;
    try {
      parsed = JSON.parse(await readFile(statusPath, 'utf8')) as BackupStatusFile;
    } catch (error: unknown) {
      if (isMissingFileError(error)) {
        return missingSnapshot;
      }

      const checks = this.buildParseFailureChecks(now, error);
      return {
        status: 'degraded',
        timestamp: now.toISOString(),
        statusFile: {
          configured: true,
          exists: true,
          readable: false,
          schemaVersion: null,
          recordedAt: null,
        },
        checks,
      };
    }

    const checks = [
      this.buildBackupCheck(parsed.backup, now),
      this.buildRestoreDrillCheck(parsed.restoreDrill, now),
    ];

    return {
      status: checks.some((check) => check.status !== 'ok') ? 'degraded' : 'ok',
      timestamp: now.toISOString(),
      statusFile: {
        configured: true,
        exists: true,
        readable: true,
        schemaVersion: toIntegerOrNull(parsed.schemaVersion),
        recordedAt: toIsoStringOrNull(parsed.recordedAt),
      },
      checks,
    };
  }

  async getChecks(now = new Date()): Promise<BackupReadinessCheck[]> {
    return (await this.getSnapshot(now)).checks;
  }

  private missingSnapshot(now: Date): BackupReadinessSnapshot {
    const checks = [
      this.missingBackupCheck(),
      this.missingRestoreDrillCheck(),
    ];

    return {
      status: checks.some((check) => check.status !== 'ok') ? 'degraded' : 'ok',
      timestamp: now.toISOString(),
      statusFile: {
        configured: true,
        exists: false,
        readable: false,
        schemaVersion: null,
        recordedAt: null,
      },
      checks,
    };
  }

  private buildParseFailureChecks(now: Date, error: unknown): BackupReadinessCheck[] {
    const detail = error instanceof Error ? error.message : 'Backup status file could not be read.';

    return [
      {
        name: 'backup',
        status: 'warn',
        required: this.requireBackupStatus(),
        maxAgeSeconds: this.backupMaxAgeSeconds(),
        ageSeconds: null,
        lastSuccessfulAt: null,
        detail,
      },
      {
        name: 'restoreDrill',
        status: this.requireRestoreDrill() ? 'warn' : 'ok',
        required: this.requireRestoreDrill(),
        maxAgeSeconds: this.restoreDrillMaxAgeSeconds(),
        ageSeconds: null,
        lastSuccessfulAt: null,
        detail: this.requireRestoreDrill()
          ? detail
          : `Restore drill is not required. Status checked at ${now.toISOString()}.`,
      },
    ];
  }

  private buildBackupCheck(value: unknown, now: Date): BackupReadinessCheck {
    const required = this.requireBackupStatus();
    const maxAgeSeconds = this.backupMaxAgeSeconds();
    const section = asBackupStatusSection(value);

    if (!section) {
      return this.missingBackupCheck();
    }

    const completedAt = toIsoStringOrNull(section.completedAt);
    const ageSeconds = completedAt ? ageSecondsSince(completedAt, now) : null;
    const normalizedStatus = normalizeStatus(section.status);
    const stale = ageSeconds !== null && ageSeconds > maxAgeSeconds;
    const status = normalizedStatus === 'ok' && completedAt && !stale ? 'ok' : 'warn';

    return {
      name: 'backup',
      status,
      required,
      maxAgeSeconds,
      ageSeconds,
      lastSuccessfulAt: completedAt,
      artifact: toStringOrNull(section.artifact),
      sizeBytes: toIntegerOrNull(section.sizeBytes),
      sha256: toStringOrNull(section.sha256),
      detail: backupDetail({ normalizedStatus, completedAt, stale, required }),
    };
  }

  private buildRestoreDrillCheck(value: unknown, now: Date): BackupReadinessCheck {
    const required = this.requireRestoreDrill();
    const maxAgeSeconds = this.restoreDrillMaxAgeSeconds();
    const section = asRestoreStatusSection(value);

    if (!section) {
      return this.missingRestoreDrillCheck();
    }

    const completedAt = toIsoStringOrNull(section.completedAt);
    const ageSeconds = completedAt ? ageSecondsSince(completedAt, now) : null;
    const normalizedStatus = normalizeStatus(section.status);
    const stale = ageSeconds !== null && ageSeconds > maxAgeSeconds;
    const status = normalizedStatus === 'ok' && completedAt && !stale
      ? 'ok'
      : normalizedStatus === 'not_run' && !required
        ? 'ok'
        : 'warn';

    return {
      name: 'restoreDrill',
      status,
      required,
      maxAgeSeconds,
      ageSeconds,
      lastSuccessfulAt: completedAt,
      targetDatabase: toStringOrNull(section.targetDatabase),
      detail: restoreDrillDetail({ normalizedStatus, completedAt, stale, required }),
    };
  }

  private missingBackupCheck(): BackupReadinessCheck {
    const required = this.requireBackupStatus();

    return {
      name: 'backup',
      status: required ? 'warn' : 'ok',
      required,
      maxAgeSeconds: this.backupMaxAgeSeconds(),
      ageSeconds: null,
      lastSuccessfulAt: null,
      detail: required
        ? 'No backup status file has been recorded.'
        : 'Backup status is not required for this environment.',
    };
  }

  private missingRestoreDrillCheck(): BackupReadinessCheck {
    const required = this.requireRestoreDrill();

    return {
      name: 'restoreDrill',
      status: required ? 'warn' : 'ok',
      required,
      maxAgeSeconds: this.restoreDrillMaxAgeSeconds(),
      ageSeconds: null,
      lastSuccessfulAt: null,
      detail: required
        ? 'No restore drill has been recorded.'
        : 'Restore drill is not required for this environment.',
    };
  }

  private resolveStatusPath(): string {
    const configured = this.config.get('WMS_BACKUP_STATUS_PATH', { infer: true });
    return isAbsolute(configured) ? configured : resolve(cwd(), configured);
  }

  private backupMaxAgeSeconds(): number {
    return this.config.get('HEALTH_BACKUP_MAX_AGE_SECONDS', { infer: true });
  }

  private restoreDrillMaxAgeSeconds(): number {
    return this.config.get('HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS', { infer: true });
  }

  private requireBackupStatus(): boolean {
    return this.config.get('HEALTH_REQUIRE_BACKUP_STATUS', { infer: true });
  }

  private requireRestoreDrill(): boolean {
    return this.config.get('HEALTH_REQUIRE_RESTORE_DRILL', { infer: true });
  }
}

function asBackupStatusSection(value: unknown): BackupStatusSection | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as BackupStatusSection)
    : null;
}

function asRestoreStatusSection(value: unknown): RestoreStatusSection | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RestoreStatusSection)
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

function ageSecondsSince(isoDate: string, now: Date): number {
  const timestamp = new Date(isoDate).getTime();
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toIntegerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function backupDetail(input: {
  normalizedStatus: string;
  completedAt: string | null;
  stale: boolean;
  required: boolean;
}): string | undefined {
  if (input.normalizedStatus !== 'ok') {
    return 'Latest backup status is not successful.';
  }
  if (!input.completedAt) {
    return 'Latest backup is missing a completion timestamp.';
  }
  if (input.stale) {
    return 'Latest backup is older than the configured readiness threshold.';
  }
  if (!input.required) {
    return 'Backup status is optional in this environment and currently healthy.';
  }
  return undefined;
}

function restoreDrillDetail(input: {
  normalizedStatus: string;
  completedAt: string | null;
  stale: boolean;
  required: boolean;
}): string | undefined {
  if (input.normalizedStatus !== 'ok') {
    if (input.normalizedStatus === 'not_run' && !input.required) {
      return 'Restore drill has not been run and is optional in this environment.';
    }
    return input.required
      ? 'Latest restore drill status is not successful.'
      : 'Restore drill status is optional in this environment.';
  }
  if (!input.completedAt) {
    return input.required
      ? 'Latest restore drill is missing a completion timestamp.'
      : 'Restore drill timestamp is optional in this environment.';
  }
  if (input.stale) {
    return input.required
      ? 'Latest restore drill is older than the configured readiness threshold.'
      : 'Restore drill is older than the optional readiness threshold.';
  }
  return undefined;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
