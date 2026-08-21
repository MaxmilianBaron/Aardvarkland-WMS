import { Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { RealtimeBroadcasterService } from '../realtime';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponse, NotificationStatus, NotificationType } from './notifications.types';

interface WarehouseRecord {
  id: string;
  code: string;
  name: string;
}

interface NotificationRecord {
  id: string;
  warehouseId: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StringContainsFilter {
  contains: string;
  mode: 'insensitive';
}

interface WarehouseWhereInput {
  id?: string;
  code?: string;
  OR?: Array<Pick<WarehouseWhereInput, 'id' | 'code'>>;
}

interface NotificationWhereInput {
  id?: string;
  warehouseId?: string;
  type?: NotificationType;
  status?: NotificationStatus;
  OR?: Array<{
    title?: StringContainsFilter;
    message?: StringContainsFilter;
  }>;
}

interface WarehouseDelegate {
  findFirst(args: { where: WarehouseWhereInput }): Promise<WarehouseRecord | null>;
}

interface NotificationDelegate {
  findMany(args: {
    where: NotificationWhereInput;
    orderBy: { createdAt: 'desc' };
    take: number;
    skip: number;
  }): Promise<NotificationRecord[]>;
  findFirst(args: { where: NotificationWhereInput }): Promise<NotificationRecord | null>;
  create(args: { data: NotificationCreateInput }): Promise<NotificationRecord>;
  update(args: {
    where: { id: string };
    data: NotificationUpdateInput;
  }): Promise<NotificationRecord>;
}

interface NotificationCreateInput {
  warehouseId: string;
  type: NotificationType;
  status: NotificationStatus;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
}

interface NotificationUpdateInput {
  status?: NotificationStatus;
  readAt?: Date;
}

interface NotificationPrismaClient {
  warehouse: WarehouseDelegate;
  notification: NotificationDelegate;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeBroadcaster: RealtimeBroadcasterService,
  ) {}

  async findMany(
    warehouseReference: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const where: NotificationWhereInput = {
      warehouseId: warehouse.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { message: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const notifications = await this.client.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });

    return notifications.map(toNotificationResponse);
  }

  async create(
    warehouseReference: string,
    dto: CreateNotificationDto,
    actor: AuthenticatedUser,
  ): Promise<NotificationResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const notification = await this.client.notification.create({
      data: {
        warehouseId: warehouse.id,
        type: dto.type,
        status: NotificationStatus.UNREAD,
        title: dto.title.trim(),
        message: dto.message.trim(),
        metadata: dto.metadata ?? null,
        readAt: null,
      },
    });
    const response = toNotificationResponse(notification);

    this.publishNotificationEvent(warehouse, 'notification.created', response, actor.id);

    return response;
  }

  async markRead(
    warehouseReference: string,
    notificationId: string,
    actor: AuthenticatedUser,
  ): Promise<NotificationResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingNotification = await this.resolveNotification(warehouse.id, notificationId);
    const notification = await this.client.notification.update({
      where: { id: existingNotification.id },
      data: {
        status: NotificationStatus.READ,
        readAt: existingNotification.readAt ?? new Date(),
      },
    });
    const response = toNotificationResponse(notification);

    this.publishNotificationEvent(warehouse, 'notification.read', response, actor.id);

    return response;
  }

  private get client(): NotificationPrismaClient {
    return this.prisma as unknown as NotificationPrismaClient;
  }

  private async resolveWarehouse(warehouseReference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveNotification(
    warehouseId: string,
    notificationId: string,
  ): Promise<NotificationRecord> {
    const notification = await this.client.notification.findFirst({
      where: {
        id: notificationId,
        warehouseId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification was not found');
    }

    return notification;
  }

  private publishNotificationEvent(
    warehouse: WarehouseRecord,
    type: 'notification.created' | 'notification.read',
    notification: NotificationResponse,
    actorUserId: string,
  ): void {
    this.realtimeBroadcaster.publishMany([warehouse.id, warehouse.code], {
      warehouseId: warehouse.id,
      type,
      data: {
        actorUserId,
        notification: toRealtimeNotification(notification),
      },
    });
  }
}

function toNotificationResponse(notification: NotificationRecord): NotificationResponse {
  return {
    id: notification.id,
    warehouseId: notification.warehouseId,
    type: notification.type,
    status: notification.status,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

function toRealtimeNotification(notification: NotificationResponse): Record<string, unknown> {
  return {
    ...notification,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

function warehouseReferenceWhere(reference: string): WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
