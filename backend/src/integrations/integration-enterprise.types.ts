export const ExternalSystemStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ExternalSystemStatus = (typeof ExternalSystemStatus)[keyof typeof ExternalSystemStatus];

export const IntegrationDeadLetterStatus = {
  OPEN: 'OPEN',
  RETRYING: 'RETRYING',
  REPLAYED: 'REPLAYED',
  RESOLVED: 'RESOLVED',
  IGNORED: 'IGNORED',
} as const;
export type IntegrationDeadLetterStatus = (typeof IntegrationDeadLetterStatus)[keyof typeof IntegrationDeadLetterStatus];

export interface ExternalSystemResponse {
  id: string;
  code: string;
  name: string;
  systemType: string;
  status: ExternalSystemStatus;
  ownerClientId: string | null;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalIdMappingResponse {
  id: string;
  externalSystemId: string;
  warehouseId: string | null;
  ownerClientId: string | null;
  resourceType: string;
  resourceId: string;
  externalId: string;
  externalType: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationDeadLetterResponse {
  id: string;
  endpointId: string | null;
  outboxEventId: string | null;
  inboxEventId: string | null;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  status: IntegrationDeadLetterStatus;
  errorMessage: string;
  attempts: number;
  nextRetryAt: Date | null;
  payload: unknown;
  metadata: unknown;
  fingerprint: string;
  resolvedAt: Date | null;
  replayedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationDeadLetterDashboardBucket {
  key: string;
  count: number;
  openCount: number;
  totalAttempts: number;
  lastSeenAt: Date | null;
}

export interface IntegrationDeadLetterDashboardResponse {
  generatedAt: Date;
  totalCount: number;
  openCount: number;
  retryingCount: number;
  resolvedCount: number;
  ignoredCount: number;
  byStatus: IntegrationDeadLetterDashboardBucket[];
  byEventType: IntegrationDeadLetterDashboardBucket[];
  topFingerprints: IntegrationDeadLetterDashboardBucket[];
}

export interface IntegrationOperationsSummaryResponse {
  generatedAt: Date;
  endpoints: {
    total: number;
    active: number;
    error: number;
    inactive: number;
  };
  externalSystems: {
    total: number;
    active: number;
  };
  outbox: Array<{ status: string; count: number; totalAttempts: number }>;
  deadLetters: {
    open: number;
    retrying: number;
    resolved: number;
    ignored: number;
  };
  dispatch: {
    last24h: number;
    failures24h: number;
    successRate24h: number;
  };
  recommendedActions: string[];
}

export interface IntegrationReplayResponse {
  deadLetterId: string;
  status: IntegrationDeadLetterStatus;
  outboxEventId: string | null;
  replayCreated: boolean;
  replayedAt: Date;
}

export interface IntegrationReconciliationResourceBucket {
  resourceType: string;
  mappedCount: number;
  orphanMappingCount: number;
  missingMappingCount: number;
}

export interface IntegrationReconciliationResponse {
  generatedAt: Date;
  externalSystemId: string | null;
  externalSystemCode: string | null;
  warehouseId: string | null;
  ownerClientId: string | null;
  resources: IntegrationReconciliationResourceBucket[];
  openDeadLetters: number;
  pendingOutboxEvents: number;
  auditLogId: string | null;
}
