import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { ConfirmPickDto } from './dto/confirm-pick.dto';
import { PackOrderDto, ReleasePickingDto, ShipOrderDto } from './dto/fulfillment-action.dto';
import {
  FulfillmentPermissionsGuard,
  RequireAnyFulfillmentPermission,
} from './fulfillment-permissions.guard';
import { FulfillmentService } from './fulfillment.service';

@ApiTags('fulfillment')
@ApiBearerAuth()
@UseGuards(FulfillmentPermissionsGuard)
@Controller('warehouses/:warehouseId')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @RequireAnyFulfillmentPermission('fulfillment.manage', 'outbound.manage')
  @Post('outbound-orders/:orderId/release-picking')
  releasePicking(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: ReleasePickingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.fulfillmentService.releasePicking(warehouseId, orderId, dto, actor);
  }

  @RequireAnyFulfillmentPermission('fulfillment.manage', 'task.manage')
  @Post('tasks/:taskId/confirm-pick')
  confirmPick(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmPickDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.fulfillmentService.confirmPick(warehouseId, taskId, dto, actor);
  }

  @RequireAnyFulfillmentPermission('fulfillment.manage', 'outbound.manage')
  @Post('packing/:orderId/pack')
  pack(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: PackOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.fulfillmentService.pack(warehouseId, orderId, dto, actor);
  }

  @RequireAnyFulfillmentPermission('fulfillment.manage', 'outbound.manage')
  @Post('shipping/:orderId/ship')
  ship(
    @Param('warehouseId') warehouseId: string,
    @Param('orderId') orderId: string,
    @Body() dto: ShipOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.fulfillmentService.ship(warehouseId, orderId, dto, actor);
  }
}
