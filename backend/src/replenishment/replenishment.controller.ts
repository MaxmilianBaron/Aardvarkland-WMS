import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { ConfirmReplenishmentDto } from './dto/confirm-replenishment.dto';
import { CreateReplenishmentRuleDto } from './dto/create-replenishment-rule.dto';
import { EvaluateReplenishmentDto } from './dto/evaluate-replenishment.dto';
import { ListReplenishmentDemandsQueryDto } from './dto/list-replenishment-demands-query.dto';
import { ReplenishmentService } from './replenishment.service';

@ApiTags('replenishment')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/replenishment')
export class ReplenishmentController {
  constructor(private readonly replenishmentService: ReplenishmentService) {}

  @RequireWarehousePermissions('replenishment.read')
  @Get('rules')
  listRules(@Param('warehouseId') warehouseId: string) {
    return this.replenishmentService.listRules(warehouseId);
  }

  @RequireWarehousePermissions('replenishment.manage')
  @Post('rules')
  createRule(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateReplenishmentRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.replenishmentService.createRule(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('replenishment.manage')
  @Post('evaluate')
  evaluate(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: EvaluateReplenishmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.replenishmentService.evaluate(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('replenishment.read')
  @Get('demands')
  listDemands(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListReplenishmentDemandsQueryDto,
  ) {
    return this.replenishmentService.listDemands(warehouseId, query);
  }

  @RequireWarehousePermissions('replenishment.manage')
  @Post('tasks/:taskId/confirm')
  confirmTask(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmReplenishmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.replenishmentService.confirmTask(warehouseId, taskId, dto, actor);
  }
}
