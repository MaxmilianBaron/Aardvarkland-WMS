import { createHash, createHmac } from 'node:crypto';

import {
  IntegrationEndpointConfig,
  joinIntegrationUrl,
  normalizeIntegrationMethod,
  normalizeIntegrationTimeoutMs,
  routeForEvent,
  toIntegrationEndpointConfig,
} from './integration-config.helpers';

export interface HttpIntegrationEndpoint {
  id: string;
  code: string;
  type: string;
  baseUrl: string;
  authType: string;
  config?: unknown;
}

export interface HttpIntegrationEvent {
  id?: string | null;
  type: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  payload?: unknown;
  attempts?: number | null;
  createdAt?: Date | string | null;
}

export interface HttpIntegrationDeliveryResult {
  endpointId: string;
  endpointCode: string;
  eventType: string;
  url: string;
  method: string;
  statusCode: number;
  success: boolean;
  requestBodyHash: string;
  responseBody: string;
}

export interface HttpIntegrationPingResult {
  url: string;
  method: string;
  statusCode: number;
  success: boolean;
  responseBody: string;
}

interface IntegrationCircuitState {
  failures: number;
  openedUntil: number | null;
  lastFailureAt: number | null;
}

const integrationCircuits = new Map<string, IntegrationCircuitState>();

export interface IntegrationCircuitSnapshot {
  key: string;
  failures: number;
  open: boolean;
  openedUntil: string | null;
  lastFailureAt: string | null;
}

export function getIntegrationCircuitSnapshot(now = Date.now()): IntegrationCircuitSnapshot[] {
  return [...integrationCircuits.entries()].map(([key, state]) => ({
    key,
    failures: state.failures,
    open: Boolean(state.openedUntil && state.openedUntil > now),
    openedUntil: state.openedUntil ? new Date(state.openedUntil).toISOString() : null,
    lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
  }));
}

export async function deliverHttpIntegrationEvent(
  endpoint: HttpIntegrationEndpoint,
  event: HttpIntegrationEvent,
): Promise<HttpIntegrationDeliveryResult> {
  const config = toIntegrationEndpointConfig(endpoint.config);
  const route = routeForEvent(config, event.type);
  const method = normalizeIntegrationMethod(route?.method ?? config.method);
  const url = joinIntegrationUrl(endpoint.baseUrl, route?.path ?? config.path ?? '/events/wms');
  const body = stableStringify({
    id: event.id ?? null,
    eventType: event.type,
    aggregateType: event.aggregateType ?? null,
    aggregateId: event.aggregateId ?? null,
    payload: unwrapOutboxPayload(event.payload),
    attempt: event.attempts ?? 0,
    createdAt: normalizeDateOrNull(event.createdAt),
  });
  const response = await callIntegrationEndpoint({ endpoint, config, method, url, body });

  return {
    endpointId: endpoint.id,
    endpointCode: endpoint.code,
    eventType: event.type,
    url,
    method,
    statusCode: response.statusCode,
    success: response.success,
    requestBodyHash: sha256Hex(body),
    responseBody: response.responseBody,
  };
}

export async function pingHttpIntegrationEndpoint(
  endpoint: HttpIntegrationEndpoint,
  input: { eventType?: string; path?: string; payload?: unknown } = {},
): Promise<HttpIntegrationPingResult> {
  const config = toIntegrationEndpointConfig(endpoint.config);
  const method = normalizeIntegrationMethod(config.method);
  const url = joinIntegrationUrl(endpoint.baseUrl, input.path ?? config.path ?? '/health');
  const body = stableStringify({
    eventType: input.eventType ?? 'WMS_INTEGRATION_PING',
    payload: input.payload ?? { ping: true, endpointCode: endpoint.code },
    generatedAt: new Date().toISOString(),
  });

  const response = await callIntegrationEndpoint({ endpoint, config, method, url, body });
  return { ...response, url, method };
}

async function callIntegrationEndpoint(input: {
  endpoint: HttpIntegrationEndpoint;
  config: IntegrationEndpointConfig;
  method: string;
  url: string;
  body: string;
}): Promise<{ statusCode: number; success: boolean; responseBody: string }> {
  assertIntegrationUrlAllowed(input.url);
  const circuitKey = integrationCircuitKey(input.endpoint, input.url);
  assertIntegrationCircuitAllowsAttempt(circuitKey);
  const headers = buildIntegrationHeaders(input.endpoint, input.config, input.body);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizeIntegrationTimeoutMs(input.config.timeoutMs),
  );

  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers,
      body: input.body,
      signal: controller.signal,
    });
    const text = await response.text();
    const result = {
      statusCode: response.status,
      success: response.ok,
      responseBody: text.slice(0, 4000),
    };
    recordIntegrationCircuitResult(circuitKey, result.success);
    return result;
  } catch (error) {
    recordIntegrationCircuitResult(circuitKey, false);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertIntegrationCircuitAllowsAttempt(key: string): void {
  if (!readBooleanEnv('INTEGRATION_CIRCUIT_BREAKER_ENABLED', true)) {
    return;
  }

  const state = integrationCircuits.get(key);
  const now = Date.now();
  if (!state?.openedUntil) {
    return;
  }

  if (state.openedUntil <= now) {
    state.openedUntil = null;
    integrationCircuits.set(key, state);
    return;
  }

  throw new Error(`Integration circuit is open until ${new Date(state.openedUntil).toISOString()}`);
}

function recordIntegrationCircuitResult(key: string, success: boolean): void {
  if (!readBooleanEnv('INTEGRATION_CIRCUIT_BREAKER_ENABLED', true)) {
    return;
  }

  if (success) {
    integrationCircuits.delete(key);
    return;
  }

  const threshold = readIntegerEnv('INTEGRATION_CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5, 1, 100);
  const cooldownSeconds = readIntegerEnv('INTEGRATION_CIRCUIT_BREAKER_COOLDOWN_SECONDS', 300, 1, 86_400);
  const now = Date.now();
  const state = integrationCircuits.get(key) ?? { failures: 0, openedUntil: null, lastFailureAt: null };
  const failures = state.failures + 1;
  integrationCircuits.set(key, {
    failures,
    lastFailureAt: now,
    openedUntil: failures >= threshold ? now + cooldownSeconds * 1000 : state.openedUntil,
  });
}

function assertIntegrationUrlAllowed(value: string): void {
  const url = parseHttpUrl(value);
  const allowedHosts = parseAllowedHosts(process.env['EXTERNAL_HTTP_ALLOWED_HOSTS']);
  const nodeEnv = (process.env['NODE_ENV'] ?? 'development').trim().toLowerCase();
  const productionLike = nodeEnv === 'production' || nodeEnv === 'staging';

  if (allowedHosts.includes('*') && !productionLike) {
    return;
  }

  if (allowedHosts.length === 0) {
    if (productionLike) {
      throw new Error('Outbound integration host is not allowed. Configure EXTERNAL_HTTP_ALLOWED_HOSTS.');
    }
    return;
  }

  const host = url.hostname.toLowerCase();
  const hostWithPort = url.port ? `${host}:${url.port}` : host;
  if (!allowedHosts.includes(host) && !allowedHosts.includes(hostWithPort)) {
    throw new Error('Outbound integration host is not allowed by EXTERNAL_HTTP_ALLOWED_HOSTS.');
  }
}

function integrationCircuitKey(endpoint: HttpIntegrationEndpoint, url: string): string {
  const parsed = new URL(url);
  return `${endpoint.id}:${parsed.origin}`;
}

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readIntegerEnv(key: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Integration endpoint URL must use http or https.');
  }
  return url;
}

function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function buildIntegrationHeaders(
  endpoint: HttpIntegrationEndpoint,
  config: IntegrationEndpointConfig,
  body: string,
): Record<string, string> {
  const auth = config.auth ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'wms-backend-integration/1.0',
    'X-WMS-Endpoint-Code': endpoint.code,
    ...(config.headers ?? {}),
  };
  const authType = endpoint.authType.trim().toUpperCase();

  if (authType === 'API_KEY') {
    const headerName = auth.apiKeyHeader ?? config.apiKeyHeader ?? 'X-API-Key';
    const apiKey = auth.apiKey ?? config.apiKey;
    if (apiKey) headers[headerName] = apiKey;
  }

  if (authType === 'BEARER') {
    const token = auth.bearerToken ?? config.bearerToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  if (authType === 'BASIC') {
    const username = auth.username ?? config.username;
    const password = auth.password ?? config.password;
    if (username && password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
  }

  if (authType === 'HMAC') {
    const secret = auth.hmacSecret ?? config.hmacSecret;
    if (secret) {
      const timestamp = new Date().toISOString();
      const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
      headers[auth.hmacTimestampHeader ?? config.hmacTimestampHeader ?? 'X-WMS-Timestamp'] = timestamp;
      headers[auth.hmacHeader ?? config.hmacHeader ?? 'X-WMS-Signature'] = `sha256=${signature}`;
    }
  }

  return headers;
}

function unwrapOutboxPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value ?? {};
  }

  const record = value as Record<string, unknown>;
  return record['payload'] ?? value;
}

function normalizeDateOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
