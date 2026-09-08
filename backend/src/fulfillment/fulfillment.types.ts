export const FulfillmentStatus = {
  CREATED: 'CREATED',
  ALLOCATED: 'ALLOCATED',
  PICKING: 'PICKING',
  PICKED: 'PICKED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION',
} as const;

export type FulfillmentStatus = (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

export interface FulfillmentParcelResponse {
  id: string;
  trackingNumber: string;
  status: string;
}

export interface FulfillmentOrderLineResponse {
  id: string;
  orderId: string;
  lineNumber: string;
  sku: string;
  description: string | null;
  orderedQuantity: number;
  pickedQuantity: number;
  parcel: FulfillmentParcelResponse | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface FulfillmentOrderResponse {
  id: string;
  warehouseId: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: FulfillmentStatus;
  customerReference: string | null;
  recipientName: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  shipBy: Date | null;
  shippedAt: Date | null;
  metadata: unknown;
  lines: FulfillmentOrderLineResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FulfillmentActionResponse {
  order: FulfillmentOrderResponse;
  tasksCreated: number;
  movementsCreated: number;
}

export interface ConfirmPickResponse extends FulfillmentActionResponse {
  task: {
    id: string | null;
    status: string;
  };
  pickedLine: {
    id: string;
    lineNumber: string;
    pickedQuantity: number;
    orderedQuantity: number;
  };
}
