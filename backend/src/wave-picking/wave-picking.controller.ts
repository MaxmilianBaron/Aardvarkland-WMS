import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AssignPickCartDto } from './dto/assign-pick-cart.dto';
import { CreatePickCartDto } from './dto/create-pick-cart.dto';
import { CreatePickToteDto } from './dto/create-pick-tote.dto';
import { CreatePickWaveDto } from './dto/create-pick-wave.dto';
import { ListPickWavesQueryDto } from './dto/list-pick-waves-query.dto';
import { ReleasePickWaveDto } from './dto/release-pick-wave.dto';
import { WavePickingService } from './wave-picking.service';

@ApiTags('wave-picking')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId')
export class WavePickingController {
  constructor(private readonly wavePickingService: WavePickingService) {}

  @RequireWarehousePermissions('wave.read')
  @ApiOkResponse({ description: 'List pick waves for a warehouse.' })
  @Get('pick-waves')
  listWaves(@Param('warehouseId') warehouseId: string, @Query() query: ListPickWavesQueryDto) {
    return this.wavePickingService.listWaves(warehouseId, query);
  }

  @RequireWarehousePermissions('wave.read')
  @ApiOkResponse({ description: 'Get a pick wave with orders, linked tasks, carts, and totes.' })
  @Get('pick-waves/:waveId')
  getWave(@Param('warehouseId') warehouseId: string, @Param('waveId') waveId: string) {
    return this.wavePickingService.getWave(warehouseId, waveId);
  }

  @RequireWarehousePermissions('wave.manage')
  @ApiOkResponse({ description: 'Create a pick wave from explicit orders or planning filters.' })
  @Post('pick-waves')
  createWave(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreatePickWaveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.wavePickingService.createWave(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('wave.manage')
  @ApiOkResponse({ description: 'Release a pick wave and link/create PICK tasks.' })
  @Post('pick-waves/:waveId/release')
  releaseWave(
    @Param('warehouseId') warehouseId: string,
    @Param('waveId') waveId: string,
    @Body() dto: ReleasePickWaveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.wavePickingService.releaseWave(warehouseId, waveId, dto, actor);
  }

  @RequireWarehousePermissions('wave.manage')
  @ApiOkResponse({ description: 'Assign a pick cart to a wave.' })
  @Post('pick-waves/:waveId/assign-cart')
  assignCart(
    @Param('warehouseId') warehouseId: string,
    @Param('waveId') waveId: string,
    @Body() dto: AssignPickCartDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.wavePickingService.assignCart(warehouseId, waveId, dto, actor);
  }

  @RequireWarehousePermissions('wave.manage')
  @ApiOkResponse({ description: 'Complete a wave after all linked PICK tasks are done.' })
  @Post('pick-waves/:waveId/complete')
  completeWave(
    @Param('warehouseId') warehouseId: string,
    @Param('waveId') waveId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.wavePickingService.completeWave(warehouseId, waveId, actor);
  }

  @RequireWarehousePermissions('wave.read')
  @ApiOkResponse({ description: 'List pick carts.' })
  @Get('pick-carts')
  listCarts(@Param('warehouseId') warehouseId: string) {
    return this.wavePickingService.listCarts(warehouseId);
  }

  @RequireWarehousePermissions('wave.manage')
  @ApiOkResponse({ description: 'Create a pick cart.' })
  @Post('pick-carts')
  createCart(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreatePickCartDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.wavePickingService.createCart(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('wave.manage')
  @ApiOkResponse({ description: 'Create/assign a pick tote.' })
  @Post('pick-totes')
  createTote(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreatePickToteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.wavePickingService.createTote(warehouseId, dto, actor);
  }
}
