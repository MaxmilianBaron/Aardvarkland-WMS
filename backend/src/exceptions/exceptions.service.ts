import { Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { ListExceptionsQueryDto } from './dto/list-exceptions-query.dto';
import { UpdateExceptionDto } from './dto/update-exception.dto';
import {
  ExceptionParcelResponse,
  ExceptionResponse,
  ExceptionSeverity,
  ExceptionStatus,
  WmsExceptionLocationResponse,
} from './exceptions.types';

const exceptionInclude = {
  parcel: true,
  location: true,
  createdBy: true,
};

@Injectable()
export class ExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    warehouseReference: string,
    query: ListExceptionsQueryDto,
  ): Promise<ExceptionResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcel = query.parcelReference
      ? await this.resolveParcel(warehouse.id, query.parcelReference)
      : null;
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const exceptions = await this.wmsPrisma.wmsException.findMany({
      where: {
        warehouseId: warehouse.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(parcel ? { parcelId: parcel.id } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
                { parcel: { trackingNumber: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: exceptionInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: page.take,
      skip: page.skip,
    });

    return exceptions.map(toExceptionResponse);
  }

  async createForParcel(
    warehouseReference: string,
    parcelReference: string,
    dto: CreateExceptionDto,
    actor: AuthenticatedUser,
  ): Promise<ExceptionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcel = await this.resolveParcel(warehouse.id, parcelReference);
    const location = dto.locationReference
      ? await this.resolveLocation(warehouse.id, dto.locationReference)
      : null;

    const exception = await this.wmsPrisma.wmsException.create({
      data: {
        warehouseId: warehouse.id,
        parcelId: parcel.id,
        locationId: location?.id ?? null,
        createdByUserId: actor.id,
        code: normalizeCode(dto.code),
        title: dto.title.trim(),
        description: normalizeNullableString(dto.description),
        status: ExceptionStatus.OPEN,
        severity: dto.severity ?? ExceptionSeverity.MEDIUM,
        metadata: toJsonInput(dto.metadata),
      },
      include: exceptionInclude,
    });

    await this.writeExceptionAudit(actor, warehouse.id, 'exception.created', exception);

    return toExceptionResponse(exception);
  }

  async update(
    warehouseReference: string,
    exceptionReference: string,
    dto: UpdateExceptionDto,
    actor: AuthenticatedUser,
  ): Promise<ExceptionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingException = await this.resolveException(warehouse.id, exceptionReference);
    const locationId = await this.resolveUpdateLocationId(warehouse.id, dto);
    const resolvedAt = resolveNextResolvedAt(existingException, dto);

    const exception = await this.wmsPrisma.wmsException.update({
      where: { id: existingException.id },
      data: {
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.severity === undefined ? {} : { severity: dto.severity }),
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.description === undefined
          ? {}
          : { description: normalizeNullableString(dto.description) }),
        ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
        ...(locationId === undefined ? {} : { locationId }),
        ...(resolvedAt === undefined ? {} : { resolvedAt }),
      },
      include: exceptionInclude,
    });

    await this.writeExceptionAudit(actor, warehouse.id, 'exception.updated', exception);

    return toExceptionResponse(exception);
  }

  private get wmsPrisma(): ExceptionsPrismaClient {
    return this.prisma as unknown as ExceptionsPrismaClient;
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

  private async resolveException(
    warehouseId: string,
    exceptionReference: string,
  ): Promise<WmsExceptionRecord> {
    const exception = await this.wmsPrisma.wmsException.findFirst({
      where: exceptionReferenceWhere(warehouseId, exceptionReference),
      include: exceptionInclude,
    });

    if (!exception) {
      throw new NotFoundException('Exception was not found');
    }

    return exception;
  }

  private async resolveUpdateLocationId(
    warehouseId: string,
    dto: UpdateExceptionDto,
  ): Promise<string | null | undefined> {
    if (dto.locationReference === undefined) {
      return undefined;
    }

    if (dto.locationReference === null || dto.locationReference.length === 0) {
      return null;
    }

    return (await this.resolveLocation(warehouseId, dto.locationReference)).id;
  }

  private async writeExceptionAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    exception: WmsExceptionRecord,
  ): Promise<void> {
    await this.wmsPrisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'exception',
        resourceId: exception.id,
        metadata: {
          parcelId: exception.parcelId,
          code: exception.code,
          status: exception.status,
          severity: exception.severity,
          locationId: exception.locationId,
        },
      },
    });
  }
}

function toExceptionResponse(exception: WmsExceptionRecord): ExceptionResponse {
  return {
    id: exception.id,
    warehouseId: exception.warehouseId,
    parcelId: exception.parcelId,
    locationId: exception.locationId,
    createdByUserId: exception.createdByUserId,
    code: exception.code,
    title: exception.title,
    description: exception.description,
    status: exception.status,
    severity: exception.severity,
    metadata: exception.metadata,
    resolvedAt: exception.resolvedAt,
    createdAt: exception.createdAt,
    updatedAt: exception.updatedAt,
    parcel: exception.parcel ? toParcelResponse(exception.parcel) : null,
    location: exception.location ? toLocationResponse(exception.location) : null,
    createdBy: exception.createdBy
      ? {
          id: exception.createdBy.id,
          email: exception.createdBy.email,
          displayName: exception.createdBy.displayName,
        }
      : null,
  };
}

function toParcelResponse(parcel: ParcelRecord): ExceptionParcelResponse {
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
  };
}

function toLocationResponse(location: WarehouseLocationRecord): WmsExceptionLocationResponse {
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

function exceptionReferenceWhere(warehouseId: string, reference: string): Record<string, unknown> {
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

function isResolvedStatus(status: ExceptionStatus): boolean {
  return status === ExceptionStatus.RESOLVED || status === ExceptionStatus.CLOSED;
}

function resolveNextResolvedAt(
  existingException: WmsExceptionRecord,
  dto: UpdateExceptionDto,
): Date | null | undefined {
  if (dto.status === undefined) {
    return undefined;
  }

  if (!isResolvedStatus(dto.status)) {
    return null;
  }

  return existingException.resolvedAt ?? new Date();
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface ExceptionsPrismaClient {
  warehouse: {
    findFirst(args: unknown): Promise<WarehouseRecord | null>;
  };
  warehouseLocation: {
    findFirst(args: unknown): Promise<WarehouseLocationRecord | null>;
  };
  parcel: {
    findFirst(args: unknown): Promise<ParcelRecord | null>;
  };
  wmsException: {
    findFirst(args: unknown): Promise<WmsExceptionRecord | null>;
    findMany(args: unknown): Promise<WmsExceptionRecord[]>;
    create(args: unknown): Promise<WmsExceptionRecord>;
    update(args: unknown): Promise<WmsExceptionRecord>;
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

interface WmsExceptionRecord {
  id: string;
  warehouseId: string;
  parcelId: string;
  locationId: string | null;
  createdByUserId: string;
  code: string;
  title: string;
  description: string | null;
  status: ExceptionStatus;
  severity: ExceptionSeverity;
  metadata: unknown;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  parcel?: ParcelRecord | null;
  location?: WarehouseLocationRecord | null;
  createdBy?: UserRecord | null;
}
