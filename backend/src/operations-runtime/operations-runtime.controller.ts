import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { OperationsRuntimeService } from './operations-runtime.service';
import { RuntimeRuleType } from './operations-runtime.types';
import {
  RuntimeIntegrationEventApplyDto,
  RuntimeIntegrationEventIngestDto,
  RuntimePrintLabelTestDto,
  RuntimeReconciliationRunDto,
  RuntimeRfExceptionDto,
  RuntimeRfOfflineReplayDto,
  RuntimeRfScanDto,
  RuntimeRuleEvaluationDto,
  RuntimeRuleUpsertDto,
  StartRuntimeRfSessionDto,
} from './dto/operations-runtime.dto';

@ApiTags('operations-runtime')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/operations-runtime')
export class OperationsRuntimeController {
  constructor(private readonly operationsRuntimeService: OperationsRuntimeService) {}

  @RequireWarehousePermissions('rf.read')
  @Get('rf-console')
  getRfConsole(@Param('warehouseId') warehouseId: string) {
    return this.operationsRuntimeService.getRfConsole(warehouseId);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('rf/sessions')
  startRfSession(@Param('warehouseId') warehouseId: string, @Body() dto: StartRuntimeRfSessionDto) {
    return this.operationsRuntimeService.startRfSession(warehouseId, dto);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('rf/scans')
  submitRfScan(@Param('warehouseId') warehouseId: string, @Body() dto: RuntimeRfScanDto) {
    return this.operationsRuntimeService.submitRfScan(warehouseId, dto);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('rf/offline-queue/replay')
  replayRfOfflineQueue(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: RuntimeRfOfflineReplayDto,
  ) {
    return this.operationsRuntimeService.replayRfOfflineQueue(warehouseId, dto);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('rf/exceptions')
  reportRfException(@Param('warehouseId') warehouseId: string, @Body() dto: RuntimeRfExceptionDto) {
    return this.operationsRuntimeService.reportRfException(warehouseId, dto);
  }

  @RequireWarehousePermissions('integration.read')
  @Get('integrations/command-center')
  getIntegrationCommandCenter(@Param('warehouseId') warehouseId: string) {
    return this.operationsRuntimeService.getIntegrationCommandCenter(warehouseId);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('integrations/events')
  ingestIntegrationEvent(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: RuntimeIntegrationEventIngestDto,
  ) {
    return this.operationsRuntimeService.ingestIntegrationEvent(warehouseId, dto);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('integrations/events/:eventId/apply')
  applyIntegrationEvent(
    @Param('warehouseId') warehouseId: string,
    @Param('eventId') eventId: string,
    @Body() dto: RuntimeIntegrationEventApplyDto,
  ) {
    return this.operationsRuntimeService.applyIntegrationEvent(warehouseId, eventId, dto);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('integrations/events/:eventId/retry')
  retryIntegrationEvent(
    @Param('warehouseId') warehouseId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.operationsRuntimeService.retryIntegrationEvent(warehouseId, eventId);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('integrations/reconciliation-runs')
  runReconciliation(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: RuntimeReconciliationRunDto,
  ) {
    return this.operationsRuntimeService.runReconciliation(warehouseId, dto);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('integrations/print/test-label')
  testPrintLabel(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: RuntimePrintLabelTestDto,
  ) {
    return this.operationsRuntimeService.testPrintLabel(warehouseId, dto);
  }


  @RequireWarehousePermissions('warehouse.read')
  @Get('configuration/rules')
  listRules(@Param('warehouseId') warehouseId: string, @Query('type') type?: RuntimeRuleType) {
    return this.operationsRuntimeService.listRules(warehouseId, type);
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Post('configuration/rules')
  upsertRule(@Param('warehouseId') warehouseId: string, @Body() dto: RuntimeRuleUpsertDto) {
    return this.operationsRuntimeService.upsertRule(warehouseId, dto);
  }

  @RequireWarehousePermissions('warehouse.read')
  @Post('configuration/rules/evaluate')
  evaluateRules(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: RuntimeRuleEvaluationDto,
  ) {
    return this.operationsRuntimeService.evaluateRules(warehouseId, dto);
  }
}
