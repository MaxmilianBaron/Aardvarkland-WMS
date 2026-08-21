import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RequireWarehousePermissions('notification.read')
  @ApiOkResponse({ description: 'Warehouse notifications.' })
  @Get()
  findMany(@Param('warehouseId') warehouseId: string, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.findMany(warehouseId, query);
  }

  @RequireWarehousePermissions('notification.manage')
  @ApiCreatedResponse({ description: 'Notification created.' })
  @Post()
  create(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateNotificationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.create(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('notification.manage')
  @ApiOkResponse({ description: 'Notification marked as read.' })
  @Patch(':notificationId/read')
  markRead(
    @Param('warehouseId') warehouseId: string,
    @Param('notificationId') notificationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.markRead(warehouseId, notificationId, actor);
  }
}
