import { AuthenticatedClientAccess, AuthenticatedUser } from './types';

export interface ClientAccessRequestShape {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export const CLIENT_SCOPED_WAREHOUSE_PERMISSIONS = new Set([
  'inventory.read',
  'inventory.manage',
  'inventory.move',
  'inventory.adjust',
  'outbound.read',
  'outbound.manage',
  'fulfillment.read',
  'fulfillment.manage',
  'reservation.read',
  'reservation.manage',
  'task.read',
  'task.manage',
  'shipment.read',
  'shipment.manage',
  'wave.read',
  'wave.manage',
  'billing.read',
  'billing.manage',
  'slotting.read',
  'slotting.manage',
]);

export function getClientReferenceFromRequest(request: ClientAccessRequestShape): string | undefined {
  return (
    readHeaderValue(request.headers, 'x-client-id') ??
    readHeaderValue(request.headers, 'x-owner-client-id') ??
    readHeaderValue(request.headers, 'x-client-reference') ??
    readHeaderValue(request.headers, 'x-client-code') ??
    readStringRecordValue(request.params, 'clientReference') ??
    readStringRecordValue(request.params, 'clientId') ??
    readStringRecordValue(request.params, 'ownerClientId') ??
    readStringRecordValue(request.query, 'ownerClientReference') ??
    readStringRecordValue(request.query, 'ownerClientId') ??
    readStringRecordValue(request.query, 'clientReference') ??
    readStringRecordValue(request.query, 'clientId') ??
    readStringRecordValue(request.query, 'clientCode') ??
    readBodyStringValue(request.body, 'ownerClientReference') ??
    readBodyStringValue(request.body, 'ownerClientId') ??
    readBodyStringValue(request.body, 'clientReference') ??
    readBodyStringValue(request.body, 'clientId') ??
    readBodyStringValue(request.body, 'clientCode')
  );
}

export function isClientScopedWarehousePermission(permissionCodes: string[]): boolean {
  return permissionCodes.some((permission) => CLIENT_SCOPED_WAREHOUSE_PERMISSIONS.has(permission));
}

export function shouldEnforceClientAccess(user: AuthenticatedUser): boolean {
  return (user.clientAccess?.filter((access) => access.isActive !== false).length ?? 0) > 0;
}

export function hasClientAccess(input: {
  user: AuthenticatedUser;
  clientReference: string;
  warehouseReference?: string | null;
}): boolean {
  const clientReference = normalizeReference(input.clientReference);
  const warehouseReference = input.warehouseReference ? normalizeReference(input.warehouseReference) : null;
  return (input.user.clientAccess ?? []).some((access) => matchesClientAccess(access, clientReference, warehouseReference));
}

function matchesClientAccess(
  access: AuthenticatedClientAccess,
  clientReference: string,
  warehouseReference: string | null,
): boolean {
  if (access.isActive === false) return false;
  const matchesClient = normalizeReference(access.clientId) === clientReference || normalizeReference(access.clientCode) === clientReference;
  if (!matchesClient) return false;
  if (!warehouseReference) return true;
  if (!access.warehouseId && !access.warehouseCode) return true;
  return normalizeReference(access.warehouseId ?? '') === warehouseReference || normalizeReference(access.warehouseCode ?? '') === warehouseReference;
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

function readStringRecordValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBodyStringValue(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object' || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readHeaderValue(headers: Record<string, string | string[] | undefined> | undefined, key: string): string | undefined {
  const value = headers?.[key];
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized && normalized.trim().length > 0 ? normalized.trim() : undefined;
}
