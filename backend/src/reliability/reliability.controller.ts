import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser, RequirePermissions } from '../access-control';
import { RunRetentionCleanupDto } from './dto/run-retention-cleanup.dto';
import { UpdateOperationalIncidentDto } from './dto/update-operational-incident.dto';
import { GracefulShutdownService } from './graceful-shutdown.service';
import { OperationalAlertDeliveryService } from './operational-alert-delivery.service';
import { OperationalAlertingService } from './operational-alerting.service';
import { OperationalIncidentLifecycleService } from './operational-incident-lifecycle.service';
import { OperationalStatusService } from './operational-status.service';
import { RecoveryStatusService } from './recovery-status.service';
import { RetentionCleanupService } from './retention-cleanup.service';
import { StartupPreflightService } from './startup-preflight.service';

@ApiTags('reliability')
@ApiBearerAuth()
@Controller('operations/reliability')
export class ReliabilityController {
  constructor(
    private readonly operationalStatus: OperationalStatusService,
    private readonly operationalAlerting: OperationalAlertingService,
    private readonly operationalAlertDelivery: OperationalAlertDeliveryService,
    private readonly incidentLifecycle: OperationalIncidentLifecycleService,
    private readonly recoveryStatus: RecoveryStatusService,
    private readonly retentionCleanup: RetentionCleanupService,
    private readonly startupPreflight: StartupPreflightService,
    private readonly gracefulShutdown: GracefulShutdownService,
  ) {}

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Normalized backend alert snapshot for monitoring and administrators.' })
  @Get('alerts')
  getAlerts() {
    return this.operationalAlerting.getAlertSnapshot();
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Latest deduplicated operational alert delivery state.' })
  @Get('alerts/deliveries')
  getAlertDeliveries() {
    return this.operationalAlertDelivery.listDeliveries();
  }

  @RequirePermissions('job.manage')
  @ApiOkResponse({ description: 'Deliver current operational alerts to configured local channels.' })
  @Post('alerts/deliver')
  async deliverAlerts() {
    return this.operationalAlertDelivery.deliverSnapshot(await this.operationalAlerting.getAlertSnapshot());
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Operational incident panel data for administrators.' })
  @Get('incidents')
  getIncidents() {
    return this.operationalStatus.getStatus();
  }

  @RequirePermissions('job.manage')
  @ApiOkResponse({ description: 'Acknowledge an active operational incident and record who is handling it.' })
  @Post('incidents/:incidentKey/acknowledge')
  acknowledgeIncident(
    @Param('incidentKey') incidentKey: string,
    @Body() dto: UpdateOperationalIncidentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.incidentLifecycle.acknowledgeIncident(incidentKey, dto.note, actor);
  }

  @RequirePermissions('job.manage')
  @ApiOkResponse({ description: 'Mark an operational incident as resolved with an audited note.' })
  @Post('incidents/:incidentKey/resolve')
  resolveIncident(
    @Param('incidentKey') incidentKey: string,
    @Body() dto: UpdateOperationalIncidentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.incidentLifecycle.resolveIncident(incidentKey, dto.note, actor);
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Retention cleanup preview and last cleanup run.' })
  @Get('retention')
  getRetention() {
    return this.retentionCleanup.getStatus();
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Backup and restore drill recovery readiness status.' })
  @Get('recovery')
  getRecovery() {
    return this.recoveryStatus.getStatus();
  }

  @RequirePermissions('job.manage')
  @ApiOkResponse({ description: 'Run retention cleanup, or preview it with dryRun=true.' })
  @Post('retention/run')
  runRetention(@Body() dto: RunRetentionCleanupDto) {
    return this.retentionCleanup.runCleanup(dto);
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Repeatable warehouse consistency summary across active warehouses.' })
  @Get('consistency')
  getConsistency() {
    return this.operationalStatus.getConsistencySummary();
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Latest startup preflight snapshot.' })
  @Get('startup-preflight')
  getStartupPreflight() {
    return this.startupPreflight.getSnapshot();
  }

  @RequirePermissions('job.manage')
  @ApiOkResponse({ description: 'Refresh startup preflight checks without restarting the backend.' })
  @Post('startup-preflight/refresh')
  refreshStartupPreflight() {
    return this.startupPreflight.refresh();
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Graceful shutdown drain state.' })
  @Get('shutdown')
  getShutdownState() {
    return this.gracefulShutdown.getSnapshot();
  }
}
