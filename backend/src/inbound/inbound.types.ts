export const InboundStatus = {
  CREATED: 'CREATED',
  EXPECTED: 'EXPECTED',
  RECEIVING: 'RECEIVING',
  RECEIVED: 'RECEIVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION',
} as const;

export type InboundStatus = (typeof InboundStatus)[keyof typeof InboundStatus];

export interface InboundParcelResponse {
  id: string;
  trackingNumber: string;
  status: string;
}

export interface InboundShipmentLineResponse {
  id: string;
  shipmentId: string;
  lineNumber: string;
  sku: string;
  description: string | null;
  expectedQuantity: number;
  receivedQuantity: number;
  parcel: InboundParcelResponse | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundDockLocationResponse {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface InboundShipmentResponse {
  id: string;
  warehouseId: string;
  dockLocationId: string | null;
  shipmentNumber: string;
  status: InboundStatus;
  supplierName: string | null;
  supplierReference: string | null;
  purchaseOrderReference: string | null;
  externalReference: string | null;
  expectedAt: Date | null;
  appointmentStartAt: Date | null;
  appointmentEndAt: Date | null;
  receivedAt: Date | null;
  dockLocation: InboundDockLocationResponse | null;
  metadata: unknown;
  lines: InboundShipmentLineResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundReceiveQuantResponse {
  id: string;
  warehouseId: string;
  locationId: string;
  skuId: string;
  quantity: number;
  reservedQuantity: number;
  status: string;
  batch: string | null;
  expiryDate: Date | null;
}

export interface InboundReceiveMovementResponse {
  id: string;
  type: string;
  quantity: number;
  stockQuantId: string | null;
  taskId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  occurredAt: Date;
}

export interface InboundReceiveTaskResponse {
  id: string;
  type: string;
  status: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  skuId: string | null;
  quantity: number | null;
}

export interface InboundReceiveExceptionResponse {
  id: string;
  code: string;
  title: string;
  status: string;
  severity: string;
}

export interface InboundReceiveQualityCheckResponse {
  status: 'PASSED' | 'HOLD' | 'FAILED';
  reference: string | null;
  notes: string | null;
  heldQuantity: number;
}

export interface InboundReceiveResponse {
  shipment: InboundShipmentResponse;
  line: InboundShipmentLineResponse;
  quant: InboundReceiveQuantResponse;
  movement: InboundReceiveMovementResponse;
  putawayTask: InboundReceiveTaskResponse | null;
  quants: InboundReceiveQuantResponse[];
  movements: InboundReceiveMovementResponse[];
  exceptions: InboundReceiveExceptionResponse[];
  receivedQuantity: number;
  damagedQuantity: number;
  qualityHeldQuantity: number;
  qualityCheck: InboundReceiveQualityCheckResponse | null;
}
