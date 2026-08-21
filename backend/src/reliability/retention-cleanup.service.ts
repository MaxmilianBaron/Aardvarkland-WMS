import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from '../config';
import { PrismaService } from '../database';
import {
  RetentionCleanupItem,
  RetentionCleanupResult,
  RetentionCleanupStatus,
} from './reliability.types';

interface RetentionPolicy {
  key: string;
  table: string;
  idColumn: string;
  description: string;
  retentionDays: number;
  cutoff: Date;
  whereSql: string;
  orderBy: string;
  optionalTable?: boolean;
}

export interface RunRetentionCleanupInput {
  dryRun?: boolean;
  batchSize?: number;
}

@Injectable()
export class RetentionCleanupService {
  private readonly logger = new Logger(RetentionCleanupService.name);
  private lastRun: RetentionCleanupResult | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  getScheduleSnapshot() {
    return {
      enabled: this.config.get('RETENTION_CLEANUP_ENABLED', { infer: true }),
      intervalSeconds: this.config.get('RETENTION_CLEANUP_INTERVAL_SECONDS', { infer: true }),
      batchSize: this.config.get('RETENTION_CLEANUP_BATCH_SIZE', { infer: true }),
      lastRun: this.lastRun,
    };
  }

  async getStatus(): Promise<RetentionCleanupStatus> {
    return {
      ...this.getScheduleSnapshot(),
      preview: await this.runCleanup({ dryRun: true }),
    };
  }

  async runCleanup(input: RunRetentionCleanupInput = {}): Promise<RetentionCleanupResult> {
    const dryRun = input.dryRun ?? true;
    const batchSize = normalizeBatchSize(input.batchSize, this.config.get('RETENTION_CLEANUP_BATCH_SIZE', { infer: true }));
    const enabled = this.config.get('RETENTION_CLEANUP_ENABLED', { infer: true });
    const startedAt = new Date();
    const items: RetentionCleanupItem[] = [];

    for (const policy of this.buildPolicies()) {
      const item = await this.evaluatePolicy(policy, dryRun, batchSize);
      items.push(item);
    }

    const result: RetentionCleanupResult = {
      dryRun,
      enabled,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      batchSize,
      totalEligible: items.reduce((total, item) => total + item.eligibleCount, 0),
      totalDeleted: items.reduce((total, item) => total + item.deletedCount, 0),
      items,
    };

    if (!dryRun) {
      this.lastRun = result;
      this.logger.log(`retention cleanup deleted=${result.totalDeleted} eligible=${result.totalEligible}`);
    }

    return result;
  }

  private async evaluatePolicy(policy: RetentionPolicy, dryRun: boolean, batchSize: number): Promise<RetentionCleanupItem> {
    if (policy.optionalTable && !(await this.tableExists(policy.table))) {
      return {
        key: policy.key,
        table: policy.table,
        description: policy.description,
        retentionDays: policy.retentionDays,
        cutoff: policy.cutoff.toISOString(),
        eligibleCount: 0,
        deletedCount: 0,
        skipped: true,
        skipReason: 'Table is not present in this installation.',
      };
    }

    const eligibleCount = await this.countEligible(policy);
    const deletedCount = dryRun || eligibleCount === 0 ? 0 : await this.deleteEligible(policy, batchSize);

    return {
      key: policy.key,
      table: policy.table,
      description: policy.description,
      retentionDays: policy.retentionDays,
      cutoff: policy.cutoff.toISOString(),
      eligibleCount,
      deletedCount,
    };
  }

  private async countEligible(policy: RetentionPolicy): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: unknown }>>(
      `SELECT COUNT(*) AS count FROM ${policy.table} WHERE ${policy.whereSql}`,
      policy.cutoff,
    );
    return toNumber(rows[0]?.count);
  }

  private async deleteEligible(policy: RetentionPolicy, batchSize: number): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ deleted: unknown }>>(
      `WITH candidates AS (
         SELECT ${policy.idColumn}
         FROM ${policy.table}
         WHERE ${policy.whereSql}
         ORDER BY ${policy.orderBy}
         LIMIT $2::int
       ),
       deleted_rows AS (
         DELETE FROM ${policy.table}
         WHERE ${policy.idColumn} IN (SELECT ${policy.idColumn} FROM candidates)
         RETURNING 1
       )
       SELECT COUNT(*) AS deleted FROM deleted_rows`,
      policy.cutoff,
      batchSize,
    );
    return toNumber(rows[0]?.deleted);
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.' || $1::text) IS NOT NULL AS exists",
      tableName,
    );
    return rows[0]?.exists === true;
  }

  private buildPolicies(): RetentionPolicy[] {
    return [
      this.policy({
        key: 'rate-limit-buckets',
        table: 'rate_limit_buckets',
        idColumn: 'key',
        description: 'Expired distributed rate-limit buckets.',
        daysKey: 'RETENTION_RATE_LIMIT_BUCKET_DAYS',
        whereSql: 'reset_at < $1',
        orderBy: 'reset_at ASC',
      }),
      this.policy({
        key: 'auth-login-attempts',
        table: 'auth_login_attempts',
        idColumn: 'id',
        description: 'Old unlocked login-backoff attempt records.',
        daysKey: 'RETENTION_AUTH_LOGIN_ATTEMPT_DAYS',
        whereSql: "(locked_until IS NULL OR locked_until < NOW()) AND updated_at < $1",
        orderBy: 'updated_at ASC',
      }),
      this.policy({
        key: 'refresh-token-sessions',
        table: 'refresh_token_sessions',
        idColumn: 'id',
        description: 'Expired, rotated, revoked, or compromised refresh sessions.',
        daysKey: 'RETENTION_REFRESH_SESSION_DAYS',
        whereSql: "(status <> 'ACTIVE' OR expires_at < NOW()) AND updated_at < $1",
        orderBy: 'updated_at ASC',
      }),
      this.policy({
        key: 'idempotency-records',
        table: 'idempotency_records',
        idColumn: 'id',
        description: 'Completed or failed idempotency records past replay window.',
        daysKey: 'RETENTION_IDEMPOTENCY_DAYS',
        whereSql: "status IN ('COMPLETED', 'FAILED') AND updated_at < $1",
        orderBy: 'updated_at ASC',
      }),
      this.policy({
        key: 'outbox-sent-events',
        table: 'outbox_events',
        idColumn: 'id',
        description: 'Sent outbox events retained after successful dispatch.',
        daysKey: 'RETENTION_OUTBOX_SENT_DAYS',
        whereSql: "status = 'SENT' AND COALESCE(sent_at, updated_at) < $1",
        orderBy: 'COALESCE(sent_at, updated_at) ASC',
      }),
      this.policy({
        key: 'inbox-terminal-events',
        table: 'inbox_events',
        idColumn: 'id',
        description: 'Processed, duplicate, or ignored inbound events.',
        daysKey: 'RETENTION_INBOX_TERMINAL_DAYS',
        whereSql: "status IN ('PROCESSED', 'DUPLICATE', 'IGNORED') AND COALESCE(processed_at, updated_at) < $1",
        orderBy: 'COALESCE(processed_at, updated_at) ASC',
      }),
      this.policy({
        key: 'label-print-jobs',
        table: 'label_print_jobs',
        idColumn: 'id',
        description: 'Printed or cancelled label jobs.',
        daysKey: 'RETENTION_PRINT_JOB_DAYS',
        whereSql: "status IN ('PRINTED', 'CANCELLED') AND COALESCE(printed_at, updated_at) < $1",
        orderBy: 'COALESCE(printed_at, updated_at) ASC',
      }),
      this.policy({
        key: 'runtime-print-jobs',
        table: 'wms_print_jobs',
        idColumn: 'id',
        description: 'Terminal runtime print-agent jobs.',
        daysKey: 'RETENTION_PRINT_JOB_DAYS',
        whereSql: "status IN ('PRINTED', 'CANCELLED') AND COALESCE(printed_at, updated_at) < $1",
        orderBy: 'COALESCE(printed_at, updated_at) ASC',
        optionalTable: true,
      }),
      this.policy({
        key: 'carrier-labels',
        table: 'carrier_labels',
        idColumn: 'id',
        description: 'Printed or cancelled carrier labels.',
        daysKey: 'RETENTION_PRINT_JOB_DAYS',
        whereSql: "status IN ('PRINTED', 'CANCELLED') AND COALESCE(printed_at, updated_at) < $1",
        orderBy: 'COALESCE(printed_at, updated_at) ASC',
      }),
      this.policy({
        key: 'integration-dispatch-logs',
        table: 'integration_dispatch_logs',
        idColumn: 'id',
        description: 'Old integration dispatch log rows.',
        daysKey: 'RETENTION_INTEGRATION_LOG_DAYS',
        whereSql: 'created_at < $1',
        orderBy: 'created_at ASC',
      }),
      this.policy({
        key: 'integration-dead-letters',
        table: 'integration_dead_letters',
        idColumn: 'id',
        description: 'Resolved, ignored, or replayed integration dead letters.',
        daysKey: 'RETENTION_INTEGRATION_DEAD_LETTER_DAYS',
        whereSql: "status IN ('RESOLVED', 'IGNORED', 'REPLAYED') AND COALESCE(resolved_at, replayed_at, updated_at) < $1",
        orderBy: 'COALESCE(resolved_at, replayed_at, updated_at) ASC',
      }),
      this.policy({
        key: 'audit-logs',
        table: 'audit_logs',
        idColumn: 'id',
        description: 'Audit log rows older than the configured audit retention.',
        daysKey: 'RETENTION_AUDIT_LOG_DAYS',
        whereSql: 'created_at < $1',
        orderBy: 'created_at ASC',
      }),
      this.policy({
        key: 'queue-worker-heartbeats',
        table: 'wms_queue_worker_heartbeats',
        idColumn: 'id',
        description: 'Old queue worker heartbeat records for retired worker ids.',
        daysKey: 'RETENTION_RATE_LIMIT_BUCKET_DAYS',
        whereSql: 'last_seen_at < $1',
        orderBy: 'last_seen_at ASC',
        optionalTable: true,
      }),
    ];
  }

  private policy(input: {
    key: string;
    table: string;
    idColumn: string;
    description: string;
    daysKey: keyof Pick<
      Env,
      | 'RETENTION_AUDIT_LOG_DAYS'
      | 'RETENTION_AUTH_LOGIN_ATTEMPT_DAYS'
      | 'RETENTION_RATE_LIMIT_BUCKET_DAYS'
      | 'RETENTION_REFRESH_SESSION_DAYS'
      | 'RETENTION_IDEMPOTENCY_DAYS'
      | 'RETENTION_OUTBOX_SENT_DAYS'
      | 'RETENTION_INBOX_TERMINAL_DAYS'
      | 'RETENTION_PRINT_JOB_DAYS'
      | 'RETENTION_INTEGRATION_LOG_DAYS'
      | 'RETENTION_INTEGRATION_DEAD_LETTER_DAYS'
    >;
    whereSql: string;
    orderBy: string;
    optionalTable?: boolean;
  }): RetentionPolicy {
    const retentionDays = this.config.get(input.daysKey, { infer: true });
    return {
      ...input,
      retentionDays,
      cutoff: daysAgo(retentionDays),
      optionalTable: input.optionalTable,
    };
  }
}

function normalizeBatchSize(value: number | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(10, Math.min(10_000, parsed));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
