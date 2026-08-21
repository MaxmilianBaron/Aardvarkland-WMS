export const ReplenishmentRuleStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type ReplenishmentRuleStatus =
  (typeof ReplenishmentRuleStatus)[keyof typeof ReplenishmentRuleStatus];

export const ReplenishmentStrategy = {
  MIN_MAX: 'MIN_MAX',
  DEMAND_BASED: 'DEMAND_BASED',
  EMERGENCY: 'EMERGENCY',
  PICK_FACE_TOPUP: 'PICK_FACE_TOPUP',
} as const;

export type ReplenishmentStrategy =
  (typeof ReplenishmentStrategy)[keyof typeof ReplenishmentStrategy];

export const ReplenishmentDemandStatus = {
  OPEN: 'OPEN',
  TASK_CREATED: 'TASK_CREATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReplenishmentDemandStatus =
  (typeof ReplenishmentDemandStatus)[keyof typeof ReplenishmentDemandStatus];

export interface ReplenishmentRuleResponse {
  id: string;
  warehouseId: string;
  code: string;
  status: ReplenishmentRuleStatus;
  strategy: ReplenishmentStrategy;
  skuId: string;
  pickLocationId: string;
  sourceZone: string | null;
  minQuantity: number;
  maxQuantity: number;
  targetQuantity: number;
  priority: number;
  metadata: unknown;
}

export interface ReplenishmentDemandResponse {
  id: string;
  warehouseId: string;
  ruleId: string;
  skuId: string;
  pickLocationId: string;
  sourceLocationId: string | null;
  stockQuantId: string | null;
  warehouseTaskId: string | null;
  status: ReplenishmentDemandStatus;
  requiredQuantity: number;
  availablePickQuantity: number;
  priority: number;
  metadata: unknown;
}

export interface ReplenishmentEvaluationResponse {
  rulesEvaluated: number;
  demandsCreated: number;
  tasksCreated: number;
  skippedRules: Array<{ ruleId: string; reason: string }>;
  demands: ReplenishmentDemandResponse[];
}

export interface ReplenishmentConfirmationResponse {
  demand: ReplenishmentDemandResponse;
  movedQuantity: number;
  movementId: string | null;
}
