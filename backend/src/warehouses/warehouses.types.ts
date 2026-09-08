import { WarehouseLocationType, WarehouseStatus } from '../generated/prisma/client';

export const WarehouseLocationBinStatus = {
  AVAILABLE: 'AVAILABLE',
  HOLD: 'HOLD',
  RESERVED: 'RESERVED',
  BLOCKED: 'BLOCKED',
  FULL: 'FULL',
  DAMAGED: 'DAMAGED',
  MAINTENANCE: 'MAINTENANCE',
  CLOSED: 'CLOSED',
} as const;

export type WarehouseLocationBinStatus = (typeof WarehouseLocationBinStatus)[keyof typeof WarehouseLocationBinStatus];

export interface WarehouseResponse {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: WarehouseStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseLocationCapacityResponse {
  weightGrams: number | null;
  volumeCm3: number | null;
  units: number | null;
  handlingUnits: number | null;
  pallets: number | null;
  reservedUnits: number;
  reservedVolumeCm3: number;
  reservedWeightGrams: number;
}

export interface WarehouseLocationResponse {
  id: string;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  type: WarehouseLocationType;
  barcode: string | null;
  zone: string | null;
  aisle: string | null;
  bay: string | null;
  level: string | null;
  bin: string | null;
  pickSequence: number;
  binStatus: WarehouseLocationBinStatus;
  binType: string | null;
  capacity: WarehouseLocationCapacityResponse;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
