import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsWindowQueryDto } from './dto/analytics-window-query.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @RequireWarehousePermissions('analytics.read')
  @Get('overview')
  overview(@Param('warehouseId') warehouseId: string, @Query() query: AnalyticsWindowQueryDto) {
    return this.analyticsService.getOverview(warehouseId, query);
  }

  @RequireWarehousePermissions('analytics.read')
  @Get('parcel-status')
  parcelStatus(@Param('warehouseId') warehouseId: string) {
    return this.analyticsService.getParcelStatus(warehouseId);
  }
}
