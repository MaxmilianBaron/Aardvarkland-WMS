import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('observability')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @RequireWarehousePermissions('metrics.read')
  @Get('business')
  getBusinessMetrics(@Param('warehouseId') warehouseId: string) {
    return this.metricsService.getWarehouseMetrics(warehouseId);
  }
}
