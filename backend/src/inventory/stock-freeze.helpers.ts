import { ConflictException } from '@nestjs/common';

export interface StockFreezeCheckInput {
  warehouseId: string;
  stockQuantId?: string | null;
  locationId?: string | null;
  skuId?: string | null;
  operation?: string | null;
  allowPlanId?: string | null;
}

export interface StockFreezeRecord {
  id: string;
  warehouseId: string;
  planId?: string | null;
  locationId?: string | null;
  skuId?: string | null;
  stockQuantId?: string | null;
  status?: string | null;
  reason?: string | null;
}

export interface StockFreezeDelegate {
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, string>;
  }): Promise<StockFreezeRecord | null>;
}

export interface StockFreezeClient {
  stockFreeze?: StockFreezeDelegate;
}

export function buildActiveStockFreezeWhere(input: StockFreezeCheckInput): Record<string, unknown> {
  const scopedMatches: Array<Record<string, unknown>> = [
    { stockQuantId: null, locationId: null, skuId: null },
  ];

  if (input.stockQuantId) {
    scopedMatches.push({ stockQuantId: input.stockQuantId, locationId: null, skuId: null });
  }

  if (input.locationId && input.skuId) {
    scopedMatches.push({ stockQuantId: null, locationId: input.locationId, skuId: input.skuId });
  }

  if (input.locationId) {
    scopedMatches.push({ stockQuantId: null, locationId: input.locationId, skuId: null });
  }

  if (input.skuId) {
    scopedMatches.push({ stockQuantId: null, locationId: null, skuId: input.skuId });
  }

  return {
    warehouseId: input.warehouseId,
    status: 'ACTIVE',
    ...(input.allowPlanId ? { NOT: { planId: input.allowPlanId } } : {}),
    OR: scopedMatches,
  };
}

export async function findBlockingStockFreeze(
  client: unknown,
  input: StockFreezeCheckInput,
): Promise<StockFreezeRecord | null> {
  const stockFreeze = getStockFreezeDelegate(client);

  if (!stockFreeze) {
    return null;
  }

  return stockFreeze.findFirst({
    where: buildActiveStockFreezeWhere(input),
    orderBy: { createdAt: 'asc' },
  });
}

export async function assertNoBlockingStockFreeze(
  client: unknown,
  input: StockFreezeCheckInput,
): Promise<void> {
  const freeze = await findBlockingStockFreeze(client, input);

  if (!freeze) {
    return;
  }

  const scope = describeStockFreezeScope(freeze);
  const operation = input.operation?.trim() || 'stock operation';
  const reason = freeze.reason ? ` Reason: ${freeze.reason}.` : '';

  throw new ConflictException(
    `Cannot perform ${operation}; active stock freeze ${freeze.id} blocks ${scope}.${reason}`,
  );
}

export function describeStockFreezeScope(freeze: StockFreezeRecord): string {
  if (freeze.stockQuantId) {
    return `stock quant ${freeze.stockQuantId}`;
  }

  if (freeze.locationId && freeze.skuId) {
    return `location ${freeze.locationId} and SKU ${freeze.skuId}`;
  }

  if (freeze.locationId) {
    return `location ${freeze.locationId}`;
  }

  if (freeze.skuId) {
    return `SKU ${freeze.skuId}`;
  }

  return `warehouse ${freeze.warehouseId}`;
}

function getStockFreezeDelegate(client: unknown): StockFreezeDelegate | null {
  if (!client || typeof client !== 'object') {
    return null;
  }

  const stockFreeze = (client as StockFreezeClient).stockFreeze;

  return stockFreeze?.findFirst ? stockFreeze : null;
}
