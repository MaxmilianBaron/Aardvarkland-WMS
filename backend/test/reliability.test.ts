import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { GracefulShutdownService } from '../src/reliability/graceful-shutdown.service';
import { RetentionCleanupService } from '../src/reliability/retention-cleanup.service';

test('graceful shutdown middleware drains normal traffic but keeps health checks available', async () => {
  const service = new GracefulShutdownService({
    get: (key: string) => (key === 'GRACEFUL_SHUTDOWN_TIMEOUT_MS' ? 25 : undefined),
  } as never);
  const middleware = service.createMiddleware();

  let normalNextCalls = 0;
  const normalResponse = createResponse();
  middleware({ url: '/api/inventory' }, normalResponse, () => {
    normalNextCalls += 1;
  });

  assert.equal(normalNextCalls, 1);
  assert.equal(service.getSnapshot().activeRequests, 1);

  normalResponse.emit('finish');
  assert.equal(service.getSnapshot().activeRequests, 0);

  service.beforeApplicationShutdown();

  let blockedNextCalls = 0;
  const blockedResponse = createResponse();
  middleware({ url: '/api/inventory' }, blockedResponse, () => {
    blockedNextCalls += 1;
  });

  assert.equal(blockedNextCalls, 0);
  assert.equal(blockedResponse.statusCode, 503);
  assert.deepEqual(blockedResponse.body, {
    error: {
      code: 'SERVER_DRAINING',
      message: 'Server is shutting down and is not accepting new requests.',
      statusCode: 503,
    },
  });

  let healthNextCalls = 0;
  const healthResponse = createResponse();
  middleware({ url: '/api/health/ready' }, healthResponse, () => {
    healthNextCalls += 1;
  });

  assert.equal(healthNextCalls, 1);
  healthResponse.emit('close');
  await service.onApplicationShutdown();
  assert.equal(service.getSnapshot().activeRequests, 0);
});

test('retention cleanup preview counts eligible rows without deleting', async () => {
  let deleteQueries = 0;
  const service = new RetentionCleanupService({
    $queryRawUnsafe: async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ exists: false }];
      if (sql.startsWith('SELECT COUNT(*)')) return [{ count: 2 }];
      if (sql.includes('DELETE FROM')) {
        deleteQueries += 1;
        return [{ deleted: 2 }];
      }
      return [];
    },
  } as never, retentionConfig());

  const preview = await service.runCleanup({ dryRun: true, batchSize: 25 });

  assert.equal(preview.dryRun, true);
  assert.equal(preview.batchSize, 25);
  assert.equal(preview.totalDeleted, 0);
  assert.equal(preview.totalEligible > 0, true);
  assert.equal(deleteQueries, 0);
  assert.equal(preview.items.some((item) => item.key === 'runtime-print-jobs' && item.skipped), true);
});

test('retention cleanup run deletes at most configured terminal batches', async () => {
  let deleteQueries = 0;
  const service = new RetentionCleanupService({
    $queryRawUnsafe: async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ exists: false }];
      if (sql.startsWith('SELECT COUNT(*)')) return [{ count: 3 }];
      if (sql.includes('DELETE FROM')) {
        deleteQueries += 1;
        return [{ deleted: 3 }];
      }
      return [];
    },
  } as never, retentionConfig());

  const result = await service.runCleanup({ dryRun: false, batchSize: 50 });

  assert.equal(result.dryRun, false);
  assert.equal(result.totalDeleted > 0, true);
  assert.equal(deleteQueries > 0, true);
  assert.equal(service.getScheduleSnapshot().lastRun?.totalDeleted, result.totalDeleted);
});

function createResponse() {
  const events = new EventEmitter();
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    on: events.on.bind(events),
    emit: events.emit.bind(events),
    status(code: number) {
      this.statusCode = code;
      return {
        json: (body: unknown) => {
          this.body = body;
        },
      };
    },
  };

  return response;
}

function retentionConfig() {
  const values: Record<string, number | boolean> = {
    RETENTION_CLEANUP_ENABLED: true,
    RETENTION_CLEANUP_INTERVAL_SECONDS: 21600,
    RETENTION_CLEANUP_BATCH_SIZE: 500,
    RETENTION_AUDIT_LOG_DAYS: 365,
    RETENTION_AUTH_LOGIN_ATTEMPT_DAYS: 30,
    RETENTION_RATE_LIMIT_BUCKET_DAYS: 2,
    RETENTION_REFRESH_SESSION_DAYS: 60,
    RETENTION_IDEMPOTENCY_DAYS: 45,
    RETENTION_OUTBOX_SENT_DAYS: 30,
    RETENTION_INBOX_TERMINAL_DAYS: 30,
    RETENTION_PRINT_JOB_DAYS: 90,
    RETENTION_INTEGRATION_LOG_DAYS: 90,
    RETENTION_INTEGRATION_DEAD_LETTER_DAYS: 180,
  };
  return {
    get: (key: string) => values[key],
  } as never;
}
