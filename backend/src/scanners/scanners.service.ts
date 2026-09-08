import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { CreateScannerDto } from './dto/create-scanner.dto';
import { CreateScannerScanDto } from './dto/create-scanner-scan.dto';
import { UpdateScannerTelemetryDto } from './dto/update-scanner-telemetry.dto';
import { UpdateScannerDto } from './dto/update-scanner.dto';
import { ScannerResponse, ScannerScanResponse, ScannerStatus } from './scanners.types';

type SortOrder = 'asc' | 'desc';
type QueryObject = Record<string, unknown>;
type MutationObject = Record<string, unknown>;

interface WarehouseRecord {
  id: string;
  code: string;
  name: string;
}

interface ParcelRecord {
  id: string;
  trackingNumber: string;
  status: string;
}

interface ScannerDeviceRecord {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  status: string;
  assignedZone: string | null;
  lastSeenAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface FindFirstDelegate<TRecord> {
  findFirst(args: { where: QueryObject }): Promise<TRecord | null>;
}

interface AuditLogDelegate {
  create(args: { data: MutationObject }): Promise<unknown>;
}

interface ScannerDeviceDelegate extends FindFirstDelegate<ScannerDeviceRecord> {
  findMany(args: {
    where: QueryObject;
    orderBy: Array<Record<string, SortOrder>>;
  }): Promise<ScannerDeviceRecord[]>;
  create(args: { data: MutationObject }): Promise<ScannerDeviceRecord>;
  update(args: { where: { id: string }; data: MutationObject }): Promise<ScannerDeviceRecord>;
}

interface TrackingEventDelegate {
  create(args: { data: MutationObject }): Promise<unknown>;
}

interface ScannerPrismaClient {
  warehouse: FindFirstDelegate<WarehouseRecord>;
  parcel: FindFirstDelegate<ParcelRecord>;
  auditLog: AuditLogDelegate;
  scannerDevice: ScannerDeviceDelegate;
  trackingEvent?: TrackingEventDelegate;
}

@Injectable()
export class ScannersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(warehouseReference: string): Promise<ScannerResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const scanners = await this.db.scannerDevice.findMany({
      where: { warehouseId: warehouse.id },
      orderBy: [{ code: 'asc' }],
    });

    return scanners.map(toScannerResponse);
  }

  async create(
    warehouseReference: string,
    dto: CreateScannerDto,
    actor: AuthenticatedUser,
  ): Promise<ScannerResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    try {
      const scanner = await this.db.scannerDevice.create({
        data: {
          warehouseId: warehouse.id,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          status: dto.status ?? ScannerStatus.ACTIVE,
          assignedZone: normalizeNullableString(dto.assignedZone),
          metadata: toJsonInput(buildScannerMetadata(null, dto)),
        },
      });

      await this.writeScannerAudit(actor, warehouse.id, 'scanner.created', scanner);

      return toScannerResponse(scanner);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Scanner code already exists in this warehouse');
      }

      throw error;
    }
  }

  async update(
    warehouseReference: string,
    scannerReference: string,
    dto: UpdateScannerDto,
    actor: AuthenticatedUser,
  ): Promise<ScannerResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingScanner = await this.resolveScanner(warehouse.id, scannerReference);

    try {
      const scanner = await this.db.scannerDevice.update({
        where: { id: existingScanner.id },
        data: {
          ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.assignedZone === undefined
            ? {}
            : { assignedZone: normalizeNullableString(dto.assignedZone) }),
          ...scannerMetadataUpdate(existingScanner.metadata, dto),
        },
      });

      await this.writeScannerAudit(actor, warehouse.id, 'scanner.updated', scanner);

      return toScannerResponse(scanner);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Scanner code already exists in this warehouse');
      }

      throw error;
    }
  }

  async scan(
    warehouseReference: string,
    scannerReference: string,
    dto: CreateScannerScanDto,
    actor: AuthenticatedUser,
  ): Promise<ScannerScanResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingScanner = await this.resolveScanner(warehouse.id, scannerReference);
    const scannedAt = new Date();
    const scanValue = dto.value.trim();
    const parcel = await this.resolveParcelByScanValue(warehouse.id, scanValue);

    const scanner = await this.db.scannerDevice.update({
      where: { id: existingScanner.id },
      data: {
        status: ScannerStatus.ACTIVE,
        lastSeenAt: scannedAt,
        metadata: toJsonInput(buildScannerMetadata(existingScanner.metadata, {
          metadata: { lastActivitySource: 'scanner.scan' },
          lastActivityAt: scannedAt.toISOString(),
        })),
      },
    });

    await this.writeScanAudit(actor, warehouse.id, scanner, dto, scanValue, scannedAt, parcel);
    const trackingEventCreated = await this.writeOptionalTrackingEvent(
      warehouse.id,
      scanner,
      dto,
      actor,
      scanValue,
      scannedAt,
      parcel,
    );

    return {
      scanner: toScannerResponse(scanner),
      scan: {
        value: scanValue,
        symbology: normalizeNullableString(dto.symbology),
        operation: normalizeNullableString(dto.operation),
        scannedAt,
      },
      result: parcel ? 'MATCHED' : 'UNMATCHED',
      match: parcel
        ? {
            type: 'PARCEL',
            parcel: {
              id: parcel.id,
              trackingNumber: parcel.trackingNumber,
              status: parcel.status,
            },
          }
        : null,
      trackingEventCreated,
    };
  }

  async updateTelemetry(
    warehouseReference: string,
    scannerReference: string,
    dto: UpdateScannerTelemetryDto,
    actor: AuthenticatedUser,
  ): Promise<ScannerResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingScanner = await this.resolveScanner(warehouse.id, scannerReference);
    const seenAt = new Date();
    const scanner = await this.db.scannerDevice.update({
      where: { id: existingScanner.id },
      data: {
        status: ScannerStatus.ACTIVE,
        lastSeenAt: seenAt,
        metadata: toJsonInput(buildScannerMetadata(existingScanner.metadata, {
          ...dto,
          lastActivityAt: seenAt.toISOString(),
          metadata: {
            ...(dto.metadata ?? {}),
            lastActivitySource: 'scanner.telemetry',
          },
        })),
      },
    });

    await this.writeScannerAudit(actor, warehouse.id, 'scanner.telemetry_reported', scanner);

    return toScannerResponse(scanner);
  }

  private get db(): ScannerPrismaClient {
    return this.prisma;
  }

  private async resolveWarehouse(warehouseReference: string): Promise<WarehouseRecord> {
    const warehouse = await this.db.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveScanner(
    warehouseId: string,
    scannerReference: string,
  ): Promise<ScannerDeviceRecord> {
    const scanner = await this.db.scannerDevice.findFirst({
      where: scannerReferenceWhere(warehouseId, scannerReference),
    });

    if (!scanner) {
      throw new NotFoundException('Scanner was not found');
    }

    return scanner;
  }

  private async resolveParcelByScanValue(
    warehouseId: string,
    scanValue: string,
  ): Promise<ParcelRecord | null> {
    return this.db.parcel.findFirst({
      where: parcelReferenceWhere(warehouseId, scanValue),
    });
  }

  private async writeScannerAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    scanner: ScannerDeviceRecord,
  ): Promise<void> {
    const response = toScannerResponse(scanner);
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'scanner_device',
        resourceId: scanner.id,
        metadata: {
          code: scanner.code,
          status: scanner.status,
          assignedZone: scanner.assignedZone,
          batteryLevel: response.batteryLevel,
          signalStrength: response.signalStrength,
          assignedWorkerId: response.assignedWorkerId,
        },
      },
    });
  }

  private async writeScanAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    scanner: ScannerDeviceRecord,
    dto: CreateScannerScanDto,
    scanValue: string,
    scannedAt: Date,
    parcel: ParcelRecord | null,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action: 'scanner.scan.logged',
        resourceType: parcel ? 'parcel' : 'scanner_device',
        resourceId: parcel?.id ?? scanner.id,
        metadata: {
          scannerId: scanner.id,
          scannerCode: scanner.code,
          value: scanValue,
          symbology: normalizeNullableString(dto.symbology),
          operation: normalizeNullableString(dto.operation),
          matchedParcelId: parcel?.id ?? null,
          scannedAt: scannedAt.toISOString(),
          metadata: dto.metadata ?? null,
        },
      },
    });
  }

  private async writeOptionalTrackingEvent(
    warehouseId: string,
    scanner: ScannerDeviceRecord,
    dto: CreateScannerScanDto,
    actor: AuthenticatedUser,
    scanValue: string,
    scannedAt: Date,
    parcel: ParcelRecord | null,
  ): Promise<boolean> {
    const trackingEvent = this.db.trackingEvent;

    if (!parcel || !trackingEvent) {
      return false;
    }

    try {
      await trackingEvent.create({
        data: {
          warehouseId,
          parcelId: parcel.id,
          actorUserId: actor.id,
          type: 'SCANNED',
          message: `Scanner ${scanner.code} matched parcel ${parcel.trackingNumber}`,
          occurredAt: scannedAt,
          metadata: {
            scannerId: scanner.id,
            scannerCode: scanner.code,
            value: scanValue,
            symbology: normalizeNullableString(dto.symbology),
            operation: normalizeNullableString(dto.operation),
            metadata: dto.metadata ?? null,
          },
        },
      });

      return true;
    } catch {
      return false;
    }
  }
}

function toScannerResponse(scanner: ScannerDeviceRecord): ScannerResponse {
  const metadata = scannerMetadata(scanner.metadata);
  return {
    id: scanner.id,
    warehouseId: scanner.warehouseId,
    code: scanner.code,
    name: scanner.name,
    status: scanner.status,
    assignedZone: scanner.assignedZone,
    lastSeenAt: scanner.lastSeenAt,
    lastActivityAt: readDate(metadata['lastActivityAt']) ?? scanner.lastSeenAt,
    batteryLevel: readPercent(metadata['batteryLevel']),
    signalStrength: readPercent(metadata['signalStrength']),
    assignedWorkerId: readNullableString(metadata['assignedWorkerId']),
    deviceMode: readNullableString(metadata['deviceMode']),
    appVersion: readNullableString(metadata['appVersion']),
    metadata: scanner.metadata,
    createdAt: scanner.createdAt,
    updatedAt: scanner.updatedAt,
  };
}

type ScannerMetadataPatch = {
  metadata?: Record<string, unknown> | null;
  batteryLevel?: number | null;
  signalStrength?: number | null;
  assignedWorkerId?: string | null;
  deviceMode?: string | null;
  appVersion?: string | null;
  lastActivityAt?: string | null;
};

function scannerMetadataUpdate(
  existing: unknown,
  patch: ScannerMetadataPatch,
): { metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput } {
  if (!hasScannerMetadataPatch(patch)) {
    return {};
  }

  return { metadata: toJsonInput(buildScannerMetadata(existing, patch)) };
}

function hasScannerMetadataPatch(patch: ScannerMetadataPatch): boolean {
  return patch.metadata !== undefined
    || patch.batteryLevel !== undefined
    || patch.signalStrength !== undefined
    || patch.assignedWorkerId !== undefined
    || patch.deviceMode !== undefined
    || patch.appVersion !== undefined
    || patch.lastActivityAt !== undefined;
}

function buildScannerMetadata(existing: unknown, patch: ScannerMetadataPatch): Record<string, unknown> | null {
  if (patch.metadata === null) {
    return null;
  }

  const base = scannerMetadata(existing);
  const incoming = patch.metadata ?? {};
  const next: Record<string, unknown> = { ...base, ...incoming };
  setOptionalNumber(next, 'batteryLevel', patch.batteryLevel);
  setOptionalNumber(next, 'signalStrength', patch.signalStrength);
  setOptionalString(next, 'assignedWorkerId', patch.assignedWorkerId);
  setOptionalString(next, 'deviceMode', patch.deviceMode);
  setOptionalString(next, 'appVersion', patch.appVersion);
  setOptionalString(next, 'lastActivityAt', patch.lastActivityAt);

  return next;
}

function scannerMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function setOptionalNumber(target: Record<string, unknown>, key: string, value: number | null | undefined) {
  if (value === undefined) return;
  if (value === null) {
    delete target[key];
    return;
  }
  target[key] = value;
}

function setOptionalString(target: Record<string, unknown>, key: string, value: string | null | undefined) {
  if (value === undefined) return;
  const normalized = normalizeNullableString(value);
  if (normalized === null) {
    delete target[key];
    return;
  }
  target[key] = normalized;
}

function readPercent(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function warehouseReferenceWhere(reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function scannerReferenceWhere(warehouseId: string, reference: string): QueryObject {
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

function parcelReferenceWhere(warehouseId: string, reference: string): QueryObject {
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
