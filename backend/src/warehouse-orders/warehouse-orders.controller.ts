import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser, CurrentUser, RequireWarehousePermissions } from '../access-control';
import { CancelWarehouseOrderDto } from './dto/cancel-warehouse-order.dto';
import { CompleteWarehouseOrderDto } from './dto/complete-warehouse-order.dto';
import { CreateWarehouseOrderDto } from './dto/create-warehouse-order.dto';
import { ListWarehouseOrdersQueryDto } from './dto/list-warehouse-orders-query.dto';
import { WarehouseOrdersService } from './warehouse-orders.service';

@ApiTags('warehouse-orders')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/warehouse-orders')
export class WarehouseOrdersController {
  constructor(private readonly warehouseOrdersService: WarehouseOrdersService) {}

  @RequireWarehousePermissions('task.read')
  @Get()
  listOrders(@Param('warehouseId') warehouseId: string, @Query() query: ListWarehouseOrdersQueryDto) {
    return this.warehouseOrdersService.listOrders(warehouseId, query);
  }

  @RequireWarehousePermissions('task.manage')
  @Post()
  createOrder(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateWarehouseOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseOrdersService.createOrder(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('task.read')
  @Get(':orderId')
  getOrder(@Param('warehouseId') warehouseId: string, @Param('orderId') orderId: string) {
    return this.warehouseOrdersService.getOrder(warehouseId, orderId);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':orderId/release')
  releaseOrder(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseOrdersService.releaseOrder(warehouseId, orderId, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Post(':orderId/complete')
  completeOrder(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteWarehouseOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseOrdersService.completeOrder(warehouseId, orderId, dto, actor);
  }

  @RequireWarehousePermissions('task.manage')
  @Patch(':orderId/cancel')
  cancelOrder(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CancelWarehouseOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehouseOrdersService.cancelOrder(warehouseId, orderId, dto, actor);
  }
}
