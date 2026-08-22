export const OutboxDeliveryStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  DEAD_LETTER: 'DEAD_LETTER',
} as const;

export type OutboxDeliveryStatus = (typeof OutboxDeliveryStatus)[keyof typeof OutboxDeliveryStatus];

export const InboxEventStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  DUPLICATE: 'DUPLICATE',
  IGNORED: 'IGNORED',
} as const;

export type InboxEventStatus = (typeof InboxEventStatus)[keyof typeof InboxEventStatus];

export interface AppendOutboxEventInput {
  eventType: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  payload?: unknown;
  headers?: Record<string, unknown> | null;
}

export interface ListPendingOutboxEventsInput {
  eventType?: string;
  take?: number;
  skip?: number;
}

export type ListDeadLetterOutboxEventsInput = ListPendingOutboxEventsInput;

export interface RequeueDeadLetterOutboxEventInput {
  reason: string;
  availableInSeconds?: number;
  resetAttempts?: boolean;
}

export interface DispatchOutboxEventsInput extends ListPendingOutboxEventsInput {
  maxAttempts?: number;
  retryDelaySeconds?: number;
  dryRun?: boolean;
}

export interface ReceiveInboxEventInput {
  sourceSystem: string;
  externalEventId: string;
  eventType: string;
  payload?: unknown;
  headers?: Record<string, unknown> | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

export interface ListInboxEventsInput {
  sourceSystem?: string;
  eventType?: string;
  status?: string;
  take?: number;
  skip?: number;
}

export interface MarkInboxEventProcessedInput {
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MarkInboxEventFailedInput {
  errorMessage: string;
  metadata?: Record<string, unknown> | null;
}

export interface OutboxEventResponse {
  id: string;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  payload: unknown;
  headers: Record<string, unknown> | null;
  deliveryStatus: OutboxDeliveryStatus;
  attempts: number | null;
  lastError: string | null;
  nextAvailableAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboxEventResponse {
  id: string;
  sourceSystem: string;
  externalEventId: string;
  eventType: string;
  status: InboxEventStatus;
  payload: unknown;
  headers: Record<string, unknown> | null;
  resourceType: string | null;
  resourceId: string | null;
  attempts: number;
  lastError: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  duplicate: boolean;
}

export interface OutboxDispatchResponse {
  claimed: number;
  dispatched: number;
  failed: number;
  skipped: number;
  retried: number;
  dryRun: boolean;
  events: Array<{
    id: string;
    eventType: string;
    status: OutboxDeliveryStatus;
    attempts?: number | null;
    nextAvailableAt?: Date | null;
  }>;
}
