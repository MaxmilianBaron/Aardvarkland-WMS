import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateOutboundOrderDto } from './dto/create-outbound-order.dto';
import { ListOutboundOrdersQueryDto } from './dto/list-outbound-orders-query.dto';
import { UpdateOutboundOrderDto } from './dto/update-outbound-order.dto';
import { OutboundService } from './outbound.service';

@ApiTags('outbound')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/outbound-orders')
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @RequireWarehousePermissions('outbound.read')
  @Get()
  findMany(@Param('warehouseId') warehouseId: string, @Query() query: ListOutboundOrdersQueryDto) {
    return this.outboundService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('outbound.read')
  @Get(':orderId')
  findOne(@Param('warehouseId') warehouseId: string, @Param('orderId') orderId: string) {
    return this.outboundService.findOne(warehouseId, orderId);
  }

  @RequireWarehousePermissions('outbound.manage')
  @Post()
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateOutboundOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.outboundService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('outbound.manage')
  @Patch(':orderId')
  update(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOutboundOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.outboundService.update(warehouseId, orderId, dto, actor);
  }
}
