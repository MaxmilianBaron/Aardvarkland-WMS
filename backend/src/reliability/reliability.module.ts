import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database';
import { ObservabilityModule } from '../observability';
import { WarehouseIntegrityModule } from '../warehouse-integrity';
import { GracefulShutdownService } from './graceful-shutdown.service';
import { OperationalAlertDeliveryService } from './operational-alert-delivery.service';
import { OperationalAlertingService } from './operational-alerting.service';
import { OperationalIncidentLifecycleService } from './operational-incident-lifecycle.service';
import { OperationalStatusService } from './operational-status.service';
import { RecoveryStatusService } from './recovery-status.service';
import { ReliabilityController } from './reliability.controller';
import { RetentionCleanupService } from './retention-cleanup.service';
import { StartupPreflightService } from './startup-preflight.service';

@Module({
  imports: [AuditModule, DatabaseModule, ObservabilityModule, WarehouseIntegrityModule],
  controllers: [ReliabilityController],
  providers: [
    GracefulShutdownService,
    OperationalAlertDeliveryService,
    OperationalAlertingService,
    OperationalIncidentLifecycleService,
    OperationalStatusService,
    RecoveryStatusService,
    RetentionCleanupService,
    StartupPreflightService,
  ],
  exports: [
    GracefulShutdownService,
    OperationalAlertDeliveryService,
    OperationalAlertingService,
    OperationalIncidentLifecycleService,
    OperationalStatusService,
    RecoveryStatusService,
    RetentionCleanupService,
    StartupPreflightService,
  ],
})
export class ReliabilityModule {}
