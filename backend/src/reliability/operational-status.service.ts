import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from '../config';
import { PrismaService } from '../database';
import { getIntegrationCircuitSnapshot } from '../integrations/http-integration-adapter';
import { WarehouseIntegrityService } from '../warehouse-integrity';
import { OperationalIncidentLifecycleService } from './operational-incident-lifecycle.service';
import {
  ConsistencySummary,
  OperationalIncident,
  OperationalMetricsSnapshot,
  OperationalStatusResponse,
  ReliabilityCheck,
} from './reliability.types';

@Injectable()
export class OperationalStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly warehouseIntegrity: WarehouseIntegrityService,
    private readonly incidentLifecycle: OperationalIncidentLifecycleService,
  ) {}

  async getStatus(): Promise<OperationalStatusResponse> {
    const [metrics, consistency] = await Promise.all([
      this.getMetricsSnapshot(),
      this.getConsistencySummary(),
    ]);
    const incidents = await this.incidentLifecycle.enrichIncidents(this.buildIncidents(metrics, consistency));
    const status = incidents.some((incident) => incident.severity === 'critical')
      ? 'fail'
      : incidents.some((incident) => incident.severity === 'warning')
        ? 'degraded'
        : 'ok';

    return {
      status,
      generatedAt: new Date().toISOString(),
      metrics,
      consistency,
      incidents,
    };
  }

  async getConsistencyReadinessCheck(): Promise<ReliabilityCheck> {
    if (!this.config.get('HEALTH_CONSISTENCY_CHECK_ENABLED', { infer: true })) {
      return {
        name: 'consistency',
        status: 'ok',
        enabled: false,
        detail: 'Consistency readiness check is disabled.',
      };
    }

    const started = Date.now();
    const summary = await this.getConsistencySummary();
    const maxErrors = this.config.get('HEALTH_CONSISTENCY_MAX_ERRORS', { infer: true });

    return {
      name: 'consistency',
      status: summary.errorCount > maxErrors ? 'warn' : 'ok',
      latencyMs: Date.now() - started,
      enabled: true,
      maxErrors,
      warehousesChecked: summary.warehousesChecked,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      warehouses: summary.warehouses,
    };
  }

  async getConsistencySummary(): Promise<ConsistencySummary> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; code: string }>>(
      "SELECT id, code FROM warehouses WHERE status = 'ACTIVE' ORDER BY code ASC",
    );
    let errorCount = 0;
    let warningCount = 0;
    const warehouses = [];

    for (const warehouse of rows) {
      try {
        const snapshot = await this.warehouseIntegrity.checkWarehouse(warehouse.id);
        errorCount += snapshot.summary.errorCount;
        warningCount += snapshot.summary.warningCount;
        warehouses.push({
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          status: snapshot.status,
          errorCount: snapshot.summary.errorCount,
          warningCount: snapshot.summary.warningCount,
        });
      } catch {
        errorCount += 1;
        warehouses.push({
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          status: 'CHECK_FAILED',
          errorCount: 1,
          warningCount: 0,
        });
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      status: errorCount > 0 ? 'degraded' : 'ok',
      warehousesChecked: rows.length,
      errorCount,
      warningCount,
      warehouses,
    };
  }

  async getMetricsSnapshot(): Promise<OperationalMetricsSnapshot> {
    const generatedAt = new Date().toISOString();
    const dbStarted = Date.now();
    await this.prisma.$queryRawUnsafe('SELECT 1');
    const databaseLatencyMs = Date.now() - dbStarted;
    const [
      outboxRows,
      integrationRows,
      labelRows,
      runtimePrintRows,
      authRows,
      workerRows,
    ] = await Promise.all([
      this.findOutboxMetrics(),
      this.findIntegrationMetrics(),
      this.findLabelPrintMetrics(),
      this.findRuntimePrintMetrics(),
      this.findAuthMetrics(),
      this.findWorkerMetrics(),
    ]);
    const circuits = getIntegrationCircuitSnapshot();
    const workerAgeSeconds = workerRows.ageSeconds;

    return {
      generatedAt,
      databaseLatencyMs,
      outbox: outboxRows,
      integrations: {
        ...integrationRows,
        circuitBreakersOpen: circuits.filter((circuit) => circuit.open).length,
      },
      printQueue: {
        pending: labelRows.pending + runtimePrintRows.pending,
        failed: labelRows.failed + runtimePrintRows.failed,
        expiredRuntimeLeases: runtimePrintRows.expiredLeases,
      },
      auth: authRows,
      worker: {
        lastSeenAt: workerRows.lastSeenAt,
        ageSeconds: workerAgeSeconds,
        stale: workerAgeSeconds !== null && workerAgeSeconds > this.config.get('HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS', { infer: true }),
      },
    };
  }

  private buildIncidents(metrics: OperationalMetricsSnapshot, consistency: ConsistencySummary | null): OperationalIncident[] {
    const now = new Date().toISOString();
    const incidents: OperationalIncident[] = [];

    if (consistency && consistency.errorCount > 0) {
      incidents.push({
        key: 'consistency-errors',
        severity: 'critical',
        title: 'Warehouse consistency errors',
        detail: `${consistency.errorCount} invariant error(s) detected across ${consistency.warehousesChecked} warehouse(s).`,
        count: consistency.errorCount,
        action: 'Open warehouse integrity checks and resolve stock/reservation/task inconsistencies before continuing operations.',
        detectedAt: now,
      });
    }

    if (metrics.outbox.deadLetter > 0) {
      incidents.push({
        key: 'outbox-dead-letter',
        severity: 'warning',
        title: 'Outbox dead letters',
        detail: `${metrics.outbox.deadLetter} outbox event(s) require manual review or replay.`,
        count: metrics.outbox.deadLetter,
        action: 'Review /api/outbox/events/dead-letter and requeue only after the root cause is fixed.',
        detectedAt: now,
      });
    }

    if (metrics.integrations.openDeadLetters + metrics.integrations.retryingDeadLetters > 0) {
      const count = metrics.integrations.openDeadLetters + metrics.integrations.retryingDeadLetters;
      incidents.push({
        key: 'integration-dead-letter',
        severity: 'warning',
        title: 'Integration dead letters',
        detail: `${count} integration dead letter(s) are open or retrying.`,
        count,
        action: 'Use the integration dead-letter dashboard to replay, resolve, or ignore each item.',
        detectedAt: now,
      });
    }

    if (metrics.printQueue.failed > 0 || metrics.printQueue.expiredRuntimeLeases > 0) {
      incidents.push({
        key: 'print-queue-attention',
        severity: 'warning',
        title: 'Print queue needs attention',
        detail: `${metrics.printQueue.failed} failed print job(s), ${metrics.printQueue.expiredRuntimeLeases} expired runtime lease(s).`,
        count: metrics.printQueue.failed + metrics.printQueue.expiredRuntimeLeases,
        action: 'Check Print Agent health and retry or reassign affected jobs.',
        detectedAt: now,
      });
    }

    if (metrics.auth.lockedLoginIdentities > 0) {
      incidents.push({
        key: 'auth-abuse-lockouts',
        severity: 'warning',
        title: 'Authentication abuse or lockouts detected',
        detail: `${metrics.auth.lockedLoginIdentities} login identity lockout(s) are active.`,
        count: metrics.auth.lockedLoginIdentities,
        action: 'Review auth login attempts, source IPs, and any related user reports before unlocking accounts.',
        detectedAt: now,
      });
    }

    if (metrics.worker.ageSeconds === null && this.config.get('HEALTH_REQUIRE_QUEUE_WORKER', { infer: true })) {
      incidents.push({
        key: 'queue-worker-missing',
        severity: 'critical',
        title: 'Queue worker heartbeat is missing',
        detail: 'No queue worker heartbeat has been recorded.',
        action: 'Start the queue worker before accepting warehouse background work.',
        detectedAt: now,
      });
    } else if (metrics.worker.stale) {
      incidents.push({
        key: 'queue-worker-stale',
        severity: this.config.get('HEALTH_REQUIRE_QUEUE_WORKER', { infer: true }) ? 'critical' : 'warning',
        title: 'Queue worker heartbeat is stale',
        detail: `Latest queue worker heartbeat age is ${metrics.worker.ageSeconds} seconds.`,
        action: 'Restart the queue worker or confirm that background dispatch is intentionally disabled.',
        detectedAt: now,
      });
    }

    if (metrics.integrations.circuitBreakersOpen > 0) {
      incidents.push({
        key: 'integration-circuit-open',
        severity: 'warning',
        title: 'Integration circuit breaker open',
        detail: `${metrics.integrations.circuitBreakersOpen} outbound integration circuit(s) are open.`,
        count: metrics.integrations.circuitBreakersOpen,
        action: 'Check destination availability before retrying integration delivery.',
        detectedAt: now,
      });
    }

    return incidents;
  }

  private async findOutboxMetrics() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      pending: unknown;
      processing: unknown;
      failed: unknown;
      dead_letter: unknown;
      oldest_pending_age_seconds: unknown;
    }>>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_letter,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(available_at) FILTER (WHERE status IN ('PENDING', 'FAILED') AND available_at <= NOW()))), 0) AS oldest_pending_age_seconds
       FROM outbox_events`,
    );
    const row = rows[0];
    return {
      pending: toNumber(row?.pending),
      processing: toNumber(row?.processing),
      failed: toNumber(row?.failed),
      deadLetter: toNumber(row?.dead_letter),
      oldestPendingAgeSeconds: Math.floor(toNumber(row?.oldest_pending_age_seconds)),
    };
  }

  private async findIntegrationMetrics() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ open: unknown; retrying: unknown }>>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'OPEN') AS open,
        COUNT(*) FILTER (WHERE status = 'RETRYING') AS retrying
       FROM integration_dead_letters`,
    );
    return {
      openDeadLetters: toNumber(rows[0]?.open),
      retryingDeadLetters: toNumber(rows[0]?.retrying),
    };
  }

  private async findLabelPrintMetrics() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ pending: unknown; failed: unknown }>>(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('QUEUED', 'PRINTING')) AS pending,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
       FROM label_print_jobs`,
    );
    return { pending: toNumber(rows[0]?.pending), failed: toNumber(rows[0]?.failed) };
  }

  private async findRuntimePrintMetrics() {
    const exists = await this.tableExists('wms_print_jobs');
    if (!exists) return { pending: 0, failed: 0, expiredLeases: 0 };

    const hasClaimExpiresAt = await this.columnExists('wms_print_jobs', 'claim_expires_at');
    const expiredSelect = hasClaimExpiresAt
      ? "COUNT(*) FILTER (WHERE status = 'CLAIMED' AND (claim_expires_at IS NULL OR claim_expires_at < NOW()))"
      : '0';
    const rows = await this.prisma.$queryRawUnsafe<Array<{ pending: unknown; failed: unknown; expired_leases: unknown }>>(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('QUEUED', 'CLAIMED', 'PRINTING')) AS pending,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        ${expiredSelect} AS expired_leases
       FROM wms_print_jobs`,
    );
    return {
      pending: toNumber(rows[0]?.pending),
      failed: toNumber(rows[0]?.failed),
      expiredLeases: toNumber(rows[0]?.expired_leases),
    };
  }

  private async findAuthMetrics() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ locked: unknown; active_refresh: unknown }>>(
      `SELECT
        (SELECT COUNT(*) FROM auth_login_attempts WHERE locked_until IS NOT NULL AND locked_until > NOW()) AS locked,
        (SELECT COUNT(*) FROM refresh_token_sessions WHERE status = 'ACTIVE' AND expires_at > NOW()) AS active_refresh`,
    );
    return {
      lockedLoginIdentities: toNumber(rows[0]?.locked),
      activeRefreshSessions: toNumber(rows[0]?.active_refresh),
    };
  }

  private async findWorkerMetrics(): Promise<{ lastSeenAt: string | null; ageSeconds: number | null }> {
    const exists = await this.tableExists('wms_queue_worker_heartbeats');
    if (!exists) return { lastSeenAt: null, ageSeconds: null };

    const rows = await this.prisma.$queryRawUnsafe<Array<{ last_seen_at: Date | string | null; age_seconds: unknown }>>(
      `SELECT last_seen_at, EXTRACT(EPOCH FROM (NOW() - last_seen_at)) AS age_seconds
       FROM wms_queue_worker_heartbeats
       ORDER BY last_seen_at DESC
       LIMIT 1`,
    );
    return {
      lastSeenAt: toIsoString(rows[0]?.last_seen_at),
      ageSeconds: rows[0]?.last_seen_at ? Math.floor(toNumber(rows[0]?.age_seconds)) : null,
    };
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      "SELECT to_regclass('public.' || $1::text) IS NOT NULL AS exists",
      tableName,
    );
    return rows[0]?.exists === true;
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists`,
      tableName,
      columnName,
    );
    return rows[0]?.exists === true;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
