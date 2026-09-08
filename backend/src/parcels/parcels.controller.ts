import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { ListParcelsQueryDto } from './dto/list-parcels-query.dto';
import { UpdateParcelDto } from './dto/update-parcel.dto';
import { ParcelsService } from './parcels.service';

@ApiTags('parcels')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/parcels')
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @RequireWarehousePermissions('parcel.read')
  @Get()
  findMany(@Param('warehouseId') warehouseId: string, @Query() query: ListParcelsQueryDto) {
    return this.parcelsService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('parcel.read')
  @Get(':parcelId')
  findOne(@Param('warehouseId') warehouseId: string, @Param('parcelId') parcelId: string) {
    return this.parcelsService.findOne(warehouseId, parcelId);
  }

  @RequireWarehousePermissions('parcel.manage')
  @Post()
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateParcelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.parcelsService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('parcel.manage')
  @Patch(':parcelId')
  update(
    @Param('warehouseId') warehouseId: string,
    @Param('parcelId') parcelId: string,
    @Body() dto: UpdateParcelDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.parcelsService.update(warehouseId, parcelId, dto, actor);
  }
}
