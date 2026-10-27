import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateTrackingEventDto } from './dto/create-tracking-event.dto';
import { ListTrackingEventsQueryDto } from './dto/list-tracking-events-query.dto';
import { TrackingEventsService } from './tracking-events.service';

@ApiTags('tracking-events')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId')
export class TrackingEventsController {
  constructor(private readonly trackingEventsService: TrackingEventsService) {}

  @RequireWarehousePermissions('tracking.read')
  @Get('tracking-events')
  findMany(@Param('warehouseId') warehouseId: string, @Query() query: ListTrackingEventsQueryDto) {
    return this.trackingEventsService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('tracking.manage')
  @Post('parcels/:parcelId/tracking-events')
  createForParcel(
    @Param('warehouseId') warehouseId: string,
    @Param('parcelId') parcelId: string,
    @Body() dto: CreateTrackingEventDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.trackingEventsService.createForParcel(warehouseId, parcelId, dto, actor);
  }
}
