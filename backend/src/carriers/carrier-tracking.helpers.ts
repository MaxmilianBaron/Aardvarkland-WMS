import { createHash } from 'node:crypto';

import { CarrierTrackingStatus } from './carriers.types';

const STATUS_ALIASES: Record<string, CarrierTrackingStatus> = {
  ACCEPTED: CarrierTrackingStatus.ACCEPTED,
  CREATED: CarrierTrackingStatus.ACCEPTED,
  LABEL_CREATED: CarrierTrackingStatus.ACCEPTED,
  IN_TRANSIT: CarrierTrackingStatus.IN_TRANSIT,
  TRANSIT: CarrierTrackingStatus.IN_TRANSIT,
  MOVING: CarrierTrackingStatus.IN_TRANSIT,
  OUT_FOR_DELIVERY: CarrierTrackingStatus.OUT_FOR_DELIVERY,
  OFD: CarrierTrackingStatus.OUT_FOR_DELIVERY,
  DELIVERED: CarrierTrackingStatus.DELIVERED,
  COMPLETED: CarrierTrackingStatus.DELIVERED,
  EXCEPTION: CarrierTrackingStatus.EXCEPTION,
  FAILED: CarrierTrackingStatus.EXCEPTION,
  CANCELLED: CarrierTrackingStatus.CANCELLED,
  CANCELED: CarrierTrackingStatus.CANCELLED,
};

export function normalizeCarrierTrackingStatus(value: string | null | undefined): CarrierTrackingStatus {
  const normalized = normalizeToken(value ?? 'UNKNOWN');

  return STATUS_ALIASES[normalized] ?? CarrierTrackingStatus.UNKNOWN;
}

export function createCarrierTrackingExternalId(input: {
  carrier: string;
  labelReference?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  eventCode?: string | null;
  occurredAt?: string | Date | null;
  message?: string | null;
}): string {
  const parts = [
    input.carrier,
    input.labelReference ?? '',
    input.trackingNumber ?? '',
    normalizeCarrierTrackingStatus(input.status),
    input.eventCode ?? '',
    input.occurredAt instanceof Date ? input.occurredAt.toISOString() : input.occurredAt ?? '',
    input.message ?? '',
  ];

  return `carrier-track-${shortHash(parts.join('|'))}`;
}

export function buildCarrierTrackingPayload(input: { metadata?: Record<string, unknown> | null; rawPayload?: Record<string, unknown> | null; source: string }): Record<string, unknown> {
  return { source: input.source, metadata: input.metadata ?? null, rawPayload: input.rawPayload ?? null };
}

export function mergeLatestTrackingPayload(payload: unknown, latestTracking: Record<string, unknown>): Record<string, unknown> {
  return { ...toRecord(payload), latestTracking };
}

function normalizeToken(value: string): string {
  return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20).toUpperCase();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
