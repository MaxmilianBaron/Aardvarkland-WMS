import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import {
  AssignDockDoorDto,
  AutomationHeartbeatDto,
  CompleteAutomationCommandDto,
  ConfirmVasTaskDto,
  CreateCrossDockPlanDto,
  CreateDockDoorDto,
  CreateKitBomDto,
  CreateVasServiceDto,
  CreateVasTaskDto,
  CreateWebhookSubscriptionDto,
  EnqueueAutomationCommandDto,
  RecordDomainEventDto,
  RegisterAutomationDeviceDto,
  ScheduleDockAppointmentDto,
  YardTrailerCheckInDto,
} from './dto/enterprise-ops.dto';
import { EnterpriseOpsService } from './enterprise-ops.service';

@ApiTags('enterprise-ops')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/enterprise-ops')
export class EnterpriseOpsController {
  constructor(private readonly enterpriseOpsService: EnterpriseOpsService) {}

  @RequireWarehousePermissions('automation.read')
  @Get('automation/devices')
  listAutomationDevices(@Param('warehouseId') warehouseId: string) {
    return this.enterpriseOpsService.listAutomationDevices(warehouseId);
  }

  @RequireWarehousePermissions('automation.manage')
  @Post('automation/devices')
  registerAutomationDevice(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: RegisterAutomationDeviceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.registerAutomationDevice(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('automation.manage')
  @Post('automation/devices/:deviceId/heartbeat')
  recordAutomationHeartbeat(
    @Param('warehouseId') warehouseId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: AutomationHeartbeatDto,
  ) {
    return this.enterpriseOpsService.recordAutomationHeartbeat(warehouseId, deviceId, dto);
  }

  @RequireWarehousePermissions('automation.manage')
  @Post('automation/commands')
  enqueueAutomationCommand(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: EnqueueAutomationCommandDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.enqueueAutomationCommand(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('automation.manage')
  @Post('automation/commands/claim-next')
  claimNextAutomationCommand(
    @Param('warehouseId') warehouseId: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.enterpriseOpsService.claimNextAutomationCommand(warehouseId, deviceId);
  }

  @RequireWarehousePermissions('automation.manage')
  @Patch('automation/commands/:commandId/complete')
  completeAutomationCommand(
    @Param('warehouseId') warehouseId: string,
    @Param('commandId') commandId: string,
    @Body() dto: CompleteAutomationCommandDto,
  ) {
    return this.enterpriseOpsService.completeAutomationCommand(warehouseId, commandId, dto);
  }

  @RequireWarehousePermissions('yard.read')
  @Get('yard/dock-doors')
  listDockDoors(@Param('warehouseId') warehouseId: string) {
    return this.enterpriseOpsService.listDockDoors(warehouseId);
  }

  @RequireWarehousePermissions('yard.manage')
  @Post('yard/dock-doors')
  createDockDoor(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateDockDoorDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.createDockDoor(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('yard.manage')
  @Post('yard/appointments')
  scheduleDockAppointment(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: ScheduleDockAppointmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.scheduleDockAppointment(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('yard.manage')
  @Post('yard/trailers/check-in')
  checkInTrailer(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: YardTrailerCheckInDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.checkInTrailer(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('yard.manage')
  @Patch('yard/appointments/:appointmentId/assign-dock')
  assignDockDoor(
    @Param('warehouseId') warehouseId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: AssignDockDoorDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.assignDockDoor(warehouseId, appointmentId, dto, actor);
  }

  @RequireWarehousePermissions('cross-dock.manage')
  @Post('cross-dock/plans')
  createCrossDockPlan(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateCrossDockPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.createCrossDockPlan(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('cross-dock.manage')
  @Patch('cross-dock/plans/:planId/release')
  releaseCrossDockPlan(
    @Param('warehouseId') warehouseId: string,
    @Param('planId') planId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.releaseCrossDockPlan(warehouseId, planId, actor);
  }

  @RequireWarehousePermissions('vas.manage')
  @Post('vas/services')
  createVasService(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateVasServiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.createVasService(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('vas.manage')
  @Post('vas/kits')
  createKitBom(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateKitBomDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.createKitBom(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('vas.manage')
  @Post('vas/tasks')
  createVasTask(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateVasTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.createVasTask(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('vas.manage')
  @Patch('vas/tasks/:taskId/confirm')
  confirmVasTask(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmVasTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.confirmVasTask(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('integration.read')
  @Get('domain-events')
  listDomainEvents(@Param('warehouseId') warehouseId: string) {
    return this.enterpriseOpsService.listDomainEvents(warehouseId);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('domain-events')
  recordDomainEvent(@Param('warehouseId') warehouseId: string, @Body() dto: RecordDomainEventDto) {
    return this.enterpriseOpsService.recordDomainEvent(warehouseId, dto);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('webhook-subscriptions')
  createWebhookSubscription(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateWebhookSubscriptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.enterpriseOpsService.createWebhookSubscription(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('integration.manage')
  @Post('domain-events/:eventId/replay')
  replayDomainEvent(@Param('warehouseId') warehouseId: string, @Param('eventId') eventId: string) {
    return this.enterpriseOpsService.replayDomainEvent(warehouseId, eventId);
  }
}
