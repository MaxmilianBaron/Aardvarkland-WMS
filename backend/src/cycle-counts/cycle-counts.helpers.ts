export function calculateCountVariance(
  expectedQuantity: number | null,
  countedQuantity: number,
): number {
  return countedQuantity - (expectedQuantity ?? 0);
}

export function shouldAutoReconcileCount(
  expectedQuantity: number | null,
  countedQuantity: number,
): boolean {
  return calculateCountVariance(expectedQuantity, countedQuantity) === 0;
}

export function makeCycleCountPlanCode(date = new Date()): string {
  const compact = date
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return `CC-${compact}`;
}
