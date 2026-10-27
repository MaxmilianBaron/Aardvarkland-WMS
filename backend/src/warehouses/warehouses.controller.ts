import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { UpdateWarehouseLocationDto } from './dto/update-warehouse-location.dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @RequirePermissions('warehouse.read')
  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser) {
    return this.warehousesService.findManyForUser(user);
  }

  @RequireWarehousePermissions('warehouse.read')
  @Get(':warehouseId')
  findById(@Param('warehouseId') warehouseId: string) {
    return this.warehousesService.findByReference(warehouseId);
  }

  @RequireWarehousePermissions('warehouse.read')
  @Get(':warehouseId/locations')
  findLocations(@Param('warehouseId') warehouseId: string) {
    return this.warehousesService.findLocations(warehouseId);
  }

  @RequireWarehousePermissions('warehouse.read')
  @Get(':warehouseId/locations/:locationId')
  findLocation(@Param('warehouseId') warehouseId: string, @Param('locationId') locationId: string) {
    return this.warehousesService.findLocation(warehouseId, locationId);
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Post(':warehouseId/locations')
  createLocation(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateWarehouseLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehousesService.createLocation(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Patch(':warehouseId/locations/:locationId')
  updateLocation(
    @Param('warehouseId') warehouseId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateWarehouseLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.warehousesService.updateLocation(warehouseId, locationId, dto, actor);
  }
}
