export enum WmsClientStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum BillingEventType {
  STORAGE_DAY = 'STORAGE_DAY',
  INBOUND_RECEIPT = 'INBOUND_RECEIPT',
  OUTBOUND_ORDER = 'OUTBOUND_ORDER',
  PICK = 'PICK',
  PACK = 'PACK',
  SHIP = 'SHIP',
  CARRIER_LABEL = 'CARRIER_LABEL',
  CYCLE_COUNT = 'CYCLE_COUNT',
  REPLENISHMENT = 'REPLENISHMENT',
  MANUAL = 'MANUAL',
}

export enum BillingEventStatus {
  PENDING = 'PENDING',
  BILLABLE = 'BILLABLE',
  INVOICED = 'INVOICED',
  VOIDED = 'VOIDED',
}

export interface WmsClientResponse {
  id: string;
  code: string;
  name: string;
  status: string;
  billingCurrency: string;
  externalReference: string | null;
  metadata?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ClientWarehouseResponse {
  id: string;
  clientId: string;
  warehouseId: string;
  isActive: boolean;
  defaultBillingProfile: string | null;
  externalReference: string | null;
  metadata?: unknown;
}

export interface ClientSkuAliasResponse {
  id: string;
  clientId: string;
  warehouseId: string | null;
  skuId: string | null;
  clientSku: string;
  clientBarcode: string | null;
  description: string | null;
  metadata?: unknown;
}

export interface ClientResourceLinkResponse {
  id: string;
  clientId: string;
  warehouseId: string;
  resourceType: string;
  resourceId: string;
  externalReference: string | null;
  metadata?: unknown;
}

export interface BillingEventInput {
  eventType: BillingEventType | string;
  quantity?: number | null;
  unitPriceMinor?: number | null;
  amountMinor?: number | null;
  currency?: string | null;
  reference?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  description?: string | null;
  occurredAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface BillingCounterInput {
  eventType: BillingEventType | string;
  quantity: number;
  unitPriceMinor: number;
  description?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  referenceSuffix?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BillingEventResponse {
  id: string;
  clientId: string;
  warehouseId: string;
  eventType: string;
  status: string;
  reference: string;
  resourceType: string | null;
  resourceId: string | null;
  description: string | null;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  vatRateBps?: number | null;
  netAmountMinor?: number;
  taxAmountMinor?: number;
  grossAmountMinor?: number;
  currency: string;
  occurredAt: Date | string;
  invoicedAt: Date | string | null;
  voidedAt: Date | string | null;
  metadata?: unknown;
}

export interface BillingSummaryResponse {
  clientId: string;
  warehouseId: string;
  currency: string;
  totalEvents: number;
  billableEvents: number;
  pendingEvents: number;
  invoicedEvents: number;
  voidedEvents: number;
  billableAmountMinor: number;
  pendingAmountMinor: number;
  invoicedAmountMinor: number;
  byType: Array<{ eventType: string; count: number; amountMinor: number }>;
}

export interface GenerateBillingEventsResponse {
  created: number;
  skippedZeroQuantity: number;
  events: BillingEventResponse[];
}

export enum BillingInvoiceStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED',
  VOIDED = 'VOIDED',
}

export interface BillingInvoiceLineResponse {
  id: string;
  invoiceId: string;
  billingEventId: string | null;
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
  metadata?: unknown;
}

export interface BillingInvoiceResponse {
  id: string;
  clientId: string;
  warehouseId: string;
  invoiceNumber: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  currency: string;
  subtotalMinor: number;
  taxTotalMinor: number;
  totalAmountMinor: number;
  lineCount: number;
  finalizedAt: Date | string | null;
  voidedAt: Date | string | null;
  metadata?: unknown;
  lines?: BillingInvoiceLineResponse[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BillingInvoiceExportResponse {
  invoiceNumber: string;
  contentType: 'text/csv';
  filename: string;
  csv: string;
}

export interface BillingInvoicePdfExportResponse {
  invoiceNumber: string;
  contentType: 'application/pdf';
  filename: string;
  pdfBase64: string;
}


export enum BillingCreditNoteStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED',
  VOIDED = 'VOIDED',
}

export interface BillingCreditNoteLineResponse {
  id: string;
  creditNoteId: string;
  invoiceLineId: string | null;
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
  metadata?: unknown;
}

export interface BillingCreditNoteResponse {
  id: string;
  clientId: string;
  warehouseId: string;
  invoiceId: string;
  creditNoteNumber: string;
  status: string;
  reasonCode: string | null;
  reason: string | null;
  currency: string;
  subtotalMinor: number;
  taxTotalMinor: number;
  totalAmountMinor: number;
  lineCount: number;
  finalizedAt: Date | string | null;
  voidedAt: Date | string | null;
  metadata?: unknown;
  lines?: BillingCreditNoteLineResponse[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BillingCreditNoteExportResponse {
  creditNoteNumber: string;
  contentType: 'text/csv';
  filename: string;
  csv: string;
}

export interface BillingCreditNotePdfExportResponse {
  creditNoteNumber: string;
  contentType: 'application/pdf';
  filename: string;
  pdfBase64: string;
}

export interface ClientRateResponse {
  id: string;
  rateCardId: string;
  eventType: string;
  unit: string;
  unitPriceMinor: number;
  minChargeMinor: number | null;
  vatRateBps: number | null;
  metadata?: unknown;
}

export interface ClientRateCardResponse {
  id: string;
  clientId: string;
  warehouseId: string;
  name: string;
  currency: string;
  validFrom: Date | string;
  validTo: Date | string | null;
  isActive: boolean;
  metadata?: unknown;
  rates?: ClientRateResponse[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserClientAccessResponse {
  id: string;
  userId: string;
  clientId: string;
  warehouseId: string | null;
  isActive: boolean;
  metadata?: unknown;
}
