export const CarrierAdapterCapability = {
  LABEL: 'LABEL',
  VOID_LABEL: 'VOID_LABEL',
  MANIFEST: 'MANIFEST',
  TRACKING: 'TRACKING',
} as const;

export type CarrierAdapterCapability =
  (typeof CarrierAdapterCapability)[keyof typeof CarrierAdapterCapability];

export const CarrierTrackingStatus = {
  ACCEPTED: 'ACCEPTED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type CarrierTrackingStatus =
  (typeof CarrierTrackingStatus)[keyof typeof CarrierTrackingStatus];


export const CarrierCredentialStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ROTATED: 'ROTATED',
  REVOKED: 'REVOKED',
} as const;

export type CarrierCredentialStatus =
  (typeof CarrierCredentialStatus)[keyof typeof CarrierCredentialStatus];

export interface CarrierCredentialResponse {
  id: string;
  warehouseId: string;
  carrier: string;
  environment: string;
  status: CarrierCredentialStatus;
  accountNumber: string | null;
  secretFingerprint: string | null;
  secretLast4: string | null;
  keyVersion: string;
  lastRotatedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CarrierServiceProfile {
  carrier: string;
  displayName: string;
  requiresLabel: boolean;
  supportsManifest: boolean;
  supportsVoid: boolean;
  capabilities: CarrierAdapterCapability[];
}

export interface CarrierPackageDimensions {
  weightGrams?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

export interface CarrierLabelRequest {
  warehouseId: string;
  shipmentId: string;
  shipmentNumber: string;
  packageId?: string | null;
  packageCode?: string | null;
  carrier: string;
  serviceLevel?: string | null;
  dimensions?: CarrierPackageDimensions | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CarrierLabelResult {
  carrier: string;
  serviceLevel: string | null;
  labelReference: string;
  trackingNumber: string;
  labelFormat: 'ZPL' | 'PDF';
  labelData: string;
  idempotencyKey: string;
  testMode: boolean;
  adapterCode?: string;
  externalShipmentId?: string | null;
  rawResponse?: Record<string, unknown> | null;
}

export interface CarrierManifestResult {
  carrier: string;
  manifestReference: string;
  shipmentCount: number;
  packageCount: number;
  closedAt: string;
  testMode: boolean;
}

export interface CreateCarrierLabelResponse {
  duplicate: boolean;
  label: {
    id: string;
    labelReference: string;
    status: string;
    carrier: string | null;
    serviceLevel: string | null;
    trackingNumber: string | null;
    labelFormat: string;
    shipmentId: string | null;
    packageId: string | null;
    payload: unknown;
  };
  adapter: CarrierLabelResult;
}

export interface VoidCarrierLabelResponse {
  labelReference: string;
  carrier: string;
  status: string;
  voided: boolean;
}

export interface CloseCarrierManifestResponse {
  manifest: CarrierManifestResult;
}

export interface CarrierTrackingEventResponse {
  id: string;
  warehouseId: string;
  carrier: string;
  labelReference: string | null;
  trackingNumber: string | null;
  shipmentId: string | null;
  packageId: string | null;
  externalEventId: string | null;
  status: CarrierTrackingStatus;
  eventCode: string | null;
  message: string | null;
  payload: unknown;
  occurredAt: Date;
  createdAt: Date;
}

export interface CarrierTrackingWebhookResponse {
  duplicate: boolean;
  event: CarrierTrackingEventResponse;
}

export interface CarrierTrackingSyncResponse {
  carrier: string;
  scannedLabels: number;
  createdEvents: number;
  skippedDuplicates: number;
  events: CarrierTrackingEventResponse[];
}
