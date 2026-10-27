export const ExceptionStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type ExceptionStatus = (typeof ExceptionStatus)[keyof typeof ExceptionStatus];

export const ExceptionSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type ExceptionSeverity = (typeof ExceptionSeverity)[keyof typeof ExceptionSeverity];

export interface ExceptionParcelResponse {
  id: string;
  trackingNumber: string;
}

export interface WmsExceptionLocationResponse {
  id: string;
  code: string;
  name: string;
  zone: string | null;
}

export interface ExceptionActorResponse {
  id: string;
  email: string;
  displayName: string;
}

export interface ExceptionResponse {
  id: string;
  warehouseId: string;
  parcelId: string;
  locationId: string | null;
  createdByUserId: string;
  code: string;
  title: string;
  description: string | null;
  status: ExceptionStatus;
  severity: ExceptionSeverity;
  metadata: unknown;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  parcel: ExceptionParcelResponse | null;
  location: WmsExceptionLocationResponse | null;
  createdBy: ExceptionActorResponse | null;
}
