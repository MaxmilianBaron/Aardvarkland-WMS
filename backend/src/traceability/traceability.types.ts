export const LotStatus = {
  ACTIVE: 'ACTIVE',
  HOLD: 'HOLD',
  QUARANTINED: 'QUARANTINED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
  RECALLED: 'RECALLED',
  CONSUMED: 'CONSUMED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type LotStatus = (typeof LotStatus)[keyof typeof LotStatus];

export const LotQualityStatus = {
  RELEASED: 'RELEASED',
  PENDING_QA: 'PENDING_QA',
  HOLD: 'HOLD',
  REJECTED: 'REJECTED',
} as const;
export type LotQualityStatus = (typeof LotQualityStatus)[keyof typeof LotQualityStatus];

export const SerialNumberStatus = {
  EXPECTED: 'EXPECTED',
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  PICKED: 'PICKED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  BLOCKED: 'BLOCKED',
  DAMAGED: 'DAMAGED',
  RETURNED: 'RETURNED',
  SCRAPPED: 'SCRAPPED',
} as const;
export type SerialNumberStatus = (typeof SerialNumberStatus)[keyof typeof SerialNumberStatus];

export interface SkuLotResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotCode: string;
  batch: string | null;
  supplierLot: string | null;
  qualityStatus: LotQualityStatus;
  status: LotStatus;
  manufacturedAt: Date | null;
  expiryDate: Date | null;
  receivedAt: Date | null;
  releasedAt: Date | null;
  quarantinedAt: Date | null;
  quarantineReason: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerialNumberResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotId: string | null;
  stockQuantId: string | null;
  serialNumber: string;
  status: SerialNumberStatus;
  firstReceivedAt: Date | null;
  lastSeenLocationId: string | null;
  inboundShipmentLineId: string | null;
  outboundOrderLineId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerialNumberEventResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  serialNumberId: string;
  eventType: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  stockQuantId: string | null;
  actorUserId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
}

export interface RecallReportSerialItem extends SerialNumberResponse {
  skuCode: string | null;
  lotCode: string | null;
  ownerClientCode: string | null;
  lastSeenLocationCode: string | null;
  inboundShipmentNumber: string | null;
  inboundLineNumber: string | null;
  outboundOrderNumber: string | null;
  outboundLineNumber: string | null;
}

export interface RecallReportOrderImpact {
  outboundOrderId: string;
  orderNumber: string;
  ownerClientId: string | null;
  ownerClientCode: string | null;
  status: string;
  serialCount: number;
  serialNumbers: string[];
}

export interface RecallReportShipmentImpact {
  shipmentId: string;
  shipmentNumber: string;
  packageId: string | null;
  packageCode: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  trackingNumber: string | null;
  labelReference: string | null;
  trackingStatus: string | null;
  serialCount: number;
  serialNumbers: string[];
}

export interface RecallReportInventoryImpact {
  stockQuantId: string;
  locationId: string;
  locationCode: string | null;
  skuId: string;
  skuCode: string | null;
  lotId: string | null;
  lotCode: string | null;
  ownerClientId: string | null;
  ownerClientCode: string | null;
  quantity: number;
  reservedQuantity: number;
  status: string;
}

export interface RecallGenealogyReportResponse {
  reportId: string;
  warehouseId: string;
  generatedAt: string;
  criteria: {
    lotReference: string | null;
    serialNumber: string | null;
    skuReference: string | null;
    ownerClientId: string | null;
    limit: number;
  };
  summary: {
    serialCount: number;
    lotCount: number;
    inventoryQuantCount: number;
    affectedOrderCount: number;
    affectedShipmentCount: number;
    affectedClientCount: number;
    shippedSerialCount: number;
    blockedOrDamagedSerialCount: number;
  };
  lots: SkuLotResponse[];
  serials: RecallReportSerialItem[];
  inventory: RecallReportInventoryImpact[];
  affectedOrders: RecallReportOrderImpact[];
  affectedShipments: RecallReportShipmentImpact[];
  events: SerialNumberEventResponse[];
}
