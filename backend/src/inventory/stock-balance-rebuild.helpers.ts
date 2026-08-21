import { StockMovementType } from './inventory.types';

export interface StockLedgerMovementInput {
  warehouseId: string;
  ownerClientId?: string | null;
  skuId: string;
  lotId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  type: string;
  quantity?: number | string | null;
  metadata?: unknown;
}

export interface RebuiltStockBalance {
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotId: string | null;
  locationId: string;
  quantity: number;
  movementCount: number;
}

export interface StockBalanceRebuildResult {
  balances: RebuiltStockBalance[];
  issues: Array<{
    code: string;
    severity: 'ERROR' | 'WARNING';
    message: string;
    skuId?: string;
    locationId?: string;
    actual?: number;
  }>;
}

const OUTBOUND_TYPES = new Set<string>([
  StockMovementType.PICK,
  StockMovementType.PACK,
  StockMovementType.SHIP,
  StockMovementType.RESERVE,
  StockMovementType.BLOCK,
]);
const INBOUND_TYPES = new Set<string>([
  StockMovementType.RECEIVE,
  StockMovementType.PUTAWAY,
  StockMovementType.UNBLOCK,
]);
const TRANSFER_TYPES = new Set<string>([StockMovementType.MOVE, StockMovementType.PUTAWAY, StockMovementType.BLOCK, StockMovementType.UNBLOCK]);

export function rebuildStockBalancesFromMovements(movements: StockLedgerMovementInput[]): StockBalanceRebuildResult {
  const balances = new Map<string, RebuiltStockBalance>();
  const issues: StockBalanceRebuildResult['issues'] = [];

  for (const movement of movements) {
    const quantity = getMovementQuantity(movement);
    if (quantity === 0) continue;

    if (TRANSFER_TYPES.has(movement.type) && movement.fromLocationId && movement.toLocationId) {
      applyDelta(balances, movement, movement.fromLocationId, -Math.abs(quantity));
      applyDelta(balances, movement, movement.toLocationId, Math.abs(quantity));
      continue;
    }

    if (movement.type === StockMovementType.ADJUST) {
      const delta = getAdjustmentDelta(movement);
      const locationId = movement.toLocationId ?? movement.fromLocationId;
      if (!locationId) {
        issues.push({ code: 'ADJUSTMENT_MISSING_LOCATION', severity: 'ERROR', message: 'Adjustment movement is missing location.', skuId: movement.skuId });
        continue;
      }
      applyDelta(balances, movement, locationId, delta);
      continue;
    }

    if (INBOUND_TYPES.has(movement.type) && movement.toLocationId) {
      applyDelta(balances, movement, movement.toLocationId, Math.abs(quantity));
      continue;
    }

    if (OUTBOUND_TYPES.has(movement.type) && movement.fromLocationId) {
      applyDelta(balances, movement, movement.fromLocationId, -Math.abs(quantity));
      continue;
    }

    const fallbackLocation = movement.toLocationId ?? movement.fromLocationId;
    if (!fallbackLocation) {
      issues.push({ code: 'MOVEMENT_MISSING_LOCATION', severity: 'ERROR', message: 'Movement cannot be mapped to a balance location.', skuId: movement.skuId });
      continue;
    }
    applyDelta(balances, movement, fallbackLocation, quantity);
  }

  for (const balance of balances.values()) {
    if (balance.quantity < 0) {
      issues.push({
        code: 'REBUILT_NEGATIVE_BALANCE',
        severity: 'WARNING',
        message: 'Rebuilt movement ledger produced a negative balance.',
        skuId: balance.skuId,
        locationId: balance.locationId,
        actual: balance.quantity,
      });
    }
  }

  return { balances: [...balances.values()].sort(sortBalances), issues };
}

function applyDelta(
  balances: Map<string, RebuiltStockBalance>,
  movement: StockLedgerMovementInput,
  locationId: string,
  delta: number,
): void {
  const key = [movement.warehouseId, movement.ownerClientId ?? '', movement.skuId, movement.lotId ?? '', locationId].join('|');
  const current = balances.get(key) ?? {
    warehouseId: movement.warehouseId,
    ownerClientId: movement.ownerClientId ?? null,
    skuId: movement.skuId,
    lotId: movement.lotId ?? null,
    locationId,
    quantity: 0,
    movementCount: 0,
  };
  current.quantity += delta;
  current.movementCount += 1;
  balances.set(key, current);
}

function getMovementQuantity(movement: StockLedgerMovementInput): number {
  const value = Number(movement.quantity ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getAdjustmentDelta(movement: StockLedgerMovementInput): number {
  if (movement.metadata && typeof movement.metadata === 'object' && !Array.isArray(movement.metadata)) {
    const raw = (movement.metadata as Record<string, unknown>)['quantityDelta'];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return getMovementQuantity(movement);
}

function sortBalances(left: RebuiltStockBalance, right: RebuiltStockBalance): number {
  return left.skuId.localeCompare(right.skuId) || left.locationId.localeCompare(right.locationId);
}
