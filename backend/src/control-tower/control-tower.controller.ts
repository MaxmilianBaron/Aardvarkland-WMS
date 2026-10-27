import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { ControlTowerService } from './control-tower.service';
import { ControlTowerQueryDto } from './dto/control-tower-query.dto';

@ApiTags('control-tower')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/control-tower')
export class ControlTowerController {
  constructor(private readonly controlTowerService: ControlTowerService) {}

  @RequireWarehousePermissions('control-tower.read')
  @ApiOkResponse({ description: 'Operational warehouse control tower overview.' })
  @Get('overview')
  overview(@Param('warehouseId') warehouseId: string, @Query() query: ControlTowerQueryDto) {
    return this.controlTowerService.getOverview(warehouseId, query);
  }
}
