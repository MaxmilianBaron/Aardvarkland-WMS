export const CycleCountPlanStatus = {
  DRAFT: 'DRAFT',
  RELEASED: 'RELEASED',
  COUNTING: 'COUNTING',
  RECONCILING: 'RECONCILING',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
} as const;

export type CycleCountPlanStatus = (typeof CycleCountPlanStatus)[keyof typeof CycleCountPlanStatus];

export const CycleCountTaskStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type CycleCountTaskStatus = (typeof CycleCountTaskStatus)[keyof typeof CycleCountTaskStatus];

export const CycleCountScopeType = {
  LOCATION: 'LOCATION',
  SKU: 'SKU',
  ZONE: 'ZONE',
  ALL: 'ALL',
} as const;

export type CycleCountScopeType = (typeof CycleCountScopeType)[keyof typeof CycleCountScopeType];

export interface CycleCountPlanResponse {
  id: string;
  warehouseId: string;
  code: string;
  status: CycleCountPlanStatus;
  scopeType: string;
  scopeReference: string | null;
  metadata: unknown;
  releasedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CycleCountTaskResponse {
  id: string;
  planId: string;
  warehouseTaskId: string | null;
  locationId: string;
  skuId: string | null;
  stockQuantId: string | null;
  expectedQuantity: number | null;
  countedQuantity: number | null;
  varianceQuantity: number | null;
  status: CycleCountTaskStatus;
  metadata: unknown;
  submittedAt: Date | null;
  approvedAt: Date | null;
}

export interface CycleCountReleaseResponse {
  plan: CycleCountPlanResponse;
  tasksCreated: number;
  freezesCreated: number;
}

export interface CycleCountApprovalResponse {
  task: CycleCountTaskResponse;
  adjustmentCreated: boolean;
  planCompleted: boolean;
}
