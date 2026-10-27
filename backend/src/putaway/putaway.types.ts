import { WarehouseTaskResponse } from '../warehouse-tasks/warehouse-tasks.types';

export interface PutawaySkuResponse {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
}

export interface PutawayLocationResponse {
  id: string;
  code: string;
  name: string;
  type: string;
  zone: string | null;
}

export interface PutawayQuantResponse {
  id: string;
  warehouseId: string;
  skuId: string;
  locationId: string;
  status: string;
  batch: string | null;
  expiry: Date | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  sku: PutawaySkuResponse | null;
  location: PutawayLocationResponse | null;
}

export interface PutawaySuggestionResponse {
  warehouseId: string;
  skuId: string;
  sourceLocationId: string | null;
  suggestedLocationId: string;
  suggestedLocation: PutawayLocationResponse;
  strategy: 'CONSOLIDATE_SAME_SKU_BATCH' | 'EMPTY_STORAGE_BIN' | 'FIRST_STORAGE_BIN';
  reason: string;
  sourceQuant: PutawayQuantResponse | null;
}

export interface PutawayMovementResponse {
  id: string;
  warehouseId: string;
  skuId: string;
  stockQuantId: string | null;
  taskId: string | null;
  type: string;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
}

export interface PutawayTaskResponse {
  task: WarehouseTaskResponse;
  sourceQuant: PutawayQuantResponse;
  suggestedLocation: PutawayLocationResponse;
}

export interface PutawayConfirmResponse {
  task: WarehouseTaskResponse;
  sourceQuant: PutawayQuantResponse;
  targetQuant: PutawayQuantResponse;
  movement: PutawayMovementResponse;
}
