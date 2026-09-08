import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ObservabilityModule } from '../observability';
import { ReliabilityModule } from '../reliability';
import { BackupReadinessService } from './backup-readiness.service';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, ObservabilityModule, ReliabilityModule],
  controllers: [HealthController],
  providers: [BackupReadinessService],
  exports: [BackupReadinessService],
})
export class HealthModule {}
