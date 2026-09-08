export const QualityInspectionStatus = {
  OPEN: 'OPEN',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  QUARANTINED: 'QUARANTINED',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
} as const;
export type QualityInspectionStatus = (typeof QualityInspectionStatus)[keyof typeof QualityInspectionStatus];

export const QualityInspectionResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  HOLD: 'HOLD',
  QUARANTINE: 'QUARANTINE',
  RELEASE: 'RELEASE',
} as const;
export type QualityInspectionResult = (typeof QualityInspectionResult)[keyof typeof QualityInspectionResult];

export interface QualityInspectionResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string | null;
  lotId: string | null;
  stockQuantId: string | null;
  inspectionNumber: string;
  status: QualityInspectionStatus;
  result: QualityInspectionResult | null;
  sampleQuantity: number;
  checklist: unknown;
  reasonCode: string | null;
  notes: string | null;
  createdByUserId: string | null;
  completedByUserId: string | null;
  completedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface QualitySamplingRuleResponse {
  id: string;
  warehouseId: string;
  clientId: string | null;
  skuId: string | null;
  lotStatus: string | null;
  reasonCode: string | null;
  samplePercent: number;
  minSampleQuantity: number;
  maxSampleQuantity: number | null;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}
