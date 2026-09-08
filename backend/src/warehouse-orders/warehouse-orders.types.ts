export const WarehouseOrderType = {
  MOVE: 'MOVE',
  PUTAWAY: 'PUTAWAY',
  PICK: 'PICK',
  REPLENISH: 'REPLENISH',
  COUNT: 'COUNT',
  LOAD: 'LOAD',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type WarehouseOrderType = (typeof WarehouseOrderType)[keyof typeof WarehouseOrderType];

export const WarehouseOrderStatus = {
  DRAFT: 'DRAFT',
  RELEASED: 'RELEASED',
  IN_PROGRESS: 'IN_PROGRESS',
  PARTIALLY_COMPLETED: 'PARTIALLY_COMPLETED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION',
} as const;
export type WarehouseOrderStatus = (typeof WarehouseOrderStatus)[keyof typeof WarehouseOrderStatus];

export const WarehouseOrderLineStatus = {
  OPEN: 'OPEN',
  ALLOCATED: 'ALLOCATED',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION',
} as const;
export type WarehouseOrderLineStatus = (typeof WarehouseOrderLineStatus)[keyof typeof WarehouseOrderLineStatus];

export interface WarehouseOrderLineResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  warehouseOrderId: string;
  lineNumber: string;
  skuId: string | null;
  lotId: string | null;
  requestedQuantity: number;
  allocatedQuantity: number;
  completedQuantity: number;
  serialRequired: boolean;
  status: WarehouseOrderLineStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseOrderTaskLinkResponse {
  id: string;
  warehouseOrderId: string;
  warehouseOrderLineId: string | null;
  warehouseTaskId: string;
  createdAt: Date;
}

export interface WarehouseOrderResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  orderNumber: string;
  orderType: WarehouseOrderType;
  status: WarehouseOrderStatus;
  priority: number;
  sourceType: string | null;
  sourceId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  dueAt: Date | null;
  releasedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
  lines: WarehouseOrderLineResponse[];
  taskLinks: WarehouseOrderTaskLinkResponse[];
  createdAt: Date;
  updatedAt: Date;
}
