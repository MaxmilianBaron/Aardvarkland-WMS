export const PackingStationStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type PackingStationStatus = (typeof PackingStationStatus)[keyof typeof PackingStationStatus];

export const ShipmentStatus = {
  DRAFT: 'DRAFT',
  PACKING: 'PACKING',
  STAGED: 'STAGED',
  LOADING: 'LOADING',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION',
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

export const ShipmentPackageStatus = {
  OPEN: 'OPEN',
  PACKED: 'PACKED',
  STAGED: 'STAGED',
  LOADED: 'LOADED',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
} as const;
export type ShipmentPackageStatus =
  (typeof ShipmentPackageStatus)[keyof typeof ShipmentPackageStatus];

export const CarrierLabelStatus = {
  QUEUED: 'QUEUED',
  GENERATED: 'GENERATED',
  PRINTED: 'PRINTED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type CarrierLabelStatus = (typeof CarrierLabelStatus)[keyof typeof CarrierLabelStatus];

export interface PackingStationResponse {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  locationId: string | null;
  status: PackingStationStatus;
  metadata: unknown;
}

export interface ShipmentResponse {
  id: string;
  warehouseId: string;
  shipmentNumber: string;
  outboundOrderId: string | null;
  packingStationId: string | null;
  stagedLocationId: string | null;
  status: ShipmentStatus;
  carrier: string | null;
  serviceLevel: string | null;
  trackingReference: string | null;
  metadata: unknown;
  stagedAt: Date | null;
  loadedAt: Date | null;
  shippedAt: Date | null;
}

export interface ShipmentPackageResponse {
  id: string;
  warehouseId: string;
  shipmentId: string;
  outboundOrderId: string | null;
  packageCode: string;
  status: ShipmentPackageStatus;
  packageType: string;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  trackingNumber: string | null;
  metadata: unknown;
}

export interface CarrierLabelResponse {
  id: string;
  warehouseId: string;
  shipmentId: string | null;
  packageId: string | null;
  labelReference: string;
  status: CarrierLabelStatus;
  carrier: string | null;
  serviceLevel: string | null;
  trackingNumber: string | null;
  labelFormat: string;
  payload: unknown;
}
