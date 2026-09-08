import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { QueueWorkerService } from './jobs';

export async function runQueueWorkerMain(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const worker = app.get(QueueWorkerService);
  const once = process.env['WMS_QUEUE_WORKER_ONCE'] === '1';
  const take = readOptionalInt('WMS_QUEUE_WORKER_TAKE');
  const pollIntervalMs = readOptionalInt('WMS_QUEUE_WORKER_POLL_INTERVAL_MS');
  const maxAttempts = readOptionalInt('WMS_QUEUE_WORKER_MAX_ATTEMPTS');
  const retryDelaySeconds = readOptionalInt('WMS_QUEUE_WORKER_RETRY_DELAY_SECONDS');
  const eventType = process.env['WMS_QUEUE_WORKER_EVENT_TYPE'];

  const shutdown = async () => {
    worker.stop();
    await app.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  if (once) {
    await worker.runOnce({ take, maxAttempts, retryDelaySeconds, eventType });
    await app.close();
    return;
  }

  await worker.runLoop({ take, maxAttempts, retryDelaySeconds, eventType, pollIntervalMs });
  await app.close();
}

function readOptionalInt(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

if (require.main === module) {
  void runQueueWorkerMain().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
