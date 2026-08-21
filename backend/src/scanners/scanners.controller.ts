import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateScannerDto } from './dto/create-scanner.dto';
import { CreateScannerScanDto } from './dto/create-scanner-scan.dto';
import { UpdateScannerTelemetryDto } from './dto/update-scanner-telemetry.dto';
import { UpdateScannerDto } from './dto/update-scanner.dto';
import { ScannersService } from './scanners.service';

@ApiTags('scanners')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/scanners')
export class ScannersController {
  constructor(private readonly scannersService: ScannersService) {}

  @RequireWarehousePermissions('scanner.read')
  @Get()
  findMany(@Param('warehouseId') warehouseId: string) {
    return this.scannersService.findMany(warehouseId);
  }

  @RequireWarehousePermissions('scanner.manage')
  @Post()
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateScannerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scannersService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('scanner.manage')
  @Patch(':scannerId')
  update(
    @Param('warehouseId') warehouseId: string,
    @Param('scannerId') scannerId: string,
    @Body() dto: UpdateScannerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scannersService.update(warehouseId, scannerId, dto, actor);
  }

  @RequireWarehousePermissions('rf.manage')
  @Patch(':scannerId/telemetry')
  updateTelemetry(
    @Param('warehouseId') warehouseId: string,
    @Param('scannerId') scannerId: string,
    @Body() dto: UpdateScannerTelemetryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scannersService.updateTelemetry(warehouseId, scannerId, dto, actor);
  }

  @RequireWarehousePermissions('scanner.manage')
  @Post(':scannerId/scans')
  scan(
    @Param('warehouseId') warehouseId: string,
    @Param('scannerId') scannerId: string,
    @Body() dto: CreateScannerScanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scannersService.scan(warehouseId, scannerId, dto, actor);
  }
}
