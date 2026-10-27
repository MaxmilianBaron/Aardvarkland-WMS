export const WmsConfigurationRuleType = {
  PICKING_STRATEGY: 'PICKING_STRATEGY',
  PUTAWAY_STRATEGY: 'PUTAWAY_STRATEGY',
  REPLENISHMENT: 'REPLENISHMENT',
  CLIENT_BILLING: 'CLIENT_BILLING',
  WAREHOUSE_ZONE: 'WAREHOUSE_ZONE',
  USER_PERMISSION: 'USER_PERMISSION',
  CARRIER_ROUTING: 'CARRIER_ROUTING',
  SLA: 'SLA',
  RF_WORKFLOW: 'RF_WORKFLOW',
} as const;

export type WmsConfigurationRuleType =
  (typeof WmsConfigurationRuleType)[keyof typeof WmsConfigurationRuleType];

export const WmsConfigurationRuleStatus = {
  ACTIVE: 'ACTIVE',
  DRAFT: 'DRAFT',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type WmsConfigurationRuleStatus =
  (typeof WmsConfigurationRuleStatus)[keyof typeof WmsConfigurationRuleStatus];

export interface WmsConfigurationRuleResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  ruleType: WmsConfigurationRuleType;
  code: string;
  name: string;
  status: WmsConfigurationRuleStatus;
  priority: number;
  conditions: unknown;
  actions: unknown;
  metadata: unknown;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WmsConfigurationEffectiveResponse {
  warehouseId: string;
  ownerClientId: string | null;
  ruleType?: string;
  generatedAt: Date;
  rules: WmsConfigurationRuleResponse[];
  defaults: WmsConfigurationRuleTemplate[];
}

export interface WmsConfigurationRuleTemplate {
  ruleType: WmsConfigurationRuleType;
  code: string;
  name: string;
  priority: number;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  description: string;
}

export interface WmsConfigurationSimulationResponse {
  warehouseId: string;
  ruleType: WmsConfigurationRuleType;
  context: Record<string, unknown>;
  matchedRule: WmsConfigurationRuleResponse | null;
  matched: boolean;
  decision: unknown;
  evaluated: Array<{
    ruleId: string;
    code: string;
    name: string;
    priority: number;
    matched: boolean;
    reasons: string[];
  }>;
}
