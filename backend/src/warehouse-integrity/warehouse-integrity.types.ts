export const WarehouseIntegrityStatus = {
  OK: 'OK',
  ISSUES: 'ISSUES',
} as const;

export type WarehouseIntegrityStatus =
  (typeof WarehouseIntegrityStatus)[keyof typeof WarehouseIntegrityStatus];

export const WarehouseIntegritySeverity = {
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;

export type WarehouseIntegritySeverity =
  (typeof WarehouseIntegritySeverity)[keyof typeof WarehouseIntegritySeverity];

export interface WarehouseIntegrityIssue {
  code: string;
  severity: WarehouseIntegritySeverity;
  entityType: string;
  entityId: string | null;
  message: string;
  expected?: number | null;
  actual?: number | null;
}

export interface WarehouseIntegrityResponse {
  warehouseId: string;
  checkedAt: Date;
  status: WarehouseIntegrityStatus;
  summary: {
    errorCount: number;
    warningCount: number;
    stockQuantCount: number;
    reservationCount: number;
    outboundOrderCount: number;
    outboundOrderLineCount: number;
    packageContentCount: number;
    shipmentCount: number;
    shipmentPackageCount: number;
    carrierLabelCount: number;
    activeFreezeCount: number;
    handlingUnitCount: number;
    warehouseTaskCount: number;
    warehouseOrderCount: number;
    warehouseOrderLineCount: number;
    stockMovementCount: number;
  };
  issues: WarehouseIntegrityIssue[];
}

export interface WarehouseIntegrityStockQuant {
  id: string;
  warehouseId?: string | null;
  locationId?: string | null;
  skuId?: string | null;
  handlingUnitId?: string | null;
  status?: string | null;
  quantity: number;
  reservedQuantity?: number | null;
}

export interface WarehouseIntegrityReservation {
  id: string;
  stockQuantId?: string | null;
  skuId?: string | null;
  outboundOrderId?: string | null;
  outboundOrderLineId?: string | null;
  quantity: number;
  status: string;
}

export interface WarehouseIntegrityOutboundOrder {
  id: string;
  status: string;
}

export interface WarehouseIntegrityOutboundOrderLine {
  id: string;
  orderId?: string | null;
  lineNumber?: string | null;
  sku?: string | null;
  orderedQuantity: number;
  pickedQuantity?: number | null;
}

export interface WarehouseIntegrityPackageContent {
  id: string;
  packageId?: string | null;
  outboundOrderLineId?: string | null;
  sku?: string | null;
  quantity: number;
}

export interface WarehouseIntegrityShipment {
  id: string;
  shipmentNumber?: string | null;
  carrier?: string | null;
  status: string;
}

export interface WarehouseIntegrityShipmentPackage {
  id: string;
  shipmentId?: string | null;
  status?: string | null;
}

export interface WarehouseIntegrityCarrierLabel {
  id: string;
  shipmentId?: string | null;
  packageId?: string | null;
  status?: string | null;
}

export interface WarehouseIntegrityStockFreeze {
  id: string;
  status: string;
  stockQuantId?: string | null;
  locationId?: string | null;
  skuId?: string | null;
}

export interface WarehouseIntegrityHandlingUnit {
  id: string;
  status: string;
  currentLocationId?: string | null;
  parentId?: string | null;
}

export interface WarehouseIntegrityWarehouseTask {
  id: string;
  type: string;
  status: string;
  quantity?: number | null;
  reservationId?: string | null;
  handlingUnitId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  assignedAt?: Date | string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  failureReason?: string | null;
}

export interface WarehouseIntegrityWarehouseOrder {
  id: string;
  status: string;
}

export interface WarehouseIntegrityWarehouseOrderLine {
  id: string;
  warehouseOrderId?: string | null;
  requestedQuantity: number;
  allocatedQuantity?: number | null;
  completedQuantity?: number | null;
  status: string;
}

export interface WarehouseIntegrityStockMovement {
  id: string;
  stockQuantId?: string | null;
  reservationId?: string | null;
  taskId?: string | null;
  type: string;
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}

export interface WarehouseIntegritySnapshot {
  warehouseId: string;
  checkedAt?: Date;
  stockQuants?: WarehouseIntegrityStockQuant[];
  reservations?: WarehouseIntegrityReservation[];
  outboundOrders?: WarehouseIntegrityOutboundOrder[];
  outboundOrderLines?: WarehouseIntegrityOutboundOrderLine[];
  packageContents?: WarehouseIntegrityPackageContent[];
  shipments?: WarehouseIntegrityShipment[];
  shipmentPackages?: WarehouseIntegrityShipmentPackage[];
  carrierLabels?: WarehouseIntegrityCarrierLabel[];
  stockFreezes?: WarehouseIntegrityStockFreeze[];
  handlingUnits?: WarehouseIntegrityHandlingUnit[];
  warehouseTasks?: WarehouseIntegrityWarehouseTask[];
  warehouseOrders?: WarehouseIntegrityWarehouseOrder[];
  warehouseOrderLines?: WarehouseIntegrityWarehouseOrderLine[];
  stockMovements?: WarehouseIntegrityStockMovement[];
}
