export type ReliabilityStatus = 'ok' | 'degraded' | 'fail';
export type ReliabilitySeverity = 'info' | 'warning' | 'critical';

export interface ReliabilityCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail?: string;
  latencyMs?: number;
  [key: string]: unknown;
}

export interface OperationalIncident {
  key: string;
  severity: ReliabilitySeverity;
  title: string;
  detail: string;
  count?: number;
  action: string;
  detectedAt: string;
  state?: OperationalIncidentState;
}

export type OperationalIncidentLifecycleStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface OperationalIncidentState {
  incidentKey: string;
  status: OperationalIncidentLifecycleStatus;
  note: string | null;
  acknowledgedByUserId: string | null;
  acknowledgedByDisplayName: string | null;
  acknowledgedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByDisplayName: string | null;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface ConsistencyWarehouseSummary {
  warehouseId: string;
  warehouseCode: string;
  status: string;
  errorCount: number;
  warningCount: number;
}

export interface ConsistencySummary {
  checkedAt: string;
  status: ReliabilityStatus;
  warehousesChecked: number;
  errorCount: number;
  warningCount: number;
  warehouses: ConsistencyWarehouseSummary[];
}

export interface OperationalMetricsSnapshot {
  generatedAt: string;
  databaseLatencyMs: number;
  outbox: {
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
    oldestPendingAgeSeconds: number;
  };
  integrations: {
    openDeadLetters: number;
    retryingDeadLetters: number;
    circuitBreakersOpen: number;
  };
  printQueue: {
    pending: number;
    failed: number;
    expiredRuntimeLeases: number;
  };
  auth: {
    lockedLoginIdentities: number;
    activeRefreshSessions: number;
  };
  worker: {
    lastSeenAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
  };
}

export interface OperationalStatusResponse {
  status: ReliabilityStatus;
  generatedAt: string;
  metrics: OperationalMetricsSnapshot;
  consistency: ConsistencySummary | null;
  incidents: OperationalIncident[];
}

export interface RetentionCleanupItem {
  key: string;
  table: string;
  description: string;
  retentionDays: number;
  cutoff: string;
  eligibleCount: number;
  deletedCount: number;
  skipped?: boolean;
  skipReason?: string;
}

export interface RetentionCleanupResult {
  dryRun: boolean;
  enabled: boolean;
  startedAt: string;
  finishedAt: string;
  batchSize: number;
  totalEligible: number;
  totalDeleted: number;
  items: RetentionCleanupItem[];
}

export interface RetentionCleanupStatus {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  lastRun: RetentionCleanupResult | null;
  preview: RetentionCleanupResult;
}

export interface OperationalAlert {
  key: string;
  source: string;
  severity: ReliabilitySeverity;
  title: string;
  detail: string;
  action: string;
  count?: number;
  detectedAt: string;
}

export interface OperationalAlertSnapshot {
  status: ReliabilityStatus;
  generatedAt: string;
  alertCount: number;
  alerts: OperationalAlert[];
}

export interface OperationalAlertDelivery {
  alertKey: string;
  channel: string;
  severity: ReliabilitySeverity;
  title: string;
  lastStatus: 'sent' | 'skipped' | 'failed';
  lastSentAt: string | null;
  lastSeenAt: string;
  dedupeUntil: string | null;
  sentCount: number;
  error: string | null;
  updatedAt: string;
}

export interface OperationalAlertDeliveryResult {
  generatedAt: string;
  enabled: boolean;
  delivered: number;
  skipped: number;
  failed: number;
  results: OperationalAlertDelivery[];
}

export interface RecoveryStatusSnapshot {
  status: ReliabilityStatus;
  generatedAt: string;
  statusFile: {
    configured: boolean;
    path: string;
    exists: boolean;
    readable: boolean;
    schemaVersion: number | null;
    recordedAt: string | null;
  };
  backup: RecoveryStatusCheck;
  restoreDrill: RecoveryStatusCheck;
}

export interface RecoveryStatusCheck {
  status: 'ok' | 'warn';
  required: boolean;
  maxAgeSeconds: number;
  ageSeconds: number | null;
  lastSuccessfulAt: string | null;
  detail: string | null;
  artifact: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  targetDatabase: string | null;
  tableCount: number | null;
}
