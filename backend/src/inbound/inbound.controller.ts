import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateInboundShipmentDto } from './dto/create-inbound-shipment.dto';
import { ListInboundShipmentsQueryDto } from './dto/list-inbound-shipments-query.dto';
import { ReceiveInboundLineDto } from './dto/receive-inbound-line.dto';
import { UpdateInboundShipmentDto } from './dto/update-inbound-shipment.dto';
import { InboundService } from './inbound.service';

@ApiTags('inbound')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/inbound-shipments')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @RequireWarehousePermissions('inbound.read')
  @Get()
  findMany(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListInboundShipmentsQueryDto,
  ) {
    return this.inboundService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('inbound.read')
  @Get(':shipmentId')
  findOne(@Param('warehouseId') warehouseId: string, @Param('shipmentId') shipmentId: string) {
    return this.inboundService.findOne(warehouseId, shipmentId);
  }

  @RequireWarehousePermissions('inbound.manage')
  @Post()
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateInboundShipmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inboundService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inbound.manage')
  @Patch(':shipmentId')
  update(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: UpdateInboundShipmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inboundService.update(warehouseId, shipmentId, dto, actor);
  }

  @RequireWarehousePermissions('inbound.manage', 'inventory.move', 'task.manage')
  @Post(':shipmentId/receive')
  receive(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: ReceiveInboundLineDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inboundService.receive(warehouseId, shipmentId, dto, actor);
  }
}
