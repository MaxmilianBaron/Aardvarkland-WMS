import { createHash } from 'node:crypto';

import { BillingCreditNoteStatus, BillingEventStatus, BillingInvoiceStatus } from './clients.types';

export { BillingCreditNoteStatus, BillingInvoiceStatus };

export interface BillingInvoiceEventInput {
  id: string;
  eventType: string;
  reference: string;
  description?: string | null;
  quantity: number;
  amountMinor: number;
  vatRateBps?: number | null;
  currency: string;
  occurredAt: Date | string;
}

export interface BillingCreditNoteSourceLine {
  id: string;
  lineNumber: number;
  eventType: string;
  description: string;
  quantity: number;
  amountMinor: number;
  vatRateBps?: number | null;
  netAmountMinor?: number | null;
  taxAmountMinor?: number | null;
  grossAmountMinor?: number | null;
  currency: string;
  metadata?: unknown;
}

export interface BillingCreditNoteLineDraft {
  invoiceLineId: string;
  lineNumber: number;
  eventType: string;
  description: string;
  quantity: number;
  amountMinor: number;
  vatRateBps: number | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  currency: string;
  metadata: Record<string, unknown>;
}

export interface BillingInvoiceLineDraft {
  lineNumber: number;
  billingEventId: string;
  eventType: string;
  description: string;
  quantity: number;
  amountMinor: number;
  vatRateBps: number | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  currency: string;
  metadata: Record<string, unknown>;
}

export interface TaxCalculationResult {
  vatRateBps: number | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
}

export interface ClientRateCandidate {
  eventType: string;
  unit: string;
  unitPriceMinor: number;
  minChargeMinor?: number | null;
  vatRateBps?: number | null;
}

export interface InvoiceNumberSequenceState {
  prefix: string;
  year: number;
  nextNumber: number;
}

export interface StorageBillingStockSnapshot {
  stockQuantId: string;
  skuCode: string;
  quantity: number;
  ownedFrom: Date | string;
  ownedTo?: Date | string | null;
  locationCode?: string | null;
}

export interface StorageBillingEventDraft {
  eventType: 'STORAGE_DAY';
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  vatRateBps: number | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  currency: string;
  reference: string;
  resourceType: 'STOCK_QUANT';
  resourceId: string;
  description: string;
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

export function normalizeBillingPeriod(input: {
  periodStart: Date | string;
  periodEnd: Date | string;
}): { periodStart: Date; periodEnd: Date; days: number } {
  const periodStart = startOfUtcDay(new Date(input.periodStart));
  const periodEnd = startOfUtcDay(new Date(input.periodEnd));
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw new Error('Billing period dates must be valid dates.');
  }
  if (periodEnd <= periodStart) {
    throw new Error('Billing period end must be after period start.');
  }
  const days = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY);
  return { periodStart, periodEnd, days };
}

export function makeInvoiceNumber(input: {
  clientCode: string;
  warehouseCode: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  sequence?: number;
}): string {
  const period = normalizeBillingPeriod({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  const start = yyyymmdd(period.periodStart);
  const end = yyyymmdd(addDays(period.periodEnd, -1));
  const seed = [input.clientCode, input.warehouseCode, start, end, input.sequence ?? 1].join(':');
  return `INV-${normalizeInvoiceToken(input.clientCode)}-${start}-${end}-${shortHash(seed)}`;
}

export function buildInvoiceLines(events: BillingInvoiceEventInput[]): BillingInvoiceLineDraft[] {
  return events
    .slice()
    .sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() ||
        a.reference.localeCompare(b.reference),
    )
    .map((event, index) => ({
      lineNumber: index + 1,
      billingEventId: event.id,
      eventType: event.eventType,
      description: event.description?.trim() || `${event.eventType} ${event.reference}`,
      quantity: Math.max(0, Math.trunc(event.quantity)),
      amountMinor: Math.max(0, Math.trunc(event.amountMinor)),
      ...calculateTaxAmounts(Math.max(0, Math.trunc(event.amountMinor)), event.vatRateBps),
      currency: event.currency,
      metadata: {
        billingEventReference: event.reference,
        occurredAt: new Date(event.occurredAt).toISOString(),
      },
    }));
}

export function summarizeInvoiceLines(
  lines: Array<{
    amountMinor: number;
    currency: string;
    netAmountMinor?: number;
    taxAmountMinor?: number;
    grossAmountMinor?: number;
  }>,
): {
  subtotalMinor: number;
  taxTotalMinor: number;
  totalAmountMinor: number;
  currency: string;
  lineCount: number;
} {
  const currency = lines[0]?.currency ?? 'EUR';
  const subtotalMinor = lines.reduce(
    (total, line) => total + Math.max(0, Math.trunc(line.netAmountMinor ?? line.amountMinor)),
    0,
  );
  const taxTotalMinor = lines.reduce(
    (total, line) => total + Math.max(0, Math.trunc(line.taxAmountMinor ?? 0)),
    0,
  );
  const totalAmountMinor = lines.reduce(
    (total, line) => total + Math.max(0, Math.trunc(line.grossAmountMinor ?? line.amountMinor)),
    0,
  );
  return { subtotalMinor, taxTotalMinor, totalAmountMinor, currency, lineCount: lines.length };
}

export function exportInvoiceCsv(input: {
  invoiceNumber: string;
  clientCode: string;
  warehouseCode: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  lines: Array<{
    lineNumber: number;
    eventType: string;
    description: string;
    quantity: number;
    amountMinor: number;
    vatRateBps?: number | null;
    netAmountMinor?: number;
    taxAmountMinor?: number;
    grossAmountMinor?: number;
    currency: string;
  }>;
}): string {
  const header = [
    'invoiceNumber',
    'clientCode',
    'warehouseCode',
    'periodStart',
    'periodEnd',
    'lineNumber',
    'eventType',
    'description',
    'quantity',
    'netAmountMinor',
    'vatRateBps',
    'taxAmountMinor',
    'grossAmountMinor',
    'currency',
  ];
  const rows = input.lines.map((line) => [
    input.invoiceNumber,
    input.clientCode,
    input.warehouseCode,
    toIsoDate(input.periodStart),
    toIsoDate(input.periodEnd),
    String(line.lineNumber),
    line.eventType,
    line.description,
    String(line.quantity),
    String(line.netAmountMinor ?? line.amountMinor),
    line.vatRateBps === undefined || line.vatRateBps === null ? '' : String(line.vatRateBps),
    String(line.taxAmountMinor ?? 0),
    String(line.grossAmountMinor ?? line.amountMinor),
    line.currency,
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function makeCreditNoteNumber(input: {
  invoiceNumber: string;
  sequence?: number | null;
}): string {
  const invoiceNumber =
    input.invoiceNumber
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'INVOICE';
  const sequence = Math.max(1, Math.trunc(input.sequence ?? 1));
  return `CN-${invoiceNumber}-${String(sequence).padStart(3, '0')}`.slice(0, 120);
}

export function buildCreditNoteLines(
  invoiceLines: BillingCreditNoteSourceLine[],
  selectedLineNumbers?: number[] | null,
): BillingCreditNoteLineDraft[] {
  const selected = normalizeLineNumberSelection(selectedLineNumbers);
  const eligibleLines = invoiceLines
    .slice()
    .filter((line) => selected === null || selected.has(line.lineNumber))
    .sort((a, b) => a.lineNumber - b.lineNumber);

  if (eligibleLines.length === 0) {
    throw new Error('Credit note must reference at least one invoice line.');
  }

  return eligibleLines.map((line, index) => {
    const netAmountMinor = Math.max(0, Math.trunc(line.netAmountMinor ?? line.amountMinor));
    const taxAmountMinor = Math.max(0, Math.trunc(line.taxAmountMinor ?? 0));
    const grossAmountMinor = Math.max(0, Math.trunc(line.grossAmountMinor ?? line.amountMinor));
    return {
      invoiceLineId: line.id,
      lineNumber: index + 1,
      eventType: line.eventType,
      description: `Credit: ${line.description}`.slice(0, 500),
      quantity: Math.max(0, Math.trunc(line.quantity)),
      amountMinor: Math.max(0, Math.trunc(line.amountMinor)),
      vatRateBps: normalizeVatRateBps(line.vatRateBps),
      netAmountMinor,
      taxAmountMinor,
      grossAmountMinor,
      currency: line.currency,
      metadata: {
        sourceInvoiceLineId: line.id,
        sourceInvoiceLineNumber: line.lineNumber,
        sourceMetadata: line.metadata ?? null,
      },
    };
  });
}

export function summarizeCreditNoteLines(
  lines: Array<{
    amountMinor: number;
    currency: string;
    netAmountMinor?: number;
    taxAmountMinor?: number;
    grossAmountMinor?: number;
  }>,
): {
  subtotalMinor: number;
  taxTotalMinor: number;
  totalAmountMinor: number;
  currency: string;
  lineCount: number;
} {
  return summarizeInvoiceLines(lines);
}

export function exportCreditNoteCsv(input: {
  creditNoteNumber: string;
  invoiceNumber: string;
  clientCode: string;
  warehouseCode: string;
  lines: Array<{
    lineNumber: number;
    eventType: string;
    description: string;
    quantity: number;
    amountMinor: number;
    vatRateBps?: number | null;
    netAmountMinor?: number;
    taxAmountMinor?: number;
    grossAmountMinor?: number;
    currency: string;
  }>;
}): string {
  const header = [
    'creditNoteNumber',
    'invoiceNumber',
    'clientCode',
    'warehouseCode',
    'lineNumber',
    'eventType',
    'description',
    'quantity',
    'netAmountMinor',
    'vatRateBps',
    'taxAmountMinor',
    'grossAmountMinor',
    'currency',
  ];
  const rows = input.lines.map((line) => [
    input.creditNoteNumber,
    input.invoiceNumber,
    input.clientCode,
    input.warehouseCode,
    String(line.lineNumber),
    line.eventType,
    line.description,
    String(line.quantity),
    String(line.netAmountMinor ?? line.amountMinor),
    line.vatRateBps === undefined || line.vatRateBps === null ? '' : String(line.vatRateBps),
    String(line.taxAmountMinor ?? 0),
    String(line.grossAmountMinor ?? line.amountMinor),
    line.currency,
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function buildStorageDayBillingEvents(input: {
  clientCode: string;
  warehouseId: string;
  currency: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  unitPriceMinorPerUnitDay: number;
  snapshots: StorageBillingStockSnapshot[];
}): StorageBillingEventDraft[] {
  const period = normalizeBillingPeriod({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  const unitPriceMinor = Math.max(0, Math.trunc(input.unitPriceMinorPerUnitDay));
  return input.snapshots
    .map((snapshot) => {
      const quantity = Math.max(0, Math.trunc(snapshot.quantity));
      const chargeableDays = calculateChargeableDays({
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        ownedFrom: snapshot.ownedFrom,
        ownedTo: snapshot.ownedTo,
      });
      const billedUnits = quantity * chargeableDays;
      const amountMinor = billedUnits * unitPriceMinor;
      const tax = calculateTaxAmounts(amountMinor);
      return {
        eventType: 'STORAGE_DAY' as const,
        quantity: billedUnits,
        unitPriceMinor,
        amountMinor,
        ...tax,
        currency: input.currency,
        reference: makeStorageBillingReference({
          clientCode: input.clientCode,
          warehouseId: input.warehouseId,
          stockQuantId: snapshot.stockQuantId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        }),
        resourceType: 'STOCK_QUANT' as const,
        resourceId: snapshot.stockQuantId,
        description: `Storage days for ${snapshot.skuCode}`,
        occurredAt: period.periodEnd,
        metadata: {
          skuCode: snapshot.skuCode,
          locationCode: snapshot.locationCode ?? null,
          stockQuantity: quantity,
          chargeableDays,
          periodStart: period.periodStart.toISOString(),
          periodEnd: period.periodEnd.toISOString(),
        },
      };
    })
    .filter((event) => event.quantity > 0 && event.amountMinor > 0);
}

export function calculateChargeableDays(input: {
  periodStart: Date | string;
  periodEnd: Date | string;
  ownedFrom: Date | string;
  ownedTo?: Date | string | null;
}): number {
  const periodStart = startOfUtcDay(new Date(input.periodStart));
  const periodEnd = startOfUtcDay(new Date(input.periodEnd));
  const ownedFrom = startOfUtcDay(new Date(input.ownedFrom));
  const ownedTo = input.ownedTo ? startOfUtcDay(new Date(input.ownedTo)) : periodEnd;
  const from = ownedFrom > periodStart ? ownedFrom : periodStart;
  const to = ownedTo < periodEnd ? ownedTo : periodEnd;
  if (to <= from) return 0;
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function invoiceEventStatusFilter(statuses?: string[] | null): string[] {
  const allowed = new Set(Object.values(BillingEventStatus));
  const normalized = (statuses ?? [BillingEventStatus.BILLABLE])
    .map((status) => status.trim().toUpperCase())
    .filter((status) => allowed.has(status as BillingEventStatus));
  return normalized.length ? normalized : [BillingEventStatus.BILLABLE];
}

export function calculateTaxAmounts(
  amountMinor: number,
  vatRateBps?: number | null,
): TaxCalculationResult {
  const netAmountMinor = Math.max(0, Math.trunc(amountMinor));
  const normalizedVatRateBps =
    vatRateBps === undefined || vatRateBps === null
      ? null
      : Math.min(10000, Math.max(0, Math.trunc(vatRateBps)));
  const taxAmountMinor =
    normalizedVatRateBps === null
      ? 0
      : Math.round((netAmountMinor * normalizedVatRateBps) / 10_000);
  return {
    vatRateBps: normalizedVatRateBps,
    netAmountMinor,
    taxAmountMinor,
    grossAmountMinor: netAmountMinor + taxAmountMinor,
  };
}

export function applyRateToBillingQuantity(input: {
  quantity: number;
  rate: Pick<ClientRateCandidate, 'unitPriceMinor' | 'minChargeMinor' | 'vatRateBps'>;
}): TaxCalculationResult & { unitPriceMinor: number; amountMinor: number } {
  const quantity = Math.max(0, Math.trunc(input.quantity));
  const unitPriceMinor = Math.max(0, Math.trunc(input.rate.unitPriceMinor));
  const minChargeMinor =
    input.rate.minChargeMinor === null || input.rate.minChargeMinor === undefined
      ? 0
      : Math.max(0, Math.trunc(input.rate.minChargeMinor));
  const amountMinor = Math.max(quantity * unitPriceMinor, minChargeMinor);
  return {
    unitPriceMinor,
    amountMinor,
    ...calculateTaxAmounts(amountMinor, input.rate.vatRateBps),
  };
}

export function selectClientRate(input: {
  rates: ClientRateCandidate[];
  eventType: string;
  unit?: string | null;
}): ClientRateCandidate | null {
  const eventType = input.eventType.trim().toUpperCase();
  const unit = (input.unit ?? 'EA').trim().toUpperCase();
  return (
    input.rates.find(
      (rate) =>
        rate.eventType.trim().toUpperCase() === eventType &&
        rate.unit.trim().toUpperCase() === unit,
    ) ??
    input.rates.find((rate) => rate.eventType.trim().toUpperCase() === eventType) ??
    null
  );
}

export function makeSequentialInvoiceNumber(input: InvoiceNumberSequenceState): string {
  const prefix = normalizeInvoiceToken(input.prefix).replace(/_/g, '-');
  const year = Math.max(2000, Math.min(9999, Math.trunc(input.year)));
  const nextNumber = Math.max(1, Math.trunc(input.nextNumber));
  return `${prefix}-${year}-${String(nextNumber).padStart(6, '0')}`;
}

export function buildInvoiceVoidReinvoicePlan(lines: Array<{ billingEventId?: string | null }>): {
  billingEventIds: string[];
  shouldDetachLines: boolean;
} {
  const billingEventIds = Array.from(
    new Set(
      lines
        .map((line) => line.billingEventId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );
  return { billingEventIds, shouldDetachLines: billingEventIds.length > 0 };
}

function normalizeLineNumberSelection(value: number[] | null | undefined): Set<number> | null {
  if (!value?.length) return null;
  const normalized = new Set<number>();
  for (const lineNumber of value) {
    const normalizedLineNumber = Math.trunc(lineNumber);
    if (normalizedLineNumber > 0) normalized.add(normalizedLineNumber);
  }
  return normalized.size > 0 ? normalized : null;
}

function normalizeVatRateBps(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.min(10_000, Math.max(0, Math.trunc(value)));
}

function makeStorageBillingReference(input: {
  clientCode: string;
  warehouseId: string;
  stockQuantId: string;
  periodStart: Date;
  periodEnd: Date;
}): string {
  const seed = [
    input.clientCode,
    input.warehouseId,
    input.stockQuantId,
    yyyymmdd(input.periodStart),
    yyyymmdd(input.periodEnd),
  ].join(':');
  return `STOR-${normalizeInvoiceToken(input.clientCode)}-${yyyymmdd(input.periodStart)}-${shortHash(seed)}`;
}

function normalizeInvoiceToken(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase()
      .slice(0, 32) || 'CLIENT'
  );
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function yyyymmdd(value: Date): string {
  return value.toISOString().slice(0, 10).replace(/-/g, '');
}

function toIsoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();
}

const MS_PER_DAY = 86_400_000;
