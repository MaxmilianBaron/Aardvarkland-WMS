import { AppendOutboxEventInput, OutboxDeliveryStatus, OutboxEventResponse } from './outbox.types';

export interface OutboxDeliveryRecord {
  status?: string | null;
  sentAt?: Date | string | null;
}

export interface NormalizedOutboxEventInput {
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  payload: unknown;
  headers: Record<string, unknown> | null;
}

export function normalizeOutboxEventInput(
  input: AppendOutboxEventInput,
): NormalizedOutboxEventInput {
  return {
    eventType: normalizeRequired(input.eventType, 'eventType'),
    aggregateType: normalizeOptional(input.aggregateType),
    aggregateId: normalizeOptional(input.aggregateId),
    payload: input.payload ?? {},
    headers: input.headers ?? null,
  };
}

export function getOutboxDeliveryStatus(record: OutboxDeliveryRecord): OutboxDeliveryStatus {
  if (record.sentAt || record.status === OutboxDeliveryStatus.SENT) {
    return OutboxDeliveryStatus.SENT;
  }

  if (record.status === OutboxDeliveryStatus.PROCESSING) {
    return OutboxDeliveryStatus.PROCESSING;
  }

  if (record.status === OutboxDeliveryStatus.DEAD_LETTER) {
    return OutboxDeliveryStatus.DEAD_LETTER;
  }

  if (record.status === OutboxDeliveryStatus.FAILED) {
    return OutboxDeliveryStatus.FAILED;
  }

  return OutboxDeliveryStatus.PENDING;
}

export function canMarkOutboxSent(record: OutboxDeliveryRecord): boolean {
  const status = getOutboxDeliveryStatus(record);

  return status === OutboxDeliveryStatus.PENDING || status === OutboxDeliveryStatus.PROCESSING;
}

export function sortPendingOutboxEvents<T extends Pick<OutboxEventResponse, 'createdAt' | 'id'>>(
  events: T[],
): T[] {
  return [...events].sort((left, right) => {
    const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();

    return timeDiff === 0 ? left.id.localeCompare(right.id) : timeDiff;
  });
}

export interface RetryDecisionInput {
  attempts: number;
  maxAttempts: number;
  retryDelaySeconds: number;
  now?: Date;
}

export interface RetryDecision {
  status: OutboxDeliveryStatus;
  attempts: number;
  availableAt: Date | null;
  exhausted: boolean;
}

export function getNextRetryDecision(input: RetryDecisionInput): RetryDecision {
  const attempts = input.attempts + 1;
  const exhausted = attempts >= input.maxAttempts;

  if (exhausted) {
    return {
      status: OutboxDeliveryStatus.DEAD_LETTER,
      attempts,
      availableAt: null,
      exhausted,
    };
  }

  const now = input.now ?? new Date();

  return {
    status: OutboxDeliveryStatus.PENDING,
    attempts,
    availableAt: new Date(now.getTime() + input.retryDelaySeconds * 1000),
    exhausted,
  };
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}
