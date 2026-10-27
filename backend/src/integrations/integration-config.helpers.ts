const SECRET_KEY_PATTERN = /(secret|password|token|api.?key|authorization|credential|private)/i;

export interface IntegrationRouteConfig {
  eventType?: string;
  eventTypes?: string[];
  path?: string;
  method?: string;
  endpointType?: string;
}

export interface IntegrationAuthConfig {
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  hmacSecret?: string;
  hmacHeader?: string;
  hmacTimestampHeader?: string;
}

export interface IntegrationEndpointConfig {
  path?: string;
  method?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  eventTypes?: string[];
  routes?: IntegrationRouteConfig[];
  auth?: IntegrationAuthConfig;
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  hmacSecret?: string;
  hmacHeader?: string;
  hmacTimestampHeader?: string;
}

export function toIntegrationEndpointConfig(value: unknown): IntegrationEndpointConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as IntegrationEndpointConfig;
}

export function maskIntegrationConfig(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(maskIntegrationConfig);
  }

  if (typeof value !== 'object') {
    return value;
  }

  const masked: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    masked[key] = SECRET_KEY_PATTERN.test(key) ? maskSecretValue(child) : maskIntegrationConfig(child);
  }
  return masked;
}

export function routeMatchesEvent(route: IntegrationRouteConfig, eventType: string): boolean {
  const normalized = eventType.trim().toUpperCase();
  const routeEventType = route.eventType?.trim().toUpperCase();
  if (routeEventType && routeEventType === normalized) {
    return true;
  }

  return (route.eventTypes ?? []).some((candidate) => candidate.trim().toUpperCase() === normalized);
}

export function endpointAcceptsEvent(config: IntegrationEndpointConfig, eventType: string): boolean {
  const normalized = eventType.trim().toUpperCase();
  if ((config.eventTypes ?? []).some((candidate) => candidate.trim().toUpperCase() === normalized)) {
    return true;
  }

  return (config.routes ?? []).some((route) => routeMatchesEvent(route, normalized));
}

export function routeForEvent(
  config: IntegrationEndpointConfig,
  eventType: string,
): IntegrationRouteConfig | null {
  return (config.routes ?? []).find((route) => routeMatchesEvent(route, eventType)) ?? null;
}

export function joinIntegrationUrl(baseUrl: string, path?: string | null): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/g, '');
  const normalizedPath = (path ?? '').trim();

  if (!normalizedPath) {
    return normalizedBaseUrl;
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  return `${normalizedBaseUrl}/${normalizedPath.replace(/^\/+/, '')}`;
}

export function normalizeIntegrationMethod(value?: string | null): string {
  const method = value?.trim().toUpperCase() || 'POST';
  return ['POST', 'PUT', 'PATCH'].includes(method) ? method : 'POST';
}

export function normalizeIntegrationTimeoutMs(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 10_000);
  if (!Number.isFinite(parsed)) {
    return 10_000;
  }
  return Math.min(60_000, Math.max(500, Math.trunc(parsed)));
}

function maskSecretValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value);
  if (text.length <= 4) {
    return '****';
  }
  return `${'*'.repeat(Math.max(4, Math.min(12, text.length - 4)))}${text.slice(-4)}`;
}
