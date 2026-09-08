import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { Parcel, Prisma, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { ListParcelsQueryDto } from './dto/list-parcels-query.dto';
import { UpdateParcelDto } from './dto/update-parcel.dto';
import { ParcelResponse } from './parcels.types';

const parcelInclude = {
  currentLocation: true,
} satisfies Prisma.ParcelInclude;

type ParcelWithLocation = Prisma.ParcelGetPayload<{
  include: typeof parcelInclude;
}>;

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    warehouseReference: string,
    query: ListParcelsQueryDto,
  ): Promise<ParcelResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const where: Prisma.ParcelWhereInput = {
      warehouseId: warehouse.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { trackingNumber: { contains: query.search, mode: 'insensitive' } },
              { externalReference: { contains: query.search, mode: 'insensitive' } },
              { customerReference: { contains: query.search, mode: 'insensitive' } },
              { recipientName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const parcels = await this.prisma.parcel.findMany({
      where,
      include: parcelInclude,
      orderBy: { createdAt: 'desc' },
      take: page.take,
      skip: page.skip,
    });

    return parcels.map(toParcelResponse);
  }

  async findOne(warehouseReference: string, parcelReference: string): Promise<ParcelResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcel = await this.resolveParcel(warehouse.id, parcelReference);

    return toParcelResponse(parcel);
  }

  async create(
    warehouseReference: string,
    dto: CreateParcelDto,
    actor: AuthenticatedUser,
  ): Promise<ParcelResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const currentLocation = dto.currentLocationReference
      ? await this.resolveLocation(warehouse.id, dto.currentLocationReference)
      : null;

    try {
      const data: Prisma.ParcelUncheckedCreateInput = {
        warehouseId: warehouse.id,
        currentLocationId: currentLocation?.id ?? null,
        trackingNumber: normalizeTrackingNumber(dto.trackingNumber),
        status: dto.status ?? 'CREATED',
        externalReference: normalizeNullableString(dto.externalReference),
        customerReference: normalizeNullableString(dto.customerReference),
        recipientName: normalizeNullableString(dto.recipientName),
        carrier: normalizeNullableString(dto.carrier),
        serviceLevel: normalizeNullableString(dto.serviceLevel),
        weightGrams: dto.weightGrams,
        metadata: toJsonInput(dto.metadata),
      };
      const parcel = await this.prisma.parcel.create({ data });

      await this.writeParcelAudit(actor, warehouse.id, 'parcel.created', parcel);

      return toParcelResponse(await this.resolveParcel(warehouse.id, parcel.id));
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Parcel tracking number already exists in this warehouse');
      }

      throw error;
    }
  }

  async update(
    warehouseReference: string,
    parcelReference: string,
    dto: UpdateParcelDto,
    actor: AuthenticatedUser,
  ): Promise<ParcelResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingParcel = await this.resolveParcel(warehouse.id, parcelReference);
    const currentLocationId = await this.resolveUpdateLocationId(warehouse.id, dto);

    try {
      const data: Prisma.ParcelUncheckedUpdateInput = {
        ...(dto.trackingNumber === undefined
          ? {}
          : { trackingNumber: normalizeTrackingNumber(dto.trackingNumber) }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.externalReference === undefined
          ? {}
          : { externalReference: normalizeNullableString(dto.externalReference) }),
        ...(dto.customerReference === undefined
          ? {}
          : { customerReference: normalizeNullableString(dto.customerReference) }),
        ...(dto.recipientName === undefined
          ? {}
          : { recipientName: normalizeNullableString(dto.recipientName) }),
        ...(dto.carrier === undefined ? {} : { carrier: normalizeNullableString(dto.carrier) }),
        ...(dto.serviceLevel === undefined
          ? {}
          : { serviceLevel: normalizeNullableString(dto.serviceLevel) }),
        ...(dto.weightGrams === undefined ? {} : { weightGrams: dto.weightGrams }),
        ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
        ...(currentLocationId === undefined ? {} : { currentLocationId }),
      };
      const parcel = await this.prisma.parcel.update({
        where: { id: existingParcel.id },
        data,
      });

      await this.writeParcelAudit(actor, warehouse.id, 'parcel.updated', parcel);

      return toParcelResponse(await this.resolveParcel(warehouse.id, parcel.id));
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Parcel tracking number already exists in this warehouse');
      }

      throw error;
    }
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findFirst({
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
  ): Promise<WarehouseLocation> {
    const location = await this.prisma.warehouseLocation.findFirst({
      where: locationReferenceWhere(warehouseId, locationReference),
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolveParcel(
    warehouseId: string,
    parcelReference: string,
  ): Promise<ParcelWithLocation> {
    const parcel = await this.prisma.parcel.findFirst({
      where: parcelReferenceWhere(warehouseId, parcelReference),
      include: parcelInclude,
    });

    if (!parcel) {
      throw new NotFoundException('Parcel was not found');
    }

    return parcel;
  }

  private async resolveUpdateLocationId(
    warehouseId: string,
    dto: UpdateParcelDto,
  ): Promise<string | null | undefined> {
    if (dto.currentLocationReference === undefined) {
      return undefined;
    }

    if (dto.currentLocationReference === null || dto.currentLocationReference.length === 0) {
      return null;
    }

    return (await this.resolveLocation(warehouseId, dto.currentLocationReference)).id;
  }

  private async writeParcelAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    parcel: Parcel,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'parcel',
        resourceId: parcel.id,
        metadata: {
          trackingNumber: parcel.trackingNumber,
          status: parcel.status,
          currentLocationId: parcel.currentLocationId,
        },
      },
    });
  }
}

function toParcelResponse(parcel: ParcelWithLocation): ParcelResponse {
  return {
    id: parcel.id,
    warehouseId: parcel.warehouseId,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
    externalReference: parcel.externalReference,
    customerReference: parcel.customerReference,
    recipientName: parcel.recipientName,
    carrier: parcel.carrier,
    serviceLevel: parcel.serviceLevel,
    weightGrams: parcel.weightGrams,
    metadata: parcel.metadata,
    currentLocation: parcel.currentLocation
      ? {
          id: parcel.currentLocation.id,
          code: parcel.currentLocation.code,
          name: parcel.currentLocation.name,
          zone: parcel.currentLocation.zone,
        }
      : null,
    createdAt: parcel.createdAt,
    updatedAt: parcel.updatedAt,
  };
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function locationReferenceWhere(
  warehouseId: string,
  reference: string,
): Prisma.WarehouseLocationWhereInput {
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

function parcelReferenceWhere(warehouseId: string, reference: string): Prisma.ParcelWhereInput {
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

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
