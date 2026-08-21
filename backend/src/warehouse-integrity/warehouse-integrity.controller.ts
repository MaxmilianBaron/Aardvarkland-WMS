import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { WarehouseIntegrityService } from './warehouse-integrity.service';

@ApiTags('warehouse-integrity')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/integrity')
export class WarehouseIntegrityController {
  constructor(private readonly warehouseIntegrityService: WarehouseIntegrityService) {}

  @RequireWarehousePermissions('integrity.read')
  @ApiOkResponse({ description: 'Warehouse stock, packing, shipping, and freeze invariants.' })
  @Get('check')
  check(@Param('warehouseId') warehouseId: string) {
    return this.warehouseIntegrityService.checkWarehouse(warehouseId);
  }
}
