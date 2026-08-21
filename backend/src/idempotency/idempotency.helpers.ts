import {
  IdempotencyCheckStatus,
  IdempotencyRecordStatus,
  IdempotencyRequestInput,
} from './idempotency.types';

export interface IdempotencyComparableRecord {
  requestHash: string;
  responseBody: unknown;
  status?: string | null;
}

export interface NormalizedIdempotencyKey {
  sourceSystem: string;
  externalId: string | null;
  idempotencyKey: string;
  requestHash: string;
}

export interface IdempotencyEvaluation {
  status: IdempotencyCheckStatus;
  responseBody?: unknown;
}

export function normalizeIdempotencyKey(input: IdempotencyRequestInput): NormalizedIdempotencyKey {
  const sourceSystem = normalizeRequired(input.sourceSystem, 'sourceSystem').toUpperCase();
  const idempotencyKey = normalizeRequired(input.idempotencyKey, 'idempotencyKey');
  const requestHash = normalizeRequired(input.requestHash, 'requestHash');
  const externalId = normalizeOptional(input.externalId);

  return {
    sourceSystem,
    externalId,
    idempotencyKey,
    requestHash,
  };
}

export function evaluateIdempotencyRecord(
  record: IdempotencyComparableRecord | null,
  requestHash: string,
): IdempotencyEvaluation {
  if (!record) {
    return { status: IdempotencyCheckStatus.AVAILABLE };
  }

  if (record.requestHash !== requestHash) {
    return { status: IdempotencyCheckStatus.CONFLICT };
  }

  if (record.status && record.status !== IdempotencyRecordStatus.COMPLETED) {
    return { status: IdempotencyCheckStatus.CONFLICT };
  }

  return {
    status: IdempotencyCheckStatus.REPLAY,
    responseBody: record.responseBody,
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
