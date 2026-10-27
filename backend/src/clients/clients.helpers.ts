import { createHash } from 'node:crypto';

import {
  BillingCounterInput,
  BillingEventInput,
  BillingEventStatus,
  BillingEventType,
  BillingSummaryResponse,
} from './clients.types';

const KNOWN_BILLING_TYPES = new Set<string>(Object.values(BillingEventType));
const KNOWN_BILLING_STATUSES = new Set<string>(Object.values(BillingEventStatus));

export function normalizeClientCode(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function normalizeCurrency(value: string | null | undefined, fallback = 'EUR'): string {
  const normalized = (value ?? fallback).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

export function normalizeBillingEventType(value: string | null | undefined): BillingEventType | string {
  const normalized = (value ?? BillingEventType.MANUAL).trim().replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  return KNOWN_BILLING_TYPES.has(normalized) ? normalized : BillingEventType.MANUAL;
}

export function normalizeBillingStatus(value: string | null | undefined): BillingEventStatus | string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  return KNOWN_BILLING_STATUSES.has(normalized) ? normalized : undefined;
}

export function calculateBillingAmountMinor(input: {
  quantity?: number | null;
  unitPriceMinor?: number | null;
  amountMinor?: number | null;
}): number {
  if (Number.isFinite(input.amountMinor) && input.amountMinor !== null && input.amountMinor !== undefined) {
    return Math.max(0, Math.trunc(input.amountMinor));
  }

  const quantity = Math.max(0, Math.trunc(input.quantity ?? 1));
  const unitPriceMinor = Math.max(0, Math.trunc(input.unitPriceMinor ?? 0));
  return quantity * unitPriceMinor;
}

export function normalizeBillingEventInput(
  clientCode: string,
  warehouseId: string,
  currency: string,
  input: BillingEventInput,
): Required<Omit<BillingEventInput, 'metadata'>> & { metadata: Record<string, unknown> | null } {
  const eventType = normalizeBillingEventType(input.eventType);
  const quantity = Math.max(0, Math.trunc(input.quantity ?? 1));
  const unitPriceMinor = Math.max(0, Math.trunc(input.unitPriceMinor ?? 0));
  const amountMinor = calculateBillingAmountMinor({ quantity, unitPriceMinor, amountMinor: input.amountMinor });
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  return {
    eventType,
    quantity,
    unitPriceMinor,
    amountMinor,
    currency: normalizeCurrency(input.currency, currency),
    reference: normalizeBillingReference(
      input.reference ?? makeBillingReference({ clientCode, warehouseId, eventType, resourceType: input.resourceType, resourceId: input.resourceId, occurredAt }),
    ),
    resourceType: normalizeOptionalResourceCode(input.resourceType),
    resourceId: input.resourceId?.trim() || null,
    description: input.description?.trim() || null,
    occurredAt,
    metadata: input.metadata ?? null,
  };
}

export function buildBillingEventsFromCounters(input: {
  clientCode: string;
  warehouseId: string;
  currency: string;
  occurredAt?: string | Date | null;
  counters: BillingCounterInput[];
}): Array<Required<Omit<BillingEventInput, 'metadata'>> & { metadata: Record<string, unknown> | null }> {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  return input.counters
    .filter((counter) => Math.trunc(counter.quantity) > 0)
    .map((counter) => {
      const eventType = normalizeBillingEventType(counter.eventType);
      const resourceType = normalizeOptionalResourceCode(counter.resourceType);
      const resourceId = counter.resourceId?.trim() || null;
      return normalizeBillingEventInput(input.clientCode, input.warehouseId, input.currency, {
        eventType,
        quantity: counter.quantity,
        unitPriceMinor: counter.unitPriceMinor,
        currency: input.currency,
        reference: makeBillingReference({
          clientCode: input.clientCode,
          warehouseId: input.warehouseId,
          eventType,
          resourceType,
          resourceId: counter.referenceSuffix ?? resourceId,
          occurredAt,
        }),
        resourceType,
        resourceId,
        description: counter.description ?? null,
        occurredAt,
        metadata: counter.metadata ?? null,
      });
    });
}

export function makeBillingReference(input: {
  clientCode: string;
  warehouseId: string;
  eventType: string;
  resourceType?: string | null;
  resourceId?: string | null;
  occurredAt?: Date | string | null;
}): string {
  const day = (input.occurredAt ? new Date(input.occurredAt) : new Date()).toISOString().slice(0, 10).replace(/-/g, '');
  const seed = [input.clientCode, input.warehouseId, input.eventType, input.resourceType ?? 'RESOURCE', input.resourceId ?? 'AUTO', day].join(':');
  return `BILL-${normalizeClientCode(input.clientCode)}-${day}-${shortHash(seed)}`;
}

export function normalizeBillingReference(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 120).toUpperCase();
}

export function summarizeBillingEvents(input: {
  clientId: string;
  warehouseId: string;
  currency: string;
  events: Array<{ eventType: string; status: string; amountMinor: number }>;
}): BillingSummaryResponse {
  const byType = new Map<string, { eventType: string; count: number; amountMinor: number }>();
  let billableAmountMinor = 0;
  let pendingAmountMinor = 0;
  let invoicedAmountMinor = 0;
  let billableEvents = 0;
  let pendingEvents = 0;
  let invoicedEvents = 0;
  let voidedEvents = 0;

  for (const event of input.events) {
    const aggregate = byType.get(event.eventType) ?? { eventType: event.eventType, count: 0, amountMinor: 0 };
    aggregate.count += 1;
    aggregate.amountMinor += event.status === BillingEventStatus.VOIDED ? 0 : event.amountMinor;
    byType.set(event.eventType, aggregate);

    if (event.status === BillingEventStatus.BILLABLE) {
      billableEvents += 1;
      billableAmountMinor += event.amountMinor;
    } else if (event.status === BillingEventStatus.PENDING) {
      pendingEvents += 1;
      pendingAmountMinor += event.amountMinor;
    } else if (event.status === BillingEventStatus.INVOICED) {
      invoicedEvents += 1;
      invoicedAmountMinor += event.amountMinor;
    } else if (event.status === BillingEventStatus.VOIDED) {
      voidedEvents += 1;
    }
  }

  return {
    clientId: input.clientId,
    warehouseId: input.warehouseId,
    currency: input.currency,
    totalEvents: input.events.length,
    billableEvents,
    pendingEvents,
    invoicedEvents,
    voidedEvents,
    billableAmountMinor,
    pendingAmountMinor,
    invoicedAmountMinor,
    byType: Array.from(byType.values()).sort((a, b) => a.eventType.localeCompare(b.eventType)),
  };
}

export function normalizeOptionalResourceCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();
}
