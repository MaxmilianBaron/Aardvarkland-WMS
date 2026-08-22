import { lockPostgresAdvisoryTransaction } from '../database/transaction-locks';

export interface StockQuantIdentityInput {
  warehouseId: string;
  locationId: string;
  skuId: string;
  status: string;
  ownerClientId?: string | null;
  lotId?: string | null;
  batch?: string | null;
  expiry?: Date | string | null;
  handlingUnitId?: string | null;
}

const NULL_OWNER_CLIENT_SENTINEL = '<null-owner-client>';
const NULL_LOT_SENTINEL = '<null-lot>';
const NULL_BATCH_SENTINEL = '<null-batch>';
const NULL_EXPIRY_SENTINEL = '<null-expiry>';
const NULL_HANDLING_UNIT_SENTINEL = '<null-handling-unit>';

export function buildStockQuantIdentityKey(input: StockQuantIdentityInput): string {
  return [
    normalizeIdentityPart(input.warehouseId),
    normalizeNullableUuid(input.ownerClientId, NULL_OWNER_CLIENT_SENTINEL),
    normalizeIdentityPart(input.locationId),
    normalizeIdentityPart(input.skuId),
    normalizeIdentityPart(input.status),
    normalizeNullableUuid(input.lotId, NULL_LOT_SENTINEL),
    normalizeNullableBatch(input.batch),
    normalizeNullableDate(input.expiry),
    normalizeNullableUuid(input.handlingUnitId, NULL_HANDLING_UNIT_SENTINEL),
  ].join('|');
}

export function lockStockQuantIdentity(client: unknown, input: StockQuantIdentityInput): Promise<void> {
  return lockPostgresAdvisoryTransaction(client, 'stock_quant_identity', buildStockQuantIdentityKey(input));
}

function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNullableUuid(value: string | null | undefined, sentinel: string): string {
  if (value === null || value === undefined) return sentinel;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? sentinel : normalized;
}

function normalizeNullableBatch(value: string | null | undefined): string {
  if (value === null || value === undefined) return NULL_BATCH_SENTINEL;
  const normalized = value.trim();
  return normalized.length === 0 ? NULL_BATCH_SENTINEL : normalized;
}

function normalizeNullableDate(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return NULL_EXPIRY_SENTINEL;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return NULL_EXPIRY_SENTINEL;
  return date.toISOString().slice(0, 10);
}
