import { Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { CreateTrackingEventDto } from './dto/create-tracking-event.dto';
import { ListTrackingEventsQueryDto } from './dto/list-tracking-events-query.dto';
import {
  TrackingEventParcelResponse,
  TrackingEventResponse,
  TrackingEventType,
  TrackingLocationResponse,
} from './tracking-events.types';

const trackingEventInclude = {
  parcel: true,
  location: true,
  actor: true,
};

@Injectable()
export class TrackingEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    warehouseReference: string,
    query: ListTrackingEventsQueryDto,
  ): Promise<TrackingEventResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcel = query.parcelReference
      ? await this.resolveParcel(warehouse.id, query.parcelReference)
      : null;
    const occurredAtFilter = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const where = {
      warehouseId: warehouse.id,
      ...(query.type ? { type: query.type } : {}),
      ...(parcel ? { parcelId: parcel.id } : {}),
      ...(Object.keys(occurredAtFilter).length > 0 ? { occurredAt: occurredAtFilter } : {}),
      ...(query.search
        ? {
            OR: [
              { message: { contains: query.search, mode: 'insensitive' } },
              { parcel: { trackingNumber: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const events = await this.wmsPrisma.trackingEvent.findMany({
      where,
      include: trackingEventInclude,
      orderBy: { occurredAt: 'desc' },
      take: page.take,
      skip: page.skip,
    });

    return events.map(toTrackingEventResponse);
  }

  async createForParcel(
    warehouseReference: string,
    parcelReference: string,
    dto: CreateTrackingEventDto,
    actor: AuthenticatedUser,
  ): Promise<TrackingEventResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcel = await this.resolveParcel(warehouse.id, parcelReference);
    const location = dto.locationReference
      ? await this.resolveLocation(warehouse.id, dto.locationReference)
      : null;

    const event = await this.wmsPrisma.trackingEvent.create({
      data: {
        warehouseId: warehouse.id,
        parcelId: parcel.id,
        locationId: location?.id ?? null,
        actorUserId: actor.id,
        type: dto.type,
        message: normalizeOptionalString(dto.message),
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        metadata: toJsonInput(dto.metadata),
      },
      include: trackingEventInclude,
    });

    await this.writeTrackingAudit(actor, warehouse.id, 'tracking_event.created', event);

    return toTrackingEventResponse(event);
  }

  private get wmsPrisma(): TrackingEventsPrismaClient {
    return this.prisma as unknown as TrackingEventsPrismaClient;
  }

  private async resolveWarehouse(warehouseReference: string): Promise<WarehouseRecord> {
    const warehouse = await this.wmsPrisma.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveLocation(
    warehouseId: string,
    locationReference: string,
  ): Promise<WarehouseLocationRecord> {
    const location = await this.wmsPrisma.warehouseLocation.findFirst({
      where: locationReferenceWhere(warehouseId, locationReference),
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolveParcel(warehouseId: string, parcelReference: string): Promise<ParcelRecord> {
    const parcel = await this.wmsPrisma.parcel.findFirst({
      where: parcelReferenceWhere(warehouseId, parcelReference),
    });

    if (!parcel) {
      throw new NotFoundException('Parcel was not found');
    }

    return parcel;
  }

  private async writeTrackingAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    event: TrackingEventRecord,
  ): Promise<void> {
    await this.wmsPrisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'tracking_event',
        resourceId: event.id,
        metadata: {
          parcelId: event.parcelId,
          type: event.type,
          locationId: event.locationId,
          occurredAt: event.occurredAt.toISOString(),
        },
      },
    });
  }
}

function toTrackingEventResponse(event: TrackingEventRecord): TrackingEventResponse {
  return {
    id: event.id,
    warehouseId: event.warehouseId,
    parcelId: event.parcelId,
    locationId: event.locationId,
    actorUserId: event.actorUserId,
    type: event.type,
    message: event.message,
    metadata: event.metadata,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
    parcel: event.parcel ? toParcelResponse(event.parcel) : null,
    location: event.location ? toLocationResponse(event.location) : null,
    actor: event.actor
      ? {
          id: event.actor.id,
          email: event.actor.email,
          displayName: event.actor.displayName,
        }
      : null,
  };
}

function toParcelResponse(parcel: ParcelRecord): TrackingEventParcelResponse {
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
  };
}

function toLocationResponse(location: WarehouseLocationRecord): TrackingLocationResponse {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    zone: location.zone,
  };
}

function warehouseReferenceWhere(reference: string): Record<string, unknown> {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function locationReferenceWhere(warehouseId: string, reference: string): Record<string, unknown> {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return {
    warehouseId,
    code: normalizeCode(reference),
  };
}

function parcelReferenceWhere(warehouseId: string, reference: string): Record<string, unknown> {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { trackingNumber: normalizeTrackingNumber(reference) }],
    };
  }

  return {
    warehouseId,
    trackingNumber: normalizeTrackingNumber(reference),
  };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function toJsonInput(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface TrackingEventsPrismaClient {
  warehouse: {
    findFirst(args: unknown): Promise<WarehouseRecord | null>;
  };
  warehouseLocation: {
    findFirst(args: unknown): Promise<WarehouseLocationRecord | null>;
  };
  parcel: {
    findFirst(args: unknown): Promise<ParcelRecord | null>;
  };
  trackingEvent: {
    findMany(args: unknown): Promise<TrackingEventRecord[]>;
    create(args: unknown): Promise<TrackingEventRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
}

interface WarehouseRecord {
  id: string;
}

interface WarehouseLocationRecord {
  id: string;
  code: string;
  name: string;
  zone: string | null;
}

interface ParcelRecord {
  id: string;
  trackingNumber: string;
}

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
}

interface TrackingEventRecord {
  id: string;
  warehouseId: string;
  parcelId: string;
  locationId: string | null;
  actorUserId: string | null;
  type: TrackingEventType;
  message: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
  parcel?: ParcelRecord | null;
  location?: WarehouseLocationRecord | null;
  actor?: UserRecord | null;
}
