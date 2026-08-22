import { ParcelStatus } from '../generated/prisma/client';

export interface ParcelLocationResponse {
  id: string;
  code: string;
  name: string;
  zone: string | null;
}

export interface ParcelResponse {
  id: string;
  warehouseId: string;
  trackingNumber: string;
  status: ParcelStatus;
  externalReference: string | null;
  customerReference: string | null;
  recipientName: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  weightGrams: number | null;
  metadata: unknown;
  currentLocation: ParcelLocationResponse | null;
  createdAt: Date;
  updatedAt: Date;
}
