import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Request-Id',
  'Idempotency-Key',
  'X-Webhook-Secret',
  'X-Webhook-Timestamp',
  'X-Webhook-Signature',
  'X-Api-Version',
  'X-Response-Envelope',
];
const DEFAULT_EXPOSED_HEADERS = [
  'X-Request-Id',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-Api-Version',
];

export function parseCommaSeparatedValues(value: string | string[] | null | undefined): string[] {
  const rawValues = Array.isArray(value) ? value : value?.split(',') ?? [];
  const normalized = rawValues
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return [...new Set(normalized)];
}

export function parseCorsAllowedOrigins(value: string | string[] | null | undefined): string[] {
  return parseCommaSeparatedValues(value);
}

export function toNestCorsOrigin(value: string | string[] | null | undefined): CorsOptions['origin'] {
  const origins = parseCorsAllowedOrigins(value);

  if (origins.includes('*')) {
    return true;
  }

  return origins.length > 0 ? origins : false;
}

export function buildWmsCorsOptions(input: { allowedOrigins: string[] }): CorsOptions {
  const origin = toNestCorsOrigin(input.allowedOrigins);

  return {
    origin,
    credentials: origin !== true,
    methods: DEFAULT_ALLOWED_METHODS,
    allowedHeaders: DEFAULT_ALLOWED_HEADERS,
    exposedHeaders: DEFAULT_EXPOSED_HEADERS,
    maxAge: 86_400,
  };
}
