import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AssignWarehouseTaskDto } from './dto/assign-warehouse-task.dto';
import { CancelWarehouseTaskDto } from './dto/cancel-warehouse-task.dto';
import { ClaimNextWarehouseTaskDto } from './dto/claim-next-warehouse-task.dto';
import { ConfirmWarehouseTaskDto } from './dto/confirm-warehouse-task.dto';
import { CreateWarehouseTaskDto } from './dto/create-warehouse-task.dto';
import { ListWarehouseTasksQueryDto } from './dto/list-warehouse-tasks-query.dto';
import { FailWarehouseTaskDto } from './dto/fail-warehouse-task.dto';
import { StartWarehouseTaskDto } from './dto/start-warehouse-task.dto';
import { WarehouseTasksService } from './warehouse-tasks.service';

@ApiTags('warehouse-tasks')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/tasks')
export class WarehouseTasksController {
  constructor(private readonly warehouseTasksService: WarehouseTasksService) {}

  @RequireWarehousePermissions('task.read')
  @Get()
  findMany(@Param('warehouseId') warehouseId: string, @Query() query: ListWarehouseTasksQueryDto) {
    return this.warehouseTasksService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('task.read')
  @Get(':taskId')
  findOne(@Param('warehouseId') warehouseId: string, @Param('taskId') taskId: string) {
    return this.warehouseTasksService.findOne(warehouseId, taskId);
  }

  @RequireWarehousePermissions('task.manage')
  @Post()
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post('claim-next')
  claimNext(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: ClaimNextWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.claimNext(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':taskId/assign')
  assign(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: AssignWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.assign(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':taskId/start')
  start(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: StartWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.start(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':taskId/confirm')
  confirm(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.confirm(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':taskId/fail')
  fail(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: FailWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.fail(warehouseId, taskId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':taskId/cancel')
  cancel(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CancelWarehouseTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseTasksService.cancel(warehouseId, taskId, dto, actor);
  }
}
