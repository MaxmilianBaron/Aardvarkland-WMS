import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from '../config/env';
import { Public } from '../access-control/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { RuntimeMetricsService } from '../observability';
import { GracefulShutdownService, OperationalStatusService, StartupPreflightService } from '../reliability';
import { BackupReadinessService } from './backup-readiness.service';

interface ReadinessCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  latencyMs?: number;
  detail?: string;
  [key: string]: unknown;
}

@Public()
@Controller('health')
export class HealthController {
  private readonly startedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly runtimeMetrics: RuntimeMetricsService,
    private readonly backupReadiness: BackupReadinessService,
    private readonly operationalStatus: OperationalStatusService,
    private readonly startupPreflight: StartupPreflightService,
    private readonly gracefulShutdown: GracefulShutdownService,
  ) {}

  @Get('live')
  getLiveness() {
    return this.baseHealthPayload('ok');
  }

  @Get('startup')
  getStartup() {
    const snapshot = this.startupPreflight.getSnapshot();
    return {
      ...this.baseHealthPayload(snapshot?.status === 'fail' ? 'degraded' : 'ok'),
      startupPreflight: snapshot,
      checks: snapshot?.checks ?? [{ name: 'process', status: 'ok', detail: 'NestJS process is accepting requests.' }],
    };
  }

  @Get()
  getHealth() {
    return this.getReadiness();
  }

  @Get('backup')
  getBackupReadiness() {
    return this.backupReadiness.getSnapshot();
  }

  @Get('ready')
  async getReadiness() {
    const started = Date.now();
    const checks: ReadinessCheck[] = [];

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ name: 'database', status: 'ok', latencyMs: Date.now() - started });
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_database_failed_total');
      throw new ServiceUnavailableException({
        ...this.baseHealthPayload('degraded'),
        database: 'unavailable',
        checks: [
          {
            name: 'database',
            status: 'fail',
            latencyMs: Date.now() - started,
            detail: error instanceof Error ? error.message : 'Database readiness check failed.',
          },
        ],
      });
    }

    await Promise.all([
      this.addRateLimitStoreCheck(checks),
      this.addDatabaseTimeoutCheck(checks),
      this.addOutboxCheck(checks),
      this.addPrintQueueCheck(checks),
      this.addBackupReadinessChecks(checks),
      this.addConsistencyCheck(checks),
    ]);
    this.addStartupPreflightCheck(checks);
    this.addGracefulShutdownCheck(checks);
    await this.addQueueWorkerCheck(checks);

    const degraded = checks.some((check) => check.status !== 'ok');
    if (degraded) {
      this.runtimeMetrics.incrementCounter('readiness_degraded_total');
    }

    return {
      ...this.baseHealthPayload(degraded ? 'degraded' : 'ok'),
      database: 'ok',
      checks,
    };
  }

  private async addRateLimitStoreCheck(checks: ReadinessCheck[]): Promise<void> {
    if (this.config.get('RATE_LIMIT_BACKEND', { infer: true }) !== 'postgres') {
      checks.push({ name: 'rateLimitStore', status: 'ok', detail: 'memory' });
      return;
    }

    const started = Date.now();
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ active_count: unknown }>>(
        'SELECT COUNT(*) AS active_count FROM rate_limit_buckets WHERE reset_at > NOW()',
      );
      checks.push({
        name: 'rateLimitStore',
        status: 'ok',
        latencyMs: Date.now() - started,
        activeBuckets: toNumber(rows[0]?.active_count),
      });
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_rate_limit_store_failed_total');
      checks.push({
        name: 'rateLimitStore',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Rate limit store check failed.',
      });
    }
  }

  private async addDatabaseTimeoutCheck(checks: ReadinessCheck[]): Promise<void> {
    const started = Date.now();
    const configuredStatementTimeoutMs = this.config.get('DATABASE_STATEMENT_TIMEOUT_MS', { infer: true });
    const configuredLockTimeoutMs = this.config.get('DATABASE_LOCK_TIMEOUT_MS', { infer: true });

    try {
      const statementRows = await this.prisma.$queryRawUnsafe<Array<{ statement_timeout: unknown }>>('SHOW statement_timeout');
      const lockRows = await this.prisma.$queryRawUnsafe<Array<{ lock_timeout: unknown }>>('SHOW lock_timeout');
      const statementTimeout = String(statementRows[0]?.statement_timeout ?? 'unknown');
      const lockTimeout = String(lockRows[0]?.lock_timeout ?? 'unknown');
      const missingRequiredTimeout =
        (configuredStatementTimeoutMs > 0 && statementTimeout === '0') ||
        (configuredLockTimeoutMs > 0 && lockTimeout === '0');

      checks.push({
        name: 'databaseSessionTimeouts',
        status: missingRequiredTimeout ? 'warn' : 'ok',
        latencyMs: Date.now() - started,
        statementTimeout,
        lockTimeout,
        configuredStatementTimeoutMs,
        configuredLockTimeoutMs,
      });
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_database_timeouts_failed_total');
      checks.push({
        name: 'databaseSessionTimeouts',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Database timeout readiness check failed.',
      });
    }
  }

  private async addOutboxCheck(checks: ReadinessCheck[]): Promise<void> {
    const started = Date.now();
    const maxAgeSeconds = this.config.get('HEALTH_OUTBOX_MAX_AGE_SECONDS', { infer: true });

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{
        pending_count: unknown;
        failed_count: unknown;
        dead_letter_count: unknown;
        oldest_pending_age_seconds: unknown;
        retry_attempts: unknown;
      }>>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING')) AS pending_count,
            COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count,
            COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_letter_count,
            COALESCE(
              EXTRACT(EPOCH FROM (NOW() - MIN(available_at) FILTER (WHERE status IN ('PENDING', 'FAILED') AND available_at <= NOW()))),
              0
            ) AS oldest_pending_age_seconds,
            COALESCE(SUM(attempts) FILTER (WHERE status IN ('PENDING', 'FAILED')), 0) AS retry_attempts
          FROM outbox_events
        `,
      );
      const row = rows[0];
      const oldestPendingAgeSeconds = Math.floor(toNumber(row?.oldest_pending_age_seconds));
      const failed = toNumber(row?.failed_count);
      const deadLetters = toNumber(row?.dead_letter_count);
      const status = oldestPendingAgeSeconds > maxAgeSeconds || failed > 0 || deadLetters > 0 ? 'warn' : 'ok';
      checks.push({
        name: 'outbox',
        status,
        latencyMs: Date.now() - started,
        pending: toNumber(row?.pending_count),
        failed,
        deadLetters,
        oldestPendingAgeSeconds,
        retryAttempts: toNumber(row?.retry_attempts),
        maxAgeSeconds,
      });
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_outbox_failed_total');
      checks.push({
        name: 'outbox',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Outbox readiness check failed.',
      });
    }
  }

  private async addQueueWorkerCheck(checks: ReadinessCheck[]): Promise<void> {
    const maxAgeSeconds = this.config.get('HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS', { infer: true });
    const required = this.config.get('HEALTH_REQUIRE_QUEUE_WORKER', { infer: true });
    const started = Date.now();

    try {
      const tableRows = await this.prisma.$queryRawUnsafe<Array<{ exists: unknown }>>(
        "SELECT to_regclass('public.wms_queue_worker_heartbeats') IS NOT NULL AS exists",
      );
      if (tableRows[0]?.exists === true) {
        const rows = await this.prisma.$queryRawUnsafe<Array<{
          id: unknown;
          last_seen_at: unknown;
          age_seconds: unknown;
          metadata: unknown;
        }>>(
          `SELECT id, last_seen_at, metadata,
                  EXTRACT(EPOCH FROM (NOW() - last_seen_at)) AS age_seconds
           FROM wms_queue_worker_heartbeats
           ORDER BY last_seen_at DESC
           LIMIT 1`,
        );
        const row = rows[0];
        if (row?.last_seen_at) {
          const ageSeconds = Math.floor(toNumber(row.age_seconds));
          checks.push({
            name: 'queueWorker',
            status: ageSeconds <= maxAgeSeconds ? 'ok' : 'warn',
            latencyMs: Date.now() - started,
            workerId: row.id,
            lastSeenAt: toIsoString(row.last_seen_at),
            ageSeconds,
            maxAgeSeconds,
            metadata: row.metadata,
            source: 'database',
          });
          return;
        }
      }
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_queue_worker_failed_total');
      checks.push({
        name: 'queueWorker',
        status: required ? 'warn' : 'ok',
        latencyMs: Date.now() - started,
        maxAgeSeconds,
        required,
        detail: error instanceof Error ? error.message : 'Queue worker heartbeat check failed.',
      });
      return;
    }

    const heartbeat = this.runtimeMetrics.getWorkerHeartbeat();
    if (heartbeat.lastSeenAt) {
      checks.push({
        name: 'queueWorker',
        status: heartbeat.ageSeconds !== null && heartbeat.ageSeconds <= maxAgeSeconds ? 'ok' : 'warn',
        latencyMs: Date.now() - started,
        lastSeenAt: heartbeat.lastSeenAt,
        ageSeconds: heartbeat.ageSeconds,
        maxAgeSeconds,
        required,
        source: 'process',
      });
      return;
    }

    checks.push({
      name: 'queueWorker',
      status: required ? 'warn' : 'ok',
      latencyMs: Date.now() - started,
      lastSeenAt: null,
      ageSeconds: null,
      maxAgeSeconds,
      required,
      detail: required
        ? 'No queue worker heartbeat has been recorded.'
        : 'Queue worker heartbeat is not required for this environment.',
    });
  }

  private async addPrintQueueCheck(checks: ReadinessCheck[]): Promise<void> {
    const started = Date.now();

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ pending_count: unknown; failed_count: unknown }>>(
        `
          SELECT
            COALESCE(SUM(pending_count), 0) AS pending_count,
            COALESCE(SUM(failed_count), 0) AS failed_count
          FROM (
            SELECT
              COUNT(*) FILTER (WHERE status IN ('QUEUED', 'PRINTING')) AS pending_count,
              COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count
            FROM label_print_jobs
            UNION ALL
            SELECT
              COUNT(*) FILTER (WHERE state IN ('QUEUED', 'PENDING', 'PRINTING', 'RETRY')) AS pending_count,
              COUNT(*) FILTER (WHERE state = 'FAILED') AS failed_count
            FROM enterprise_print_jobs
          ) AS print_queue
        `,
      );
      const runtimeRows = await this.findRuntimePrintQueueHealth();
      const failed = toNumber(rows[0]?.failed_count);
      const runtimeFailed = toNumber(runtimeRows[0]?.failed_count);
      const runtimeExpiredLeases = toNumber(runtimeRows[0]?.expired_lease_count);
      checks.push({
        name: 'printQueue',
        status: failed > 0 || runtimeFailed > 0 || runtimeExpiredLeases > 0 ? 'warn' : 'ok',
        latencyMs: Date.now() - started,
        pending: toNumber(rows[0]?.pending_count) + toNumber(runtimeRows[0]?.pending_count),
        failed: failed + runtimeFailed,
        runtimePending: toNumber(runtimeRows[0]?.pending_count),
        runtimeFailed,
        runtimeExpiredLeases,
      });
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_print_queue_failed_total');
      checks.push({
        name: 'printQueue',
        status: 'warn',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'Print queue readiness check failed.',
      });
    }
  }

  private async addBackupReadinessChecks(checks: ReadinessCheck[]): Promise<void> {
    try {
      checks.push(...await this.backupReadiness.getChecks());
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_backup_status_failed_total');
      checks.push({
        name: 'backup',
        status: 'warn',
        detail: error instanceof Error ? error.message : 'Backup readiness check failed.',
      });
    }
  }

  private async addConsistencyCheck(checks: ReadinessCheck[]): Promise<void> {
    try {
      checks.push(await this.operationalStatus.getConsistencyReadinessCheck());
    } catch (error: unknown) {
      this.runtimeMetrics.incrementCounter('readiness_consistency_failed_total');
      checks.push({
        name: 'consistency',
        status: 'warn',
        detail: error instanceof Error ? error.message : 'Consistency readiness check failed.',
      });
    }
  }

  private addStartupPreflightCheck(checks: ReadinessCheck[]): void {
    const snapshot = this.startupPreflight.getSnapshot();
    if (!snapshot) {
      checks.push({
        name: 'startupPreflight',
        status: 'warn',
        detail: 'Startup preflight has not completed yet.',
      });
      return;
    }

    checks.push({
      name: 'startupPreflight',
      status: snapshot.status === 'fail' ? 'warn' : snapshot.status === 'degraded' ? 'warn' : 'ok',
      strict: snapshot.strict,
      checkedAt: snapshot.checkedAt,
      failedChecks: snapshot.checks.filter((check) => check.status === 'fail').map((check) => check.name),
      warningChecks: snapshot.checks.filter((check) => check.status === 'warn').map((check) => check.name),
    });
  }

  private addGracefulShutdownCheck(checks: ReadinessCheck[]): void {
    const snapshot = this.gracefulShutdown.getSnapshot();
    checks.push({
      name: 'gracefulShutdown',
      status: snapshot.draining ? 'warn' : 'ok',
      draining: snapshot.draining,
      activeRequests: snapshot.activeRequests,
      timeoutMs: snapshot.timeoutMs,
    });
  }

  private async findRuntimePrintQueueHealth(): Promise<Array<{ pending_count: unknown; failed_count: unknown; expired_lease_count: unknown }>> {
    const tableRows = await this.prisma.$queryRawUnsafe<Array<{ exists: unknown; has_claim_expires_at: unknown }>>(
      `SELECT
        to_regclass('public.wms_print_jobs') IS NOT NULL AS exists,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'wms_print_jobs'
            AND column_name = 'claim_expires_at'
        ) AS has_claim_expires_at`,
    );
    if (tableRows[0]?.exists !== true) {
      return [{ pending_count: 0, failed_count: 0, expired_lease_count: 0 }];
    }

    if (tableRows[0]?.has_claim_expires_at !== true) {
      return this.prisma.$queryRawUnsafe<Array<{ pending_count: unknown; failed_count: unknown; expired_lease_count: unknown }>>(
        `SELECT
          COUNT(*) FILTER (WHERE status IN ('QUEUED', 'CLAIMED', 'PRINTING')) AS pending_count,
          COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count,
          0 AS expired_lease_count
         FROM wms_print_jobs`,
      );
    }

    return this.prisma.$queryRawUnsafe<Array<{ pending_count: unknown; failed_count: unknown; expired_lease_count: unknown }>>(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('QUEUED', 'CLAIMED', 'PRINTING')) AS pending_count,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count,
        COUNT(*) FILTER (WHERE status = 'CLAIMED' AND (claim_expires_at IS NULL OR claim_expires_at < NOW())) AS expired_lease_count
       FROM wms_print_jobs`,
    );
  }

  private baseHealthPayload(status: 'ok' | 'degraded') {
    return {
      status,
      service: 'wms-backend',
      version: this.config.get('APP_VERSION'),
      releaseSha: this.config.get('RELEASE_SHA'),
      environment: this.config.get('NODE_ENV'),
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return null;
}
