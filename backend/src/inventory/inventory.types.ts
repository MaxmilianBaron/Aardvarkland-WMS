export const StockQuantStatus = {
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  BLOCKED: 'BLOCKED',
  DAMAGED: 'DAMAGED',
  IN_TRANSIT: 'IN_TRANSIT',
  QUARANTINE: 'QUARANTINE',
} as const;

export type StockQuantStatus = (typeof StockQuantStatus)[keyof typeof StockQuantStatus];

export const StockMovementType = {
  RECEIVE: 'RECEIVE',
  PUTAWAY: 'PUTAWAY',
  MOVE: 'MOVE',
  RESERVE: 'RESERVE',
  PICK: 'PICK',
  PACK: 'PACK',
  SHIP: 'SHIP',
  ADJUST: 'ADJUST',
  BLOCK: 'BLOCK',
  UNBLOCK: 'UNBLOCK',
  CANCEL_RESERVATION: 'CANCEL_RESERVATION',
} as const;

export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export interface InventorySkuResponse {
  id: string;
  code: string;
  name: string | null;
  productId: string | null;
}

export interface InventoryLocationResponse {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface StockQuantResponse {
  id: string;
  warehouseId: string;
  skuId: string;
  locationId: string;
  status: StockQuantStatus;
  batch: string | null;
  expiry: Date | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  sku: InventorySkuResponse | null;
  location: InventoryLocationResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovementResponse {
  id: string;
  warehouseId: string;
  quantId: string | null;
  skuId: string;
  type: StockMovementType;
  quantityDelta: number | null;
  quantity: number | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  sku: InventorySkuResponse | null;
  fromLocation: InventoryLocationResponse | null;
  toLocation: InventoryLocationResponse | null;
  actorUserId: string | null;
  reference: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
}

export interface StockOperationResponse {
  quant: StockQuantResponse;
  movement: StockMovementResponse;
}

export interface StockBalanceResponse {
  warehouseId: string;
  skuId: string;
  locationId: string;
  status: StockQuantStatus;
  batch: string | null;
  expiry: Date | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  quantCount: number;
  sku: InventorySkuResponse | null;
  location: InventoryLocationResponse | null;
}

export interface StockConsistencyIssueResponse {
  type: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  stockQuantId?: string;
  reservationId?: string;
  skuId?: string;
  locationId?: string;
  expected?: number;
  actual?: number;
}

export interface StockConsistencyResponse {
  status: 'OK' | 'ISSUES';
  warehouseId: string;
  checkedAt: Date;
  quantCount: number;
  activeReservationCount: number;
  issueCount: number;
  issues: StockConsistencyIssueResponse[];
}


export interface StockBalanceRebuildPreviewResponse {
  generatedAt: string;
  movementCount: number;
  balanceCount: number;
  balances: Array<{
    warehouseId: string;
    ownerClientId: string | null;
    skuId: string;
    lotId: string | null;
    locationId: string;
    quantity: number;
    movementCount: number;
  }>;
  issues: Array<{
    code: string;
    severity: 'ERROR' | 'WARNING';
    message: string;
    skuId?: string;
    locationId?: string;
    actual?: number;
  }>;
}
