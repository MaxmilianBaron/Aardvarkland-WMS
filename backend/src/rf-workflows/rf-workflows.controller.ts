import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CancelRfSessionDto } from './dto/cancel-rf-session.dto';
import { ReportRfExceptionDto } from './dto/report-rf-exception.dto';
import { ScanRfStepDto } from './dto/scan-rf-step.dto';
import { StartRfSessionDto } from './dto/start-rf-session.dto';
import { SyncRfOfflineQueueDto } from './dto/sync-rf-offline-queue.dto';
import { RfWorkflowsService } from './rf-workflows.service';

@ApiTags('rf-workflows')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/rf')
export class RfWorkflowsController {
  constructor(private readonly rfWorkflowsService: RfWorkflowsService) {}


  @RequireWarehousePermissions('rf.read')
  @Get('queue')
  getQueue(
    @Param('warehouseId') warehouseId: string,
    @Query('workflow') workflow?: string,
    @Query('zone') zone?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('limit') limit?: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.getQueue(warehouseId, {
      workflow,
      zone,
      assignedToMe: assignedToMe === 'true',
      limit: limit ? Number(limit) : undefined,
      actor,
    });
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('offline/sync')
  syncOfflineQueue(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: SyncRfOfflineQueueDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.syncOfflineQueue(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('sessions')
  startSession(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: StartRfSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.startSession(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('rf.read')
  @Get('sessions/:sessionId')
  getSession(@Param('warehouseId') warehouseId: string, @Param('sessionId') sessionId: string) {
    return this.rfWorkflowsService.getSession(warehouseId, sessionId);
  }


  @RequireWarehousePermissions('rf.manage')
  @Post('sessions/:sessionId/resume')
  resumeSession(@Param('warehouseId') warehouseId: string, @Param('sessionId') sessionId: string) {
    return this.rfWorkflowsService.resumeSession(warehouseId, sessionId);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('sessions/:sessionId/cancel')
  cancelSession(
    @Param('warehouseId') warehouseId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CancelRfSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.cancelSession(warehouseId, sessionId, dto, actor);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('sessions/:sessionId/heartbeat')
  heartbeat(@Param('warehouseId') warehouseId: string, @Param('sessionId') sessionId: string) {
    return this.rfWorkflowsService.heartbeat(warehouseId, sessionId);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('sessions/:sessionId/scan')
  scan(
    @Param('warehouseId') warehouseId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ScanRfStepDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.scan(warehouseId, sessionId, dto, actor);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('tasks/:taskId/start')
  startTask(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: StartRfSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.startTask(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('rf.manage')
  @Post('tasks/:taskId/report-exception')
  reportTaskException(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ReportRfExceptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rfWorkflowsService.reportTaskException(warehouseId, taskId, dto, actor);
  }
}
