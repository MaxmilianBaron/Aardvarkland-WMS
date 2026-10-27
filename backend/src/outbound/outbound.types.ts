export const OutboundStatus = {
  DRAFT: 'DRAFT',
  CREATED: 'CREATED',
  ALLOCATED: 'ALLOCATED',
  PICKING: 'PICKING',
  PICKED: 'PICKED',
  PACKING: 'PACKING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION',
} as const;

export type OutboundStatus = (typeof OutboundStatus)[keyof typeof OutboundStatus];

export interface OutboundParcelResponse {
  id: string;
  trackingNumber: string;
  status: string;
}

export interface OutboundOrderLineResponse {
  id: string;
  orderId: string;
  lineNumber: string;
  sku: string;
  description: string | null;
  orderedQuantity: number;
  pickedQuantity: number;
  parcel: OutboundParcelResponse | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboundOrderResponse {
  id: string;
  warehouseId: string;
  orderNumber: string;
  status: OutboundStatus;
  customerReference: string | null;
  recipientName: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  shipBy: Date | null;
  shippedAt: Date | null;
  metadata: unknown;
  lines: OutboundOrderLineResponse[];
  createdAt: Date;
  updatedAt: Date;
}
