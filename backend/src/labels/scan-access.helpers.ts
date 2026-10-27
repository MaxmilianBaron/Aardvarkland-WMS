import { AuthenticatedUser } from '../access-control/types';

export function getScanOwnerClientIds(
  actor: AuthenticatedUser,
  warehouseId: string,
  warehouseCode: string,
): string[] | null {
  const activeAccess = (actor.clientAccess ?? []).filter((access) => access.isActive !== false);
  if (activeAccess.length === 0) {
    return null;
  }

  const normalizedWarehouseId = normalizeReference(warehouseId);
  const normalizedWarehouseCode = normalizeReference(warehouseCode);
  const clientIds = activeAccess
    .filter((access) => {
      if (!access.warehouseId && !access.warehouseCode) {
        return true;
      }
      return (
        normalizeReference(access.warehouseId ?? '') === normalizedWarehouseId ||
        normalizeReference(access.warehouseCode ?? '') === normalizedWarehouseCode
      );
    })
    .map((access) => access.clientId);

  return Array.from(new Set(clientIds));
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}
