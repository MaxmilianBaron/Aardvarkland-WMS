import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const WEBHOOK_SIGNATURE_VERSION = 'v1';

export interface WebhookHeaders {
  [key: string]: string | string[] | undefined;
}

export interface CreateWebhookSignatureInput {
  payload: unknown;
  secret: string;
  timestampSeconds: number;
}

export interface VerifyWebhookSignatureInput extends CreateWebhookSignatureInput {
  headers: WebhookHeaders;
  nowSeconds?: number;
  toleranceSeconds?: number;
}

export interface WebhookSignatureVerificationResult {
  ok: boolean;
  reason: 'OK' | 'MISSING_SIGNATURE' | 'MISSING_TIMESTAMP' | 'STALE_TIMESTAMP' | 'INVALID_SIGNATURE';
}

export function createWebhookSignature(input: CreateWebhookSignatureInput): string {
  const digest = createWebhookSignatureDigest(input);
  return `${WEBHOOK_SIGNATURE_VERSION}=${digest}`;
}

export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): WebhookSignatureVerificationResult {
  const rawSignature = getHeaderValue(input.headers, WEBHOOK_SIGNATURE_HEADER);

  if (!rawSignature) {
    return { ok: false, reason: 'MISSING_SIGNATURE' };
  }

  const timestampFromHeader = getHeaderValue(input.headers, WEBHOOK_TIMESTAMP_HEADER);
  const timestampSeconds = timestampFromHeader ? Number(timestampFromHeader) : input.timestampSeconds;

  if (!Number.isInteger(timestampSeconds) || timestampSeconds <= 0) {
    return { ok: false, reason: 'MISSING_TIMESTAMP' };
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const toleranceSeconds = input.toleranceSeconds ?? 300;

  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: 'STALE_TIMESTAMP' };
  }

  const expectedDigest = createWebhookSignatureDigest({
    payload: input.payload,
    secret: input.secret,
    timestampSeconds,
  });
  const receivedDigest = normalizeSignature(rawSignature);

  if (!receivedDigest || !safeEqualHex(receivedDigest, expectedDigest)) {
    return { ok: false, reason: 'INVALID_SIGNATURE' };
  }

  return { ok: true, reason: 'OK' };
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function createWebhookSignatureDigest(input: CreateWebhookSignatureInput): string {
  return createHmac('sha256', input.secret)
    .update(`${input.timestampSeconds}.${stableJsonStringify(input.payload)}`)
    .digest('hex');
}

function normalizeSignature(value: string): string | null {
  const trimmed = value.trim();
  const digest = trimmed.includes('=') ? trimmed.split('=').at(-1) ?? '' : trimmed;

  return /^[a-f0-9]{64}$/i.test(digest) ? digest.toLowerCase() : null;
}

function safeEqualHex(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function getHeaderValue(headers: WebhookHeaders, name: string): string | null {
  const value = headers[name] ?? headers[name.toUpperCase()];
  const normalized = Array.isArray(value) ? value[0] : value;

  return typeof normalized === 'string' && normalized.trim().length > 0 ? normalized.trim() : null;
}

function sortJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    );
  }

  return value;
}
