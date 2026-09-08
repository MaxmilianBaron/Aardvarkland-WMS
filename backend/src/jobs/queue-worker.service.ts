import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database';
import { RuntimeMetricsService } from '../observability';
import { OutboxService } from '../outbox';
import {
  OperationalAlertDeliveryService,
  OperationalAlertingService,
  RetentionCleanupService,
} from '../reliability';
import { RunQueueWorkerDto } from './dto/run-queue-worker.dto';

export interface QueueWorkerRunResult {
  claimed: number;
  dispatched: number;
  failed: number;
  retried: number;
  skipped: number;
  dryRun: boolean;
}

export interface QueueWorkerLoopOptions extends RunQueueWorkerDto {
  pollIntervalMs?: number;
  stopAfterCycles?: number;
}

@Injectable()
export class QueueWorkerService {
  private readonly logger = new Logger(QueueWorkerService.name);
  private running = false;
  private heartbeatTableReady = false;
  private lastRetentionCleanupAt = 0;
  private lastAlertDeliveryAt = 0;

  constructor(
    private readonly outbox: OutboxService,
    private readonly runtimeMetrics: RuntimeMetricsService,
    private readonly prisma: PrismaService,
    private readonly retentionCleanup: RetentionCleanupService,
    private readonly operationalAlerting: OperationalAlertingService,
    private readonly operationalAlertDelivery: OperationalAlertDeliveryService,
  ) {}

  async runOnce(input: RunQueueWorkerDto = {}): Promise<QueueWorkerRunResult> {
    this.runtimeMetrics.incrementWorkerCounter('queue_worker_run_once_total');
    await this.recordWorkerHeartbeat('starting');

    try {
      const result = await this.outbox.dispatchPending({
        take: input.take,
        maxAttempts: input.maxAttempts,
        retryDelaySeconds: input.retryDelaySeconds,
        eventType: input.eventType,
        dryRun: input.dryRun,
      });

      this.runtimeMetrics.incrementWorkerCounter('queue_worker_claimed_total', result.claimed);
      this.runtimeMetrics.incrementWorkerCounter('queue_worker_dispatched_total', result.dispatched);
      this.runtimeMetrics.incrementWorkerCounter('queue_worker_failed_total', result.failed);
      this.runtimeMetrics.incrementWorkerCounter('queue_worker_retried_total', result.retried);
      this.runtimeMetrics.incrementWorkerCounter('queue_worker_skipped_total', result.skipped);

      const runResult = {
        claimed: result.claimed,
        dispatched: result.dispatched,
        failed: result.failed,
        retried: result.retried,
        skipped: result.skipped,
        dryRun: result.dryRun,
      };
      await this.recordWorkerHeartbeat('ok', runResult);
      return runResult;
    } catch (error: unknown) {
      await this.recordWorkerHeartbeat('error', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async runLoop(input: QueueWorkerLoopOptions = {}): Promise<void> {
    if (this.running) {
      throw new Error('Queue worker loop is already running');
    }

    this.running = true;
    const pollIntervalMs = normalizePollIntervalMs(input.pollIntervalMs);
    const stopAfterCycles = input.stopAfterCycles && input.stopAfterCycles > 0 ? input.stopAfterCycles : null;
    let cycles = 0;

    this.runtimeMetrics.incrementWorkerCounter('queue_worker_loop_started_total');
    try {
      while (this.running) {
        cycles += 1;
        try {
          const result = await this.runOnce(input);
          this.logger.log(
            `queue worker cycle=${cycles} claimed=${result.claimed} dispatched=${result.dispatched} failed=${result.failed} retried=${result.retried}`,
          );
          await this.runRetentionCleanupIfDue();
          await this.runAlertDeliveryIfDue();
        } catch (error: unknown) {
          this.runtimeMetrics.incrementWorkerCounter('queue_worker_cycle_error_total');
          this.logger.error(error instanceof Error ? error.message : String(error));
        }

        if (stopAfterCycles && cycles >= stopAfterCycles) {
          break;
        }

        await delay(pollIntervalMs);
      }
    } finally {
      this.running = false;
      this.runtimeMetrics.incrementWorkerCounter('queue_worker_loop_stopped_total');
    }
  }

  stop(): void {
    this.running = false;
  }

  private async recordWorkerHeartbeat(stage: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.ensureHeartbeatTable();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wms_queue_worker_heartbeats (id, last_seen_at, metadata)
       VALUES ($1, now(), $2::jsonb)
       ON CONFLICT (id) DO UPDATE
       SET last_seen_at = EXCLUDED.last_seen_at,
           metadata = EXCLUDED.metadata`,
      this.workerId(),
      JSON.stringify({
        stage,
        pid: process.pid,
        ...metadata,
      }),
    );
  }

  private async ensureHeartbeatTable(): Promise<void> {
    if (this.heartbeatTableReady) {
      return;
    }
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS wms_queue_worker_heartbeats (
        id text PRIMARY KEY,
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS wms_queue_worker_heartbeats_seen_idx ON wms_queue_worker_heartbeats (last_seen_at DESC)`,
    );
    this.heartbeatTableReady = true;
  }

  private workerId(): string {
    const raw = process.env['WMS_QUEUE_WORKER_ID'] ?? process.env['HOSTNAME'] ?? `queue-worker-${process.pid}`;
    const normalized = raw.trim().slice(0, 120);
    return normalized.length > 0 ? normalized : `queue-worker-${process.pid}`;
  }

  private async runRetentionCleanupIfDue(): Promise<void> {
    const schedule = this.retentionCleanup.getScheduleSnapshot();
    if (!schedule.enabled) {
      return;
    }

    const now = Date.now();
    const intervalMs = schedule.intervalSeconds * 1000;
    if (this.lastRetentionCleanupAt > 0 && now - this.lastRetentionCleanupAt < intervalMs) {
      return;
    }

    this.lastRetentionCleanupAt = now;
    const result = await this.retentionCleanup.runCleanup({ dryRun: false, batchSize: schedule.batchSize });
    this.logger.log(`retention cleanup cycle deleted=${result.totalDeleted} eligible=${result.totalEligible}`);
  }

  private async runAlertDeliveryIfDue(): Promise<void> {
    const now = Date.now();
    if (this.lastAlertDeliveryAt > 0 && now - this.lastAlertDeliveryAt < 60_000) {
      return;
    }

    this.lastAlertDeliveryAt = now;
    const snapshot = await this.operationalAlerting.getAlertSnapshot();
    const result = await this.operationalAlertDelivery.deliverSnapshot(snapshot);
    if (result.delivered > 0 || result.failed > 0) {
      this.logger.warn(
        `operational alert delivery delivered=${result.delivered} failed=${result.failed} skipped=${result.skipped}`,
      );
    }
  }
}

function normalizePollIntervalMs(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 5000);
  if (!Number.isFinite(parsed)) {
    return 5000;
  }
  return Math.max(100, Math.min(60_000, Math.trunc(parsed)));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
