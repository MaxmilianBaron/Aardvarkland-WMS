import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { BlockStockDto } from './dto/block-stock.dto';
import { ListStockBalancesQueryDto } from './dto/list-stock-balances-query.dto';
import { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto';
import { ListStockQuantsQueryDto } from './dto/list-stock-quants-query.dto';
import { MoveStockDto } from './dto/move-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { UnblockStockDto } from './dto/unblock-stock.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequireWarehousePermissions('inventory.read')
  @Get('quants')
  findQuants(@Param('warehouseId') warehouseId: string, @Query() query: ListStockQuantsQueryDto) {
    return this.inventoryService.findQuants(warehouseId, query);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('quants/:quantId')
  findQuant(@Param('warehouseId') warehouseId: string, @Param('quantId') quantId: string) {
    return this.inventoryService.findQuant(warehouseId, quantId);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('balances')
  findBalances(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListStockBalancesQueryDto,
  ) {
    return this.inventoryService.findBalances(warehouseId, query);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('consistency')
  checkConsistency(@Param('warehouseId') warehouseId: string) {
    return this.inventoryService.checkConsistency(warehouseId);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('balances/rebuild-preview')
  rebuildBalancePreview(@Param('warehouseId') warehouseId: string) {
    return this.inventoryService.rebuildBalancePreview(warehouseId);
  }

  @RequireWarehousePermissions('inventory.move')
  @Post('quants/receive')
  receive(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: ReceiveStockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.receive(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.move')
  @Post('quants/move')
  move(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: MoveStockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.move(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('quants/adjust')
  adjust(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.adjust(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('quants/:quantId/block')
  block(
    @Param('warehouseId') warehouseId: string,
    @Param('quantId') quantId: string,
    @Body() dto: BlockStockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.block(warehouseId, quantId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('quants/:quantId/unblock')
  unblock(
    @Param('warehouseId') warehouseId: string,
    @Param('quantId') quantId: string,
    @Body() dto: UnblockStockDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventoryService.unblock(warehouseId, quantId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('movements')
  findMovements(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListStockMovementsQueryDto,
  ) {
    return this.inventoryService.findMovements(warehouseId, query);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('movements/:movementId')
  findMovement(@Param('warehouseId') warehouseId: string, @Param('movementId') movementId: string) {
    return this.inventoryService.findMovement(warehouseId, movementId);
  }
}
