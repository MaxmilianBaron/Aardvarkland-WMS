export const IdempotencyCheckStatus = {
  AVAILABLE: 'available',
  REPLAY: 'replay',
  CONFLICT: 'conflict',
} as const;

export type IdempotencyCheckStatus =
  (typeof IdempotencyCheckStatus)[keyof typeof IdempotencyCheckStatus];

export const IdempotencyRecordStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type IdempotencyRecordStatus =
  (typeof IdempotencyRecordStatus)[keyof typeof IdempotencyRecordStatus];

export interface IdempotencyRecordResponse {
  id: string;
  sourceSystem: string;
  externalId: string | null;
  idempotencyKey: string;
  requestHash: string;
  responseBody: unknown;
  resourceType: string | null;
  resourceId: string | null;
  status: IdempotencyRecordStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdempotencyCheckResponse {
  status: IdempotencyCheckStatus;
  record: IdempotencyRecordResponse | null;
  responseBody?: unknown;
}

export interface IdempotencyRequestInput {
  sourceSystem: string;
  externalId?: string | null;
  idempotencyKey: string;
  requestHash: string;
}

export interface StoreIdempotencyRecordInput extends IdempotencyRequestInput {
  responseBody?: unknown;
  resourceType?: string | null;
  resourceId?: string | null;
  status?: IdempotencyRecordStatus;
}
