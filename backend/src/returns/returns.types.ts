export const ReturnOrderStatus = {
  CREATED: 'CREATED',
  RECEIVING: 'RECEIVING',
  INSPECTION: 'INSPECTION',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReturnOrderStatus = (typeof ReturnOrderStatus)[keyof typeof ReturnOrderStatus];

export const ReturnLineStatus = {
  OPEN: 'OPEN',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  PARTIALLY_INSPECTED: 'PARTIALLY_INSPECTED',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
} as const;
export type ReturnLineStatus = (typeof ReturnLineStatus)[keyof typeof ReturnLineStatus];

export const ReturnDisposition = {
  RESTOCK: 'RESTOCK',
  QUARANTINE: 'QUARANTINE',
  DAMAGED: 'DAMAGED',
  SCRAP: 'SCRAP',
  SUPPLIER_RETURN: 'SUPPLIER_RETURN',
} as const;
export type ReturnDisposition = (typeof ReturnDisposition)[keyof typeof ReturnDisposition];

export interface ReturnOrderLineResponse {
  id: string;
  returnOrderId: string;
  lineNumber: string;
  skuId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  inspectedQuantity: number;
  disposition: ReturnDisposition | null;
  status: ReturnLineStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnOrderResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  rmaNumber: string;
  status: ReturnOrderStatus;
  customerReference: string | null;
  externalReference: string | null;
  reasonCode: string | null;
  metadata: unknown;
  lines: ReturnOrderLineResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnInspectionResponse {
  id: string;
  warehouseId: string;
  returnOrderId: string;
  returnOrderLineId: string;
  disposition: ReturnDisposition;
  inspectedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  stockQuantId: string | null;
  notes: string | null;
  metadata: unknown;
  createdAt: Date;
}
