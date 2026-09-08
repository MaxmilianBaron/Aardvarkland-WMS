export const TrackingEventType = {
  CREATED: 'CREATED',
  RECEIVED: 'RECEIVED',
  STORED: 'STORED',
  MOVED: 'MOVED',
  PICKED: 'PICKED',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  SCANNED: 'SCANNED',
  EXCEPTION_RAISED: 'EXCEPTION_RAISED',
  EXCEPTION_RESOLVED: 'EXCEPTION_RESOLVED',
  CANCELLED: 'CANCELLED',
} as const;

export type TrackingEventType = (typeof TrackingEventType)[keyof typeof TrackingEventType];

export interface TrackingEventParcelResponse {
  id: string;
  trackingNumber: string;
}

export interface TrackingLocationResponse {
  id: string;
  code: string;
  name: string;
  zone: string | null;
}

export interface TrackingActorResponse {
  id: string;
  email: string;
  displayName: string;
}

export interface TrackingEventResponse {
  id: string;
  warehouseId: string;
  parcelId: string;
  locationId: string | null;
  actorUserId: string | null;
  type: TrackingEventType;
  message: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
  parcel: TrackingEventParcelResponse | null;
  location: TrackingLocationResponse | null;
  actor: TrackingActorResponse | null;
}
