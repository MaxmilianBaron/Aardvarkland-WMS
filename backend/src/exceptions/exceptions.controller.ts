import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { ListExceptionsQueryDto } from './dto/list-exceptions-query.dto';
import { UpdateExceptionDto } from './dto/update-exception.dto';
import { ExceptionsService } from './exceptions.service';

@ApiTags('exceptions')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId')
export class ExceptionsController {
  constructor(private readonly exceptionsService: ExceptionsService) {}

  @RequireWarehousePermissions('exception.read')
  @Get('exceptions')
  findMany(@Param('warehouseId') warehouseId: string, @Query() query: ListExceptionsQueryDto) {
    return this.exceptionsService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('exception.manage')
  @Post('parcels/:parcelId/exceptions')
  createForParcel(
    @Param('warehouseId') warehouseId: string,
    @Param('parcelId') parcelId: string,
    @Body() dto: CreateExceptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.exceptionsService.createForParcel(warehouseId, parcelId, dto, actor);
  }

  @RequireWarehousePermissions('exception.manage')
  @Patch('exceptions/:exceptionId')
  update(
    @Param('warehouseId') warehouseId: string,
    @Param('exceptionId') exceptionId: string,
    @Body() dto: UpdateExceptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.exceptionsService.update(warehouseId, exceptionId, dto, actor);
  }
}
