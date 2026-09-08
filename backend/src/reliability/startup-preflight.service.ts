import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import { Env } from '../config';
import { PrismaService } from '../database';
import { ReliabilityCheck } from './reliability.types';

export interface StartupPreflightSnapshot {
  status: 'ok' | 'degraded' | 'fail';
  strict: boolean;
  checkedAt: string;
  checks: ReliabilityCheck[];
}

const REQUIRED_TABLES = [
  'warehouses',
  'users',
  'roles',
  'permissions',
  'stock_quants',
  'stock_movements',
  'reservations',
  'outbox_events',
  'integration_dead_letters',
  'label_print_jobs',
  'mfa_totp_secrets',
  'operational_alert_deliveries',
  'operational_incident_states',
  'wms_print_agents',
  'wms_print_jobs',
  'wms_scan_events',
] as const;

const REQUIRED_INDEXES = [
  'outbox_events_status_available_at_idx',
  'outbox_events_status_created_at_idx',
  'label_print_jobs_status_created_at_idx',
  'warehouse_tasks_warehouse_id_type_status_priority_idx',
  'stock_quants_warehouse_id_sku_id_status_idx',
  'audit_logs_action_created_at_idx',
  'integration_dead_letters_status_created_at_idx',
  'integration_dispatch_logs_success_created_at_idx',
  'operational_alert_deliveries_seen_idx',
  'operational_incident_states_status_updated_at_idx',
  'wms_print_jobs_queue_idx',
  'wms_print_jobs_claim_lease_idx',
  'wms_print_jobs_idempotency_key_idx',
  'wms_print_agents_status_idx',
  'wms_scan_events_created_idx',
] as const;

const REQUIRED_PERMISSIONS = [
  'warehouse.read',
  'inventory.read',
  'outbox.read',
  'metrics.read',
  'integrity.read',
  'job.read',
  'job.manage',
] as const;

@Injectable()
export class StartupPreflightService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupPreflightService.name);
  private snapshot: StartupPreflightSnapshot | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const snapshot = await this.runChecks();
    this.snapshot = snapshot;

    if (snapshot.status === 'fail' && snapshot.strict) {
      throw new Error(`Startup preflight failed: ${snapshot.checks.filter((check) => check.status === 'fail').map((check) => check.name).join(', ')}`);
    }

    if (snapshot.status !== 'ok') {
      this.logger.warn(`Startup preflight completed with status=${snapshot.status}`);
    }
  }

  getSnapshot(): StartupPreflightSnapshot | null {
    return this.snapshot;
  }

  async refresh(): Promise<StartupPreflightSnapshot> {
    this.snapshot = await this.runChecks();
    return this.snapshot;
  }

  private async runChecks(): Promise<StartupPreflightSnapshot> {
    const checks: ReliabilityCheck[] = [];
    const strict = this.config.get('STARTUP_PREFLIGHT_STRICT', { infer: true });

    await this.checkDatabase(checks);
    await this.checkRequiredTables(checks);
    await this.checkRequiredIndexes(checks);
    await this.checkMigrations(checks);
    await this.checkPermissions(checks);
    this.checkBackupPath(checks);

    const hasFail = checks.some((check) => check.status === 'fail');
    const hasWarn = checks.some((check) => check.status === 'warn');

    return {
      status: hasFail ? 'fail' : hasWarn ? 'degraded' : 'ok',
      strict,
      checkedAt: new Date().toISOString(),
      checks,
    };
  }

  private async checkRequiredIndexes(checks: ReliabilityCheck[]): Promise<void> {
    const started = Date.now();
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ index_name: string; exists: boolean }>>(
        `SELECT index_name,
                to_regclass('public.' || index_name) IS NOT NULL AS exists
         FROM unnest($1::text[]) AS index_name`,
        REQUIRED_INDEXES,
      );
      const missing = rows.filter((row) => !row.exists).map((row) => row.index_name);
      checks.push({
        name: 'requiredIndexes',
        status: missing.length ? 'warn' : 'ok',
        latencyMs: Date.now() - started,
        missing,
      });
    } catch (error: unknown) {
      checks.push({
        name: 'requiredIndexes',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Required index preflight failed.',
      });
    }
  }

  private async checkDatabase(checks: ReliabilityCheck[]): Promise<void> {
    const started = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      checks.push({ name: 'database', status: 'ok', latencyMs: Date.now() - started });
    } catch (error: unknown) {
      checks.push({
        name: 'database',
        status: 'fail',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Database preflight failed.',
      });
    }
  }

  private async checkRequiredTables(checks: ReliabilityCheck[]): Promise<void> {
    const started = Date.now();
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ table_name: string; exists: boolean }>>(
        `SELECT table_name,
                to_regclass('public.' || table_name) IS NOT NULL AS exists
         FROM unnest($1::text[]) AS table_name`,
        REQUIRED_TABLES,
      );
      const missing = rows.filter((row) => !row.exists).map((row) => row.table_name);
      checks.push({
        name: 'requiredTables',
        status: missing.length ? 'fail' : 'ok',
        latencyMs: Date.now() - started,
        missing,
      });
    } catch (error: unknown) {
      checks.push({
        name: 'requiredTables',
        status: 'fail',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Required table preflight failed.',
      });
    }
  }

  private async checkMigrations(checks: ReliabilityCheck[]): Promise<void> {
    const started = Date.now();
    try {
      const tableRows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists",
      );
      if (tableRows[0]?.exists !== true) {
        checks.push({ name: 'migrations', status: 'fail', latencyMs: Date.now() - started, detail: '_prisma_migrations table is missing.' });
        return;
      }

      const rows = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | string | null; rolled_back: unknown }>>(
        `SELECT migration_name, finished_at, rolled_back_at IS NOT NULL AS rolled_back
         FROM _prisma_migrations
         ORDER BY COALESCE(finished_at, started_at) DESC
         LIMIT 1`,
      );
      const latest = rows[0] ?? null;
      checks.push({
        name: 'migrations',
        status: latest && !latest.rolled_back && latest.finished_at ? 'ok' : 'warn',
        latencyMs: Date.now() - started,
        latestMigration: latest?.migration_name ?? null,
        latestFinishedAt: toIsoString(latest?.finished_at),
      });
    } catch (error: unknown) {
      checks.push({
        name: 'migrations',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Migration preflight failed.',
      });
    }
  }

  private async checkPermissions(checks: ReliabilityCheck[]): Promise<void> {
    const started = Date.now();
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ code: string }>>(
        'SELECT code FROM permissions WHERE code = ANY($1::text[])',
        REQUIRED_PERMISSIONS,
      );
      const existing = new Set(rows.map((row) => row.code));
      const missing = REQUIRED_PERMISSIONS.filter((permission) => !existing.has(permission));
      checks.push({
        name: 'corePermissions',
        status: missing.length ? 'warn' : 'ok',
        latencyMs: Date.now() - started,
        missing,
      });
    } catch (error: unknown) {
      checks.push({
        name: 'corePermissions',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Permission preflight failed.',
      });
    }
  }

  private checkBackupPath(checks: ReliabilityCheck[]): void {
    const path = this.config.get('WMS_BACKUP_STATUS_PATH', { infer: true });
    const required = this.config.get('HEALTH_REQUIRE_BACKUP_STATUS', { infer: true });
    const absolute = resolve(path);
    const directory = dirname(absolute);
    const exists = existsSync(directory);
    checks.push({
      name: 'backupStatusPath',
      status: exists || !required ? 'ok' : 'warn',
      path,
      directory,
      directoryExists: exists,
      required,
    });
  }
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
