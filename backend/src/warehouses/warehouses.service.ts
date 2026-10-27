import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { Prisma, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { UpdateWarehouseLocationDto } from './dto/update-warehouse-location.dto';
import {
  WarehouseLocationBinStatus,
  WarehouseLocationResponse,
  WarehouseResponse,
} from './warehouses.types';

interface WarehouseLocationRow {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  type: string;
  barcode: string | null;
  zone: string | null;
  aisle: string | null;
  bay: string | null;
  level: string | null;
  bin: string | null;
  pick_sequence: number;
  capacity_weight_grams: number | null;
  capacity_volume_cm3: number | null;
  bin_status: string;
  bin_type: string | null;
  capacity_units: number | null;
  capacity_handling_units: number | null;
  capacity_pallets: number | null;
  capacity_reserved_units: number;
  capacity_reserved_volume_cm3: number;
  capacity_reserved_weight_grams: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async findManyForUser(user: AuthenticatedUser): Promise<WarehouseResponse[]> {
    const allowedWarehouseIds = user.warehouses.map((warehouse) => warehouse.warehouseId);

    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        id: { in: allowedWarehouseIds },
      },
      orderBy: { code: 'asc' },
    });

    return warehouses.map(toWarehouseResponse);
  }

  async findByReference(warehouseReference: string): Promise<WarehouseResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return toWarehouseResponse(warehouse);
  }

  async findLocations(warehouseReference: string): Promise<WarehouseLocationResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.prisma.$queryRawUnsafe<WarehouseLocationRow[]>(
      `${WAREHOUSE_LOCATION_SELECT} WHERE warehouse_id = $1::uuid ORDER BY type ASC, code ASC`,
      warehouse.id,
    );

    return rows.map(toWarehouseLocationResponse);
  }

  async findLocation(
    warehouseReference: string,
    locationReference: string,
  ): Promise<WarehouseLocationResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const location = await this.resolveLocation(warehouse.id, locationReference);

    return this.readLocationById(location.id);
  }

  async createLocation(
    warehouseReference: string,
    dto: CreateWarehouseLocationDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseLocationResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parent = dto.parentReference
      ? await this.resolveLocation(warehouse.id, dto.parentReference)
      : null;

    try {
      const location = await this.prisma.warehouseLocation.create({
        data: {
          warehouseId: warehouse.id,
          parentId: parent?.id,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          type: dto.type,
          zone: normalizeOptionalString(dto.zone),
          isActive: dto.isActive ?? true,
        },
      });

      await this.applyExtendedLocationPatch(location.id, {
        barcode: normalizeNullableString(dto.barcode),
        aisle: normalizeNullableString(dto.aisle),
        bay: normalizeNullableString(dto.bay),
        level: normalizeNullableString(dto.level),
        bin: normalizeNullableString(dto.bin),
        pick_sequence: dto.pickSequence ?? 0,
        bin_status: dto.binStatus ?? WarehouseLocationBinStatus.AVAILABLE,
        bin_type: normalizeNullableString(dto.binType),
        capacity_weight_grams: dto.capacityWeightGrams ?? null,
        capacity_volume_cm3: dto.capacityVolumeCm3 ?? null,
        capacity_units: dto.capacityUnits ?? null,
        capacity_handling_units: dto.capacityHandlingUnits ?? null,
        capacity_pallets: dto.capacityPallets ?? null,
      });
      const response = await this.readLocationById(location.id);
      await this.writeLocationAudit(actor, warehouse.id, 'warehouse_location.created', response);

      return response;
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Warehouse location code already exists in this warehouse');
      }

      throw error;
    }
  }

  async updateLocation(
    warehouseReference: string,
    locationReference: string,
    dto: UpdateWarehouseLocationDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseLocationResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingLocation = await this.resolveLocation(warehouse.id, locationReference);
    const parentId = await this.resolveUpdateParentId(warehouse.id, existingLocation.id, dto);

    try {
      await this.prisma.warehouseLocation.update({
        where: { id: existingLocation.id },
        data: {
          ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.type === undefined ? {} : { type: dto.type }),
          ...(dto.zone === undefined ? {} : { zone: normalizeOptionalString(dto.zone) }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(parentId === undefined ? {} : { parentId }),
        },
      });

      await this.applyExtendedLocationPatch(existingLocation.id, buildExtendedLocationPatch(dto));
      const response = await this.readLocationById(existingLocation.id);
      await this.writeLocationAudit(actor, warehouse.id, 'warehouse_location.updated', response);

      return response;
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Warehouse location code already exists in this warehouse');
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

  private async resolveUpdateParentId(
    warehouseId: string,
    locationId: string,
    dto: UpdateWarehouseLocationDto,
  ): Promise<string | null | undefined> {
    if (dto.parentReference === undefined) {
      return undefined;
    }

    if (dto.parentReference === null || dto.parentReference.trim().length === 0) {
      return null;
    }

    const parent = await this.resolveLocation(warehouseId, dto.parentReference);

    if (parent.id === locationId) {
      throw new ConflictException('Location cannot be its own parent');
    }

    return parent.id;
  }

  private async applyExtendedLocationPatch(locationId: string, patch: Record<string, unknown>): Promise<void> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return;

    const assignments = entries.map(([column], index) => `${column} = $${index + 2}`).join(', ');
    const values = entries.map(([, value]) => value);
    await this.prisma.$executeRawUnsafe(
      `UPDATE warehouse_locations SET ${assignments}, updated_at = NOW() WHERE id = $1::uuid`,
      locationId,
      ...values,
    );
  }

  private async readLocationById(locationId: string): Promise<WarehouseLocationResponse> {
    const rows = await this.prisma.$queryRawUnsafe<WarehouseLocationRow[]>(
      `${WAREHOUSE_LOCATION_SELECT} WHERE id = $1::uuid`,
      locationId,
    );
    const row = rows[0];

    if (!row) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return toWarehouseLocationResponse(row);
  }

  private async writeLocationAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    location: WarehouseLocationResponse,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'warehouse_location',
        resourceId: location.id,
        metadata: JSON.parse(JSON.stringify({
          code: location.code,
          type: location.type,
          zone: location.zone,
          binStatus: location.binStatus,
          binType: location.binType,
          capacity: location.capacity,
        })),
      },
    });
  }
}

const WAREHOUSE_LOCATION_SELECT = `
  SELECT
    id,
    warehouse_id,
    parent_id,
    code,
    name,
    type,
    barcode,
    zone,
    aisle,
    bay,
    level,
    bin,
    pick_sequence,
    capacity_weight_grams,
    capacity_volume_cm3,
    bin_status,
    bin_type,
    capacity_units,
    capacity_handling_units,
    capacity_pallets,
    capacity_reserved_units,
    capacity_reserved_volume_cm3,
    capacity_reserved_weight_grams,
    is_active,
    created_at,
    updated_at
  FROM warehouse_locations
`;

function toWarehouseResponse(warehouse: Warehouse): WarehouseResponse {
  return {
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name,
    timezone: warehouse.timezone,
    status: warehouse.status,
    createdAt: warehouse.createdAt,
    updatedAt: warehouse.updatedAt,
  };
}

function toWarehouseLocationResponse(location: WarehouseLocationRow): WarehouseLocationResponse {
  return {
    id: location.id,
    warehouseId: location.warehouse_id,
    parentId: location.parent_id,
    code: location.code,
    name: location.name,
    type: location.type as WarehouseLocationResponse['type'],
    barcode: location.barcode,
    zone: location.zone,
    aisle: location.aisle,
    bay: location.bay,
    level: location.level,
    bin: location.bin,
    pickSequence: Number(location.pick_sequence ?? 0),
    binStatus: normalizeBinStatus(location.bin_status),
    binType: location.bin_type,
    capacity: {
      weightGrams: nullableNumber(location.capacity_weight_grams),
      volumeCm3: nullableNumber(location.capacity_volume_cm3),
      units: nullableNumber(location.capacity_units),
      handlingUnits: nullableNumber(location.capacity_handling_units),
      pallets: nullableNumber(location.capacity_pallets),
      reservedUnits: Number(location.capacity_reserved_units ?? 0),
      reservedVolumeCm3: Number(location.capacity_reserved_volume_cm3 ?? 0),
      reservedWeightGrams: Number(location.capacity_reserved_weight_grams ?? 0),
    },
    isActive: location.is_active,
    createdAt: toDate(location.created_at),
    updatedAt: toDate(location.updated_at),
  };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeOptionalString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function buildExtendedLocationPatch(dto: UpdateWarehouseLocationDto): Record<string, unknown> {
  return {
    barcode: normalizeNullableString(dto.barcode),
    aisle: normalizeNullableString(dto.aisle),
    bay: normalizeNullableString(dto.bay),
    level: normalizeNullableString(dto.level),
    bin: normalizeNullableString(dto.bin),
    pick_sequence: dto.pickSequence,
    bin_status: dto.binStatus,
    bin_type: normalizeNullableString(dto.binType),
    capacity_weight_grams: dto.capacityWeightGrams,
    capacity_volume_cm3: dto.capacityVolumeCm3,
    capacity_units: dto.capacityUnits,
    capacity_handling_units: dto.capacityHandlingUnits,
    capacity_pallets: dto.capacityPallets,
  };
}

function normalizeBinStatus(value: string): WarehouseLocationBinStatus {
  if (Object.values(WarehouseLocationBinStatus).includes(value as WarehouseLocationBinStatus)) {
    return value as WarehouseLocationBinStatus;
  }

  return WarehouseLocationBinStatus.AVAILABLE;
}

function nullableNumber(value: number | null): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
