import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { ObservabilityModule } from '../observability';
import { OutboxModule } from '../outbox';
import { ReliabilityModule } from '../reliability';

import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { QueueWorkerService } from './queue-worker.service';

@Module({
  imports: [DatabaseModule, OutboxModule, ObservabilityModule, ReliabilityModule],
  controllers: [JobsController],
  providers: [JobsService, QueueWorkerService],
  exports: [JobsService, QueueWorkerService],
})
export class JobsModule {}
