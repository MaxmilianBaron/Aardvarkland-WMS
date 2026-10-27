export const WarehouseTaskType = {
  RECEIVE: 'RECEIVE',
  PUTAWAY: 'PUTAWAY',
  PICK: 'PICK',
  PACK: 'PACK',
  MOVE: 'MOVE',
  REPLENISH: 'REPLENISH',
  COUNT: 'COUNT',
  LOAD: 'LOAD',
} as const;

export type WarehouseTaskType = (typeof WarehouseTaskType)[keyof typeof WarehouseTaskType];

export const WarehouseTaskStatus = {
  OPEN: 'OPEN',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type WarehouseTaskStatus = (typeof WarehouseTaskStatus)[keyof typeof WarehouseTaskStatus];

export interface WarehouseTaskUserResponse {
  id: string;
  email: string;
  displayName: string;
}

export interface WarehouseTaskLocationResponse {
  id: string;
  code: string;
  name: string;
  zone: string | null;
}

export interface WarehouseTaskSkuResponse {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
}

export interface WarehouseTaskHandlingUnitResponse {
  id: string;
  code: string;
  type: string;
  status: string;
}

export interface WarehouseTaskResponse {
  id: string;
  warehouseId: string;
  type: WarehouseTaskType;
  status: WarehouseTaskStatus;
  assignedUserId: string | null;
  assignedUser: WarehouseTaskUserResponse | null;
  fromLocationId: string | null;
  fromLocation: WarehouseTaskLocationResponse | null;
  toLocationId: string | null;
  toLocation: WarehouseTaskLocationResponse | null;
  skuId: string | null;
  sku: WarehouseTaskSkuResponse | null;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
  inboundShipmentId: string | null;
  inboundShipmentLineId: string | null;
  reservationId: string | null;
  quantity: number | null;
  handlingUnitId: string | null;
  handlingUnitReference: string | null;
  handlingUnit: WarehouseTaskHandlingUnitResponse | null;
  externalReference: string | null;
  failureReason: string | null;
  version: number | null;
  metadata: unknown;
  assignedAt: Date | null;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
