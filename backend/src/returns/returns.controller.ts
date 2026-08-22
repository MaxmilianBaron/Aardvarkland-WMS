import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateReturnOrderDto } from './dto/create-return-order.dto';
import { InspectReturnLineDto } from './dto/inspect-return-line.dto';
import { ReceiveReturnLineDto } from './dto/receive-return-line.dto';
import { ReturnsService } from './returns.service';

@ApiTags('returns')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @RequireWarehousePermissions('inventory.read')
  @Get()
  listReturns(@Param('warehouseId') warehouseId: string) {
    return this.returnsService.listReturns(warehouseId);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get(':returnId')
  getReturn(@Param('warehouseId') warehouseId: string, @Param('returnId') returnId: string) {
    return this.returnsService.getReturn(warehouseId, returnId);
  }

  @RequireWarehousePermissions('inventory.move')
  @Post()
  createReturn(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateReturnOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.returnsService.createReturn(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.move')
  @Post(':returnId/lines/:lineId/receive')
  receiveLine(
    @Param('warehouseId') warehouseId: string,
    @Param('returnId') returnId: string,
    @Param('lineId') lineId: string,
    @Body() dto: ReceiveReturnLineDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.returnsService.receiveLine(warehouseId, returnId, lineId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post(':returnId/lines/:lineId/inspect')
  inspectLine(
    @Param('warehouseId') warehouseId: string,
    @Param('returnId') returnId: string,
    @Param('lineId') lineId: string,
    @Body() dto: InspectReturnLineDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.returnsService.inspectLine(warehouseId, returnId, lineId, dto, actor);
  }
}
