export const RuntimeRuleType = {
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

export type RuntimeRuleType = (typeof RuntimeRuleType)[keyof typeof RuntimeRuleType];

export const RuntimeIntegrationState = {
  READY: 'READY',
  WAITING: 'WAITING',
  RETRYING: 'RETRYING',
  DEAD_LETTER: 'DEAD_LETTER',
  APPLIED: 'APPLIED',
} as const;

export type RuntimeIntegrationState =
  (typeof RuntimeIntegrationState)[keyof typeof RuntimeIntegrationState];

export const RuntimeRfResult = {
  ACCEPTED: 'ACCEPTED',
  MISMATCH: 'MISMATCH',
  DUPLICATE: 'DUPLICATE',
  REJECTED: 'REJECTED',
} as const;

export type RuntimeRfResult = (typeof RuntimeRfResult)[keyof typeof RuntimeRfResult];

export interface RuntimeRfSession {
  id: string;
  warehouseId: string;
  deviceCode: string;
  workerCode: string;
  flow: string;
  state: string;
  currentStep: string;
  queuedOfflineActions: number;
  lastError: string | null;
  startedAt: string;
  lastSeenAt: string;
}

export interface RuntimeRfScanEvent {
  id: string;
  sessionId: string | null;
  deviceCode: string;
  taskReference: string | null;
  stepKey: string;
  scannedValue: string;
  expectedValue: string | null;
  result: RuntimeRfResult;
  offlineId: string | null;
  quantity: number | null;
  createdAt: string;
}

export interface RuntimeRfException {
  id: string;
  sessionId: string | null;
  deviceCode: string;
  taskReference: string | null;
  code: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
}

export interface RuntimeRfConsole {
  warehouseId: string;
  profile: {
    scannerFocusLock: boolean;
    offlineQueue: boolean;
    fallbackMode: boolean;
    supervisorUnlock: boolean;
    recommendedDevice: string;
  };
  activeSessions: RuntimeRfSession[];
  recentScans: RuntimeRfScanEvent[];
  exceptionQueue: RuntimeRfException[];
  nextInstruction: {
    stepKey: string;
    label: string;
    expectedExample: string;
    helpText: string;
  };
  offlineQueue: {
    queued: number;
    replayable: number;
    duplicateProtected: boolean;
    policy: string;
  };
}

export interface RuntimeConnector {
  code: string;
  title: string;
  category: 'ERP' | 'ECOMMERCE' | 'CARRIER' | 'PRINT' | 'EDI' | 'WEBHOOK';
  mode: 'DRY_RUN' | 'SANDBOX' | 'LIVE';
  health: 'CONNECTED' | 'DEGRADED' | 'MISSING_CREDENTIALS';
  openEvents: number;
  deadLetters: number;
  lastSyncAt: string | null;
  requiredSecrets: string[];
  capabilities: string[];
}

export interface RuntimeIntegrationEvent {
  id: string;
  connectorCode: string;
  flow: string;
  state: RuntimeIntegrationState;
  externalId: string;
  attempts: number;
  maxAttempts: number;
  retryAfter: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface RuntimeIntegrationCommandCenter {
  warehouseId: string;
  connectors: RuntimeConnector[];
  events: RuntimeIntegrationEvent[];
  deadLetterCount: number;
  retryableCount: number;
  reconciliation: {
    lastRunAt: string | null;
    status: string;
    mismatches: number;
    nextRunHint: string;
  };
  productionChecklist: Array<{ code: string; label: string; status: 'ok' | 'watch' | 'missing' }>;
}

export interface RuntimeOperationRule {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: RuntimeRuleType;
  enabled: boolean;
  priority: number;
  scope: Record<string, unknown>;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  notes: string | null;
  updatedAt: string;
}

export interface RuntimeRuleEvaluation {
  warehouseId: string;
  evaluatedAt: string;
  context: Record<string, unknown>;
  matchedRules: RuntimeOperationRule[];
  recommendedActions: Array<{ ruleCode: string; action: Record<string, unknown> }>;
}
