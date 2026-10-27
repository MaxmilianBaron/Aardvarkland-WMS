import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { ConfirmPutawayTaskDto } from './dto/confirm-putaway-task.dto';
import { CreatePutawayTaskDto } from './dto/create-putaway-task.dto';
import { SuggestPutawayDto } from './dto/suggest-putaway.dto';
import { PutawayService } from './putaway.service';

@ApiTags('putaway')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/putaway')
export class PutawayController {
  constructor(private readonly putawayService: PutawayService) {}

  @RequireWarehousePermissions('inventory.read')
  @Post('suggest')
  suggest(@Param('warehouseId') warehouseId: string, @Body() dto: SuggestPutawayDto) {
    return this.putawayService.suggest(warehouseId, dto);
  }

  @RequireWarehousePermissions('inventory.move', 'task.manage')
  @Post('tasks')
  createTask(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreatePutawayTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.putawayService.createTask(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.move', 'task.manage')
  @Post('tasks/:taskId/confirm')
  confirmTask(
    @Param('warehouseId') warehouseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmPutawayTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.putawayService.confirmTask(warehouseId, taskId, dto, actor);
  }
}
