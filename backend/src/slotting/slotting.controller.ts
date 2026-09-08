import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateSlottingRuleDto } from './dto/create-slotting-rule.dto';
import { EvaluateSlottingDto } from './dto/evaluate-slotting.dto';
import { ListSlottingRecommendationsQueryDto } from './dto/list-slotting-recommendations-query.dto';
import { ListSlottingVelocitiesQueryDto } from './dto/list-slotting-velocities-query.dto';
import { UpsertSkuVelocityDto } from './dto/upsert-sku-velocity.dto';
import { SlottingService } from './slotting.service';

@ApiTags('slotting')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/slotting')
export class SlottingController {
  constructor(private readonly slottingService: SlottingService) {}

  @RequireWarehousePermissions('slotting.read')
  @ApiOkResponse({ description: 'List slotting rules for the warehouse.' })
  @Get('rules')
  listRules(@Param('warehouseId') warehouseId: string) {
    return this.slottingService.listRules(warehouseId);
  }

  @RequireWarehousePermissions('slotting.manage')
  @ApiOkResponse({ description: 'Create a slotting optimization rule.' })
  @Post('rules')
  createRule(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateSlottingRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.slottingService.createRule(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('slotting.read')
  @ApiOkResponse({ description: 'List SKU velocity scores.' })
  @Get('velocities')
  listVelocities(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListSlottingVelocitiesQueryDto,
  ) {
    return this.slottingService.listVelocities(warehouseId, query);
  }

  @RequireWarehousePermissions('slotting.manage')
  @ApiOkResponse({ description: 'Create or update a SKU velocity score.' })
  @Post('velocities')
  upsertVelocity(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: UpsertSkuVelocityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.slottingService.upsertVelocity(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('slotting.manage')
  @ApiOkResponse({ description: 'Evaluate slotting and optionally create recommendations.' })
  @Post('evaluate')
  evaluate(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: EvaluateSlottingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.slottingService.evaluate(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('slotting.read')
  @ApiOkResponse({ description: 'List slotting recommendations.' })
  @Get('recommendations')
  listRecommendations(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListSlottingRecommendationsQueryDto,
  ) {
    return this.slottingService.listRecommendations(warehouseId, query);
  }

  @RequireWarehousePermissions('slotting.manage')
  @ApiOkResponse({
    description: 'Apply a slotting recommendation and create a MOVE task when possible.',
  })
  @Post('recommendations/:recommendationId/apply')
  applyRecommendation(
    @Param('warehouseId') warehouseId: string,
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.slottingService.applyRecommendation(warehouseId, recommendationId, actor);
  }

  @RequireWarehousePermissions('slotting.manage')
  @ApiOkResponse({ description: 'Dismiss a slotting recommendation.' })
  @Post('recommendations/:recommendationId/dismiss')
  dismissRecommendation(
    @Param('warehouseId') warehouseId: string,
    @Param('recommendationId') recommendationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.slottingService.dismissRecommendation(warehouseId, recommendationId, actor);
  }
}
