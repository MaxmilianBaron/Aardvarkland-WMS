import {
  firstField,
  readDate,
  readNullableString,
  readNumber,
  readString,
} from './reservation-prisma';
import { ReservationResponse, ReservationStatus } from './reservations.types';

export type RuntimeRecord = Record<string, unknown>;

export const QUANTITY_RESERVED_FIELDS = ['quantityReserved', 'reservedQuantity'] as const;
export const STOCK_QUANTITY_FIELDS = ['quantity', 'onHandQuantity'] as const;
export const STOCK_EXPIRY_FIELDS = [
  'expiresAt',
  'expiryDate',
  'expirationDate',
  'lotExpiresAt',
] as const;

export function toRecord(value: unknown): RuntimeRecord {
  return value && typeof value === 'object' ? (value as RuntimeRecord) : {};
}

export function toRuntimeRecords(values: unknown[]): RuntimeRecord[] {
  return values.map(toRecord);
}

export function toReservationResponse(value: RuntimeRecord): ReservationResponse {
  const stockQuantId =
    readNullableString(value, 'stockQuantId') ?? readNullableString(value, 'sourceStockQuantId');
  const reservedStockQuantId =
    readNullableString(value, 'reservedStockQuantId') ??
    readNullableString(value, 'targetStockQuantId');

  return {
    id: readString(value, 'id') ?? '',
    warehouseId: readString(value, 'warehouseId') ?? '',
    stockQuantId: stockQuantId ?? null,
    reservedStockQuantId: reservedStockQuantId ?? null,
    outboundOrderId: readNullableString(value, 'outboundOrderId') ?? null,
    outboundOrderLineId:
      readNullableString(value, 'outboundOrderLineId') ??
      readNullableString(value, 'orderLineId') ??
      null,
    skuId: readNullableString(value, 'skuId') ?? null,
    sku: readNullableString(value, 'sku') ?? null,
    quantity: readNumber(value, 'quantity') ?? 0,
    status: readString(value, 'status') ?? ReservationStatus.ACTIVE,
    createdByUserId: readNullableString(value, 'createdByUserId') ?? null,
    metadata: value['metadata'] ?? null,
    createdAt: readDate(value, 'createdAt') ?? new Date(0),
    updatedAt: readDate(value, 'updatedAt') ?? new Date(0),
  };
}

export function warehouseReferenceWhere(reference: string): RuntimeRecord {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return { code: normalizeReference(reference) };
}

export function modelReferenceWhere(
  fields: Set<string>,
  reference: string,
  codeCandidates: readonly string[],
): RuntimeRecord {
  const codeField = firstField(fields, codeCandidates);

  if (isUuid(reference)) {
    return codeField
      ? { OR: [{ id: reference }, { [codeField]: normalizeReference(reference) }] }
      : { id: reference };
  }

  if (!codeField) {
    return { id: reference };
  }

  return { [codeField]: normalizeReference(reference) };
}

export function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function activeReservationWhere(fields: Set<string>): RuntimeRecord {
  if (!fields.has('status')) {
    return {};
  }

  return { status: ReservationStatus.ACTIVE };
}

export function availableQuantity(
  stockQuant: RuntimeRecord,
  quantityReservedField?: string,
): number {
  const quantityField = firstField(new Set(Object.keys(stockQuant)), STOCK_QUANTITY_FIELDS);
  const quantity = quantityField ? (readNumber(stockQuant, quantityField) ?? 0) : 0;
  const reserved = quantityReservedField ? (readNumber(stockQuant, quantityReservedField) ?? 0) : 0;

  return Math.max(quantity - reserved, 0);
}

export function getStockExpiry(stockQuant: RuntimeRecord): Date | null {
  const field = firstField(new Set(Object.keys(stockQuant)), STOCK_EXPIRY_FIELDS);

  if (!field) {
    return null;
  }

  return readDate(stockQuant, field) ?? null;
}
