export interface VersionedRecordInput {
  id: string;
  version?: number | null;
}

export interface StockReservationSnapshot {
  id: string;
  quantity: number;
  reservedQuantity: number;
  version?: number | null;
}

export interface AtomicReservationAttempt {
  quantity: number;
  expectedVersion?: number | null;
}

export interface AtomicReservationResult {
  success: boolean;
  reason: 'OK' | 'NON_POSITIVE_QUANTITY' | 'STALE_VERSION' | 'INSUFFICIENT_AVAILABLE_QUANTITY';
  availableBefore: number;
  availableAfter: number;
  stockQuant: StockReservationSnapshot;
}

export function buildOptimisticVersionWhere(record: VersionedRecordInput): Record<string, unknown> {
  return typeof record.version === 'number' ? { id: record.id, version: record.version } : { id: record.id };
}

export function getAvailableStockQuantity(stockQuant: Pick<StockReservationSnapshot, 'quantity' | 'reservedQuantity'>): number {
  return Math.max(0, stockQuant.quantity - stockQuant.reservedQuantity);
}

export function canReserveStockQuantity(
  stockQuant: Pick<StockReservationSnapshot, 'quantity' | 'reservedQuantity'>,
  quantity: number,
): boolean {
  return Number.isInteger(quantity) && quantity > 0 && getAvailableStockQuantity(stockQuant) >= quantity;
}

export function applyAtomicReservationSnapshot(
  stockQuant: StockReservationSnapshot,
  attempt: AtomicReservationAttempt,
): AtomicReservationResult {
  const availableBefore = getAvailableStockQuantity(stockQuant);

  if (!Number.isInteger(attempt.quantity) || attempt.quantity <= 0) {
    return failed('NON_POSITIVE_QUANTITY', stockQuant, availableBefore);
  }

  if (
    typeof attempt.expectedVersion === 'number' &&
    typeof stockQuant.version === 'number' &&
    attempt.expectedVersion !== stockQuant.version
  ) {
    return failed('STALE_VERSION', stockQuant, availableBefore);
  }

  if (availableBefore < attempt.quantity) {
    return failed('INSUFFICIENT_AVAILABLE_QUANTITY', stockQuant, availableBefore);
  }

  const updated = {
    ...stockQuant,
    reservedQuantity: stockQuant.reservedQuantity + attempt.quantity,
    version: typeof stockQuant.version === 'number' ? stockQuant.version + 1 : stockQuant.version,
  };

  return {
    success: true,
    reason: 'OK',
    availableBefore,
    availableAfter: getAvailableStockQuantity(updated),
    stockQuant: updated,
  };
}

function failed(
  reason: AtomicReservationResult['reason'],
  stockQuant: StockReservationSnapshot,
  availableBefore: number,
): AtomicReservationResult {
  return {
    success: false,
    reason,
    availableBefore,
    availableAfter: availableBefore,
    stockQuant,
  };
}
