import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CycleCountsService } from './cycle-counts.service';
import { ApproveCycleCountDto } from './dto/approve-cycle-count.dto';
import { CreateCycleCountPlanDto } from './dto/create-cycle-count-plan.dto';
import { ReleaseCycleCountPlanDto } from './dto/release-cycle-count-plan.dto';
import { SubmitCycleCountDto } from './dto/submit-cycle-count.dto';

@ApiTags('cycle-counts')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/cycle-counts')
export class CycleCountsController {
  constructor(private readonly cycleCountsService: CycleCountsService) {}

  @RequireWarehousePermissions('cycle-count.read')
  @Get()
  listPlans(@Param('warehouseId') warehouseId: string) {
    return this.cycleCountsService.listPlans(warehouseId);
  }

  @RequireWarehousePermissions('cycle-count.manage')
  @Post()
  createPlan(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateCycleCountPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.cycleCountsService.createPlan(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('cycle-count.manage')
  @Post(':planId/release')
  releasePlan(
    @Param('warehouseId') warehouseId: string,
    @Param('planId') planId: string,
    @Body() dto: ReleaseCycleCountPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.cycleCountsService.releasePlan(warehouseId, planId, dto, actor);
  }

  @RequireWarehousePermissions('cycle-count.read')
  @Get(':planId/tasks')
  listTasks(@Param('warehouseId') warehouseId: string, @Param('planId') planId: string) {
    return this.cycleCountsService.listTasks(warehouseId, planId);
  }

  @RequireWarehousePermissions('cycle-count.manage')
  @Post('tasks/:taskId/submit')
  submitTask(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: SubmitCycleCountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.cycleCountsService.submitTask(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('cycle-count.manage')
  @Post('tasks/:taskId/approve')
  approveTask(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ApproveCycleCountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.cycleCountsService.approveTask(warehouseId, taskId, dto, actor);
  }
}
