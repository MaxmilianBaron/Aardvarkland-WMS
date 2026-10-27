export enum SlottingRuleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum SlottingRecommendationStatus {
  OPEN = 'OPEN',
  APPLIED = 'APPLIED',
  DISMISSED = 'DISMISSED',
  EXPIRED = 'EXPIRED',
}

export enum SlottingRecommendationReason {
  HIGH_VELOCITY_TO_PICK_FACE = 'HIGH_VELOCITY_TO_PICK_FACE',
  LOW_VELOCITY_TO_RESERVE = 'LOW_VELOCITY_TO_RESERVE',
  PICK_FACE_BELOW_MIN = 'PICK_FACE_BELOW_MIN',
}

export enum SkuVelocityClass {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export interface SlottingRuleResponse {
  id: string;
  warehouseId: string;
  code: string;
  status: string;
  zone: string | null;
  minVelocityScore: number | null;
  maxVelocityScore: number | null;
  targetLocationType: string | null;
  maxPickSequence: number | null;
  minPickFaceQuantity: number | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SkuVelocityResponse {
  id: string;
  warehouseId: string;
  skuId: string | null;
  skuCode: string;
  picksLast30Days: number;
  unitsPickedLast30Days: number;
  replenishmentsLast30Days: number;
  velocityScore: number;
  abcClass: string | null;
  metadata: unknown;
  lastCalculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlottingRecommendationResponse {
  id: string;
  warehouseId: string;
  skuId: string | null;
  skuCode: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  status: string;
  reason: string;
  priority: number;
  velocityScore: number;
  expectedTravelSavings: number | null;
  message: string | null;
  metadata: unknown;
  appliedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlottingEvaluationResponse {
  warehouseId: string;
  generatedAt: string;
  dryRun: boolean;
  recommendationsCreated: number;
  recommendationsSkipped: number;
  recommendations: SlottingRecommendationResponse[];
  summary: {
    candidateSkus: number;
    highVelocitySkus: number;
    lowVelocitySkus: number;
    targetPickFaces: number;
    reserveLocations: number;
  };
}
