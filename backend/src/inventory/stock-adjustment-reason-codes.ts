export const StockAdjustmentReasonCode = {
  CYCLE_COUNT_VARIANCE: 'CYCLE_COUNT_VARIANCE',
  DAMAGE_WRITE_OFF: 'DAMAGE_WRITE_OFF',
  FOUND_STOCK: 'FOUND_STOCK',
  LOST_STOCK: 'LOST_STOCK',
  RETURN_CORRECTION: 'RETURN_CORRECTION',
  SUPPLIER_SHORTAGE: 'SUPPLIER_SHORTAGE',
  SYSTEM_RECONCILIATION: 'SYSTEM_RECONCILIATION',
  MANUAL_CORRECTION: 'MANUAL_CORRECTION',
} as const;

export type StockAdjustmentReasonCode =
  (typeof StockAdjustmentReasonCode)[keyof typeof StockAdjustmentReasonCode];

const VALID_REASON_CODES = new Set<string>(Object.values(StockAdjustmentReasonCode));

export function normalizeStockAdjustmentReasonCode(
  value: string | null | undefined,
): StockAdjustmentReasonCode {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, '_');

  if (!normalized) {
    return StockAdjustmentReasonCode.MANUAL_CORRECTION;
  }

  if (!VALID_REASON_CODES.has(normalized)) {
    return StockAdjustmentReasonCode.MANUAL_CORRECTION;
  }

  return normalized as StockAdjustmentReasonCode;
}

export function withStockAdjustmentReasonMetadata(
  metadata: Record<string, unknown> | undefined,
  reasonCode: string | null | undefined,
  reason?: string | null,
): Record<string, unknown> {
  const normalizedReasonCode = normalizeStockAdjustmentReasonCode(reasonCode);
  const normalizedReason = reason?.trim();

  return {
    ...(metadata ?? {}),
    reasonCode: normalizedReasonCode,
    ...(normalizedReason ? { reason: normalizedReason } : {}),
  };
}
