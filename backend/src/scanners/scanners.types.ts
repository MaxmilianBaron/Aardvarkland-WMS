export enum ScannerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

export interface ScannerResponse {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  status: string;
  assignedZone: string | null;
  lastSeenAt: Date | null;
  lastActivityAt: Date | null;
  batteryLevel: number | null;
  signalStrength: number | null;
  assignedWorkerId: string | null;
  deviceMode: string | null;
  appVersion: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScannerScanParcelMatch {
  id: string;
  trackingNumber: string;
  status: string;
}

export interface ScannerScanResponse {
  scanner: ScannerResponse;
  scan: {
    value: string;
    symbology: string | null;
    operation: string | null;
    scannedAt: Date;
  };
  result: 'MATCHED' | 'UNMATCHED';
  match: {
    type: 'PARCEL';
    parcel: ScannerScanParcelMatch;
  } | null;
  trackingEventCreated: boolean;
}
