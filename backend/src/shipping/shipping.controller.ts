import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AddShipmentPackageDto } from './dto/add-shipment-package.dto';
import { CreatePackingStationDto } from './dto/create-packing-station.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { GenerateCarrierLabelDto } from './dto/generate-carrier-label.dto';
import { ListShipmentPackagesQueryDto } from './dto/list-shipment-packages-query.dto';
import { ListShipmentsQueryDto } from './dto/list-shipments-query.dto';
import { ShipShipmentDto } from './dto/ship-shipment.dto';
import { StageShipmentDto } from './dto/stage-shipment.dto';
import { ShippingService } from './shipping.service';

@ApiTags('packing-shipping')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @RequireWarehousePermissions('packing.read')
  @Get('packing-stations')
  listStations(@Param('warehouseId') warehouseId: string) {
    return this.shippingService.listStations(warehouseId);
  }

  @RequireWarehousePermissions('packing.manage')
  @Post('packing-stations')
  createStation(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreatePackingStationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shippingService.createStation(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('shipment.read')
  @Get('shipments')
  listShipments(
    @Param('warehouseId') warehouseId: string,
    @Query() query: ListShipmentsQueryDto,
  ) {
    return this.shippingService.listShipments(warehouseId, query);
  }

  @RequireWarehousePermissions('shipment.manage')
  @Post('shipments')
  createShipment(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateShipmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shippingService.createShipment(warehouseId, dto, actor);
  }


  @RequireWarehousePermissions('shipment.read')
  @Get('shipments/:shipmentId/packages')
  listPackages(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Query() query: ListShipmentPackagesQueryDto,
  ) {
    return this.shippingService.listPackages(warehouseId, shipmentId, query);
  }

  @RequireWarehousePermissions('shipment.manage')
  @Post('shipments/:shipmentId/packages')
  addPackage(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: AddShipmentPackageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shippingService.addPackage(warehouseId, shipmentId, dto, actor);
  }

  @RequireWarehousePermissions('shipment.manage')
  @Post('shipments/:shipmentId/labels')
  generateLabel(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: GenerateCarrierLabelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shippingService.generateLabel(warehouseId, shipmentId, dto, actor);
  }

  @RequireWarehousePermissions('shipment.manage')
  @Post('shipments/:shipmentId/stage')
  stageShipment(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: StageShipmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shippingService.stageShipment(warehouseId, shipmentId, dto, actor);
  }

  @RequireWarehousePermissions('shipment.manage')
  @Post('shipments/:shipmentId/ship')
  shipShipment(
    @Param('warehouseId') warehouseId: string,
    @Param('shipmentId') shipmentId: string,
    @Body() dto: ShipShipmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shippingService.shipShipment(warehouseId, shipmentId, dto, actor);
  }
}
