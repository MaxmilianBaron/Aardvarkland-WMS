import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AllocationService } from './allocation.service';
import { AllocationResponse } from './allocation.types';
import { AllocateOutboundOrderDto } from './dto/allocate-outbound-order.dto';

@ApiTags('allocation')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/outbound-orders/:orderId/allocate')
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  @RequireWarehousePermissions('outbound.manage')
  @Post()
  @ApiOperation({ summary: 'Allocate an outbound order using FEFO, FIFO, or LIFO stock reservations' })
  @ApiCreatedResponse({ type: AllocationResponse })
  allocateOutboundOrder(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AllocateOutboundOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AllocationResponse> {
    return this.allocationService.allocateOutboundOrder(warehouseId, orderId, dto ?? {}, actor);
  }
}
