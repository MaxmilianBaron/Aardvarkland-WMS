import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequireWarehousePermissions, AuthenticatedUser } from '../access-control';
import { CreateLotDto } from './dto/create-lot.dto';
import { CreateSerialNumberEventDto } from './dto/create-serial-number-event.dto';
import { CreateSerialNumberDto } from './dto/create-serial-number.dto';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { ListSerialNumbersQueryDto } from './dto/list-serial-numbers-query.dto';
import { RecallReportQueryDto } from './dto/recall-report-query.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { UpdateSerialNumberDto } from './dto/update-serial-number.dto';
import { TraceabilityService } from './traceability.service';

@ApiTags('traceability')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/traceability')
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @RequireWarehousePermissions('inventory.read')
  @Get('lots')
  listLots(@Param('warehouseId') warehouseId: string, @Query() query: ListLotsQueryDto) {
    return this.traceabilityService.listLots(warehouseId, query);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('lots')
  createLot(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateLotDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.traceabilityService.createLot(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('lots/:lotId')
  getLot(@Param('warehouseId') warehouseId: string, @Param('lotId') lotId: string) {
    return this.traceabilityService.getLot(warehouseId, lotId);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Patch('lots/:lotId')
  updateLot(
    @Param('warehouseId') warehouseId: string,
    @Param('lotId') lotId: string,
    @Body() dto: UpdateLotDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.traceabilityService.updateLot(warehouseId, lotId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('recall-report')
  getRecallGenealogyReport(
    @Param('warehouseId') warehouseId: string,
    @Query() query: RecallReportQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.traceabilityService.getRecallGenealogyReport(warehouseId, query, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('serial-numbers')
  listSerialNumbers(@Param('warehouseId') warehouseId: string, @Query() query: ListSerialNumbersQueryDto) {
    return this.traceabilityService.listSerialNumbers(warehouseId, query);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('serial-numbers')
  createSerialNumber(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateSerialNumberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.traceabilityService.createSerialNumber(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('serial-numbers/:serialNumberId')
  getSerialNumber(@Param('warehouseId') warehouseId: string, @Param('serialNumberId') serialNumberId: string) {
    return this.traceabilityService.getSerialNumber(warehouseId, serialNumberId);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Patch('serial-numbers/:serialNumberId')
  updateSerialNumber(
    @Param('warehouseId') warehouseId: string,
    @Param('serialNumberId') serialNumberId: string,
    @Body() dto: UpdateSerialNumberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.traceabilityService.updateSerialNumber(warehouseId, serialNumberId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('serial-numbers/:serialNumberId/events')
  listSerialNumberEvents(@Param('warehouseId') warehouseId: string, @Param('serialNumberId') serialNumberId: string) {
    return this.traceabilityService.listSerialNumberEvents(warehouseId, serialNumberId);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('serial-numbers/:serialNumberId/events')
  createSerialNumberEvent(
    @Param('warehouseId') warehouseId: string,
    @Param('serialNumberId') serialNumberId: string,
    @Body() dto: CreateSerialNumberEventDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.traceabilityService.createSerialNumberEvent(warehouseId, serialNumberId, dto, actor);
  }
}
