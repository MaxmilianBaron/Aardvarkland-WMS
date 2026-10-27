export interface ReplenishmentQuantityInput {
  availablePickQuantity: number;
  minQuantity: number;
  maxQuantity: number;
  targetQuantity: number;
}

export function calculateReplenishmentQuantity(input: ReplenishmentQuantityInput): number {
  if (input.availablePickQuantity >= input.minQuantity) {
    return 0;
  }

  return Math.max(0, input.targetQuantity - input.availablePickQuantity);
}

export function getAvailableQuantity(quantity: number, reservedQuantity: number): number {
  return Math.max(0, quantity - reservedQuantity);
}
