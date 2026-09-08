import { createHash, createHmac } from 'node:crypto';

import { verifyWebhookSignature } from '../../common';
import { normalizeCarrierCode } from '../carriers.helpers';
import { CarrierLabelRequest, CarrierLabelResult, CarrierTrackingStatus } from '../carriers.types';
import {
  CarrierAdapterExecutionInput,
  CarrierAdapterHttpRequest,
  CarrierAdapterHttpResponse,
  CarrierAdapterMode,
  CarrierCredentialContext,
  CarrierWebhookSignatureInput,
  CarrierWebhookSignatureResult,
  CarrierTrackingWebhookNormalizedEvent,
} from './carrier-adapter.types';

const PROVIDER_SIGNATURE_HEADERS: Record<string, string[]> = {
  CARRIER_A: ['x-carrier-a-signature', 'x-webhook-signature'],
  CARRIER_B: ['x-carrier-b-signature', 'x-webhook-signature'],
  CARRIER_C: ['x-carrier-c-signature', 'x-webhook-signature'],
  CARRIER_D: ['x-carrier-d-signature', 'x-carrier-d-signature', 'x-webhook-signature'],
};

export function resolveEffectiveCarrierAdapterMode(input: {
  configuredMode: CarrierAdapterMode;
  credential: CarrierCredentialContext | null;
}): Exclude<CarrierAdapterMode, 'credential'> {
  if (input.configuredMode === CarrierAdapterMode.CREDENTIAL) {
    const environment = input.credential?.environment.toUpperCase() ?? 'TEST';
    return ['PROD', 'PRODUCTION', 'LIVE'].includes(environment) ? CarrierAdapterMode.PRODUCTION : CarrierAdapterMode.SANDBOX;
  }

  return input.configuredMode;
}

export function createMockCarrierLabelResult(input: CarrierLabelRequest, adapterCode = 'LOCAL_TEST_CARRIER_ADAPTER'): CarrierLabelResult {
  const carrier = normalizeCarrierCode(input.carrier);
  const idempotencyKey = normalizeIdempotencyKey(input);
  const labelReference = `${carrier}-${shortHash(`${input.shipmentNumber}:${input.packageCode ?? input.packageId ?? 'SHIPMENT'}:${idempotencyKey}`)}`;
  const trackingNumber = `${carrier}-${shortHash(`${labelReference}:${input.warehouseId}`).slice(0, 14)}`;
  const labelFormat = carrier === 'CARRIER_D' ? 'PDF' : 'ZPL';
  const labelData = Buffer.from(JSON.stringify({
    carrier,
    serviceLevel: input.serviceLevel ?? null,
    shipmentNumber: input.shipmentNumber,
    packageCode: input.packageCode ?? null,
    trackingNumber,
    adapter: adapterCode,
    testMode: true,
  })).toString('base64');

  return {
    carrier,
    serviceLevel: input.serviceLevel ?? null,
    labelReference,
    trackingNumber,
    labelFormat,
    labelData,
    idempotencyKey,
    testMode: true,
    adapterCode,
  };
}

export async function postCarrierJson(input: {
  request: CarrierAdapterHttpRequest;
  timeoutMs: number;
}): Promise<CarrierAdapterHttpResponse> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.request.url, {
      method: input.request.method,
      headers: input.request.headers,
      body: input.request.body === undefined
        ? undefined
        : typeof input.request.body === 'string'
          ? input.request.body
          : JSON.stringify(input.request.body),
      signal: controller.signal,
    });
    const text = await response.text();
    const body = parseJsonOrText(text);

    return {
      statusCode: response.status,
      body,
      headers: Object.fromEntries(response.headers.entries()),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function assertCarrierHttpOk(response: CarrierAdapterHttpResponse, carrier: string): void {
  if (response.statusCode >= 200 && response.statusCode < 300) return;

  const detail = typeof response.body === 'string'
    ? response.body.slice(0, 500)
    : JSON.stringify(response.body ?? {}).slice(0, 500);
  throw new Error(`${carrier} carrier API returned HTTP ${response.statusCode}: ${detail}`);
}

export function requireCredential(input: CarrierAdapterExecutionInput): CarrierCredentialContext {
  if (!input.credential) {
    throw new Error(`Active ${input.request.carrier} carrier credentials are required for ${input.mode} adapter mode.`);
  }
  return input.credential;
}

export function credentialString(
  credential: CarrierCredentialContext,
  keys: string[],
  fallback?: string | null,
): string | null {
  for (const key of keys) {
    const secretValue = credential.secrets[key];
    if (secretValue?.trim()) return secretValue.trim();
    const metadataValue = credential.metadata[key];
    if (typeof metadataValue === 'string' && metadataValue.trim()) return metadataValue.trim();
  }

  return fallback?.trim() || null;
}

export function credentialBoolean(credential: CarrierCredentialContext, key: string, fallback = false): boolean {
  const value = credential.metadata[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return fallback;
}

export function providerEndpoint(input: {
  credential: CarrierCredentialContext;
  mode: Exclude<CarrierAdapterMode, 'credential' | 'mock'>;
  carrier: string;
  sandboxUrl: string;
  productionUrl: string;
  metadataKey?: string;
}): string {
  const overrideKey = input.metadataKey ?? 'apiUrl';
  const override = credentialString(input.credential, [overrideKey, `${input.carrier.toLowerCase()}ApiUrl`]);
  if (override) return override.replace(/\/+$/g, '');
  return input.mode === CarrierAdapterMode.PRODUCTION ? input.productionUrl : input.sandboxUrl;
}

export function normalizeCarrierWebhookSignature(input: CarrierWebhookSignatureInput): CarrierWebhookSignatureResult {
  const carrier = normalizeCarrierCode(input.carrier);
  const headers = normalizeHeaders(input.headers);
  const providerHeaders = PROVIDER_SIGNATURE_HEADERS[carrier] ?? ['x-webhook-signature'];
  const headerName = providerHeaders.find((name) => headers[name]);

  if (!headerName) {
    return { ok: false, reason: `Missing carrier signature header for ${carrier}`, headerName: providerHeaders[0] };
  }

  if (headerName === 'x-webhook-signature') {
    const result = verifyWebhookSignature({
      headers: input.headers,
      payload: input.payload,
      secret: input.secret,
      timestampSeconds: 0,
      toleranceSeconds: input.toleranceSeconds,
    });
    return { ok: result.ok, reason: result.reason, headerName };
  }

  const received = headers[headerName] ?? '';
  const canonicalPayload = stableJson(input.payload);
  const digest = createHmac('sha256', input.secret).update(canonicalPayload, 'utf8').digest('hex');
  const base64Digest = createHmac('sha256', input.secret).update(canonicalPayload, 'utf8').digest('base64');
  const normalizedReceived = received.replace(/^sha256=/i, '').trim();
  const ok = timingSafeLike(normalizedReceived, digest) || timingSafeLike(normalizedReceived, base64Digest);

  return ok ? { ok: true, headerName } : { ok: false, reason: `Invalid ${carrier} webhook signature`, headerName };
}

export function normalizeTrackingWebhookPayload(carrierInput: string, payload: Record<string, unknown>): CarrierTrackingWebhookNormalizedEvent {
  const carrier = normalizeCarrierCode(carrierInput);
  const trackingNumber = firstString(payload, ['trackingNumber', 'tracking_number', 'trackingId', 'trackingIdNumber', 'shipmentTrackingNumber', 'barcode']);
  const labelReference = firstString(payload, ['labelReference', 'label_reference', 'labelId', 'shipmentId', 'packetId']);
  const externalEventId = firstString(payload, ['externalEventId', 'eventId', 'id', 'trackingEventId'])
    ?? (trackingNumber ? `${carrier}:${trackingNumber}:${firstString(payload, ['status', 'eventCode', 'code']) ?? 'UNKNOWN'}` : null);
  const rawStatus = firstString(payload, ['status', 'shipmentStatus', 'eventStatus', 'code', 'eventCode']);
  const eventCode = firstString(payload, ['eventCode', 'code', 'scanCode', 'activityCode']);
  const message = firstString(payload, ['message', 'description', 'eventDescription', 'statusDescription']);
  const occurredAt = firstString(payload, ['occurredAt', 'eventTime', 'timestamp', 'dateTime', 'scanDateTime']);

  return {
    externalEventId,
    labelReference,
    trackingNumber,
    status: normalizeProviderTrackingStatus(rawStatus, message),
    eventCode,
    message,
    occurredAt,
    rawPayload: payload,
  };
}

export function normalizeProviderTrackingStatus(status: string | null, message?: string | null): CarrierTrackingStatus {
  const value = `${status ?? ''} ${message ?? ''}`.toUpperCase();
  if (/(DELIVERED|DELIVERY_SUCCESS|COMPLETED)/.test(value)) return CarrierTrackingStatus.DELIVERED;
  if (/(OUT_FOR_DELIVERY|WITH_COURIER|ON VEHICLE|COURIER)/.test(value)) return CarrierTrackingStatus.OUT_FOR_DELIVERY;
  if (/(IN_TRANSIT|TRANSIT|DEPARTED|ARRIVED|SORT|HUB|ACCEPTED|PICKED_UP)/.test(value)) return CarrierTrackingStatus.IN_TRANSIT;
  if (/(EXCEPTION|FAILED|DAMAGED|HELD|CUSTOMS|RETURNED|UNDELIVERABLE)/.test(value)) return CarrierTrackingStatus.EXCEPTION;
  if (/(CANCELLED|VOID|CANCELED)/.test(value)) return CarrierTrackingStatus.CANCELLED;
  if (/(ACCEPTED|CREATED|LABEL|MANIFESTED)/.test(value)) return CarrierTrackingStatus.ACCEPTED;
  return CarrierTrackingStatus.UNKNOWN;
}

export function pickLabelFormat(value: string | null | undefined, fallback: 'ZPL' | 'PDF' = 'PDF'): 'ZPL' | 'PDF' {
  const normalized = value?.toUpperCase() ?? '';
  if (normalized.includes('ZPL')) return 'ZPL';
  if (normalized.includes('PDF')) return 'PDF';
  return fallback;
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function deepGet(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
      continue;
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[String(segment)];
  }
  return current;
}

export function firstString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const found = record[key];
    if (typeof found === 'string' && found.trim().length > 0) return found.trim();
    if (typeof found === 'number' && Number.isFinite(found)) return String(found);
  }
  return null;
}

function normalizeIdempotencyKey(input: CarrierLabelRequest): string {
  return input.idempotencyKey?.trim() || shortHash(`${input.carrier}:${input.shipmentId}:${input.packageId ?? 'shipment'}`);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16).toUpperCase();
}

function parseJsonOrText(text: string): unknown {
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (typeof firstValue === 'string') normalized[key.toLowerCase()] = firstValue;
  }
  return normalized;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function timingSafeLike(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest('hex');
  const rightDigest = createHash('sha256').update(right).digest('hex');
  return leftDigest === rightDigest && left.length === right.length;
}
