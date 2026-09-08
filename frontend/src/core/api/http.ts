import { config } from '../../app/config';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../auth/session';
import { redactedErrorMessage, reportFrontendEvent } from '../observability/frontendObservability';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

function toQueryString(query?: RequestOptions['query']) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

function joinApiPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${config.apiBaseUrl}${normalized}`;
}

function unwrapPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload && 'meta' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function safeJsonParse(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function createRequestId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `ui-${Date.now().toString(36)}-${random}`;
}

function createIdempotencyKey(method: HttpMethod, path: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const safePath = path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'request';
  return `ui-${method.toLowerCase()}-${safePath}-${Date.now().toString(36)}-${random}`;
}

function needsIdempotencyKey(method: HttpMethod): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
}

function createTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

  const abortFromExternal = () => controller.abort(externalSignal?.reason ?? 'aborted');
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  return safeJsonParse(text);
}

async function performAccessTokenRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const abort = createTimeoutSignal(Math.max(1000, config.apiRequestTimeoutMs));
  try {
    const response = await fetch(joinApiPath('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': createRequestId() },
      body: JSON.stringify({ refreshToken }),
      signal: abort.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        if (getRefreshToken() === refreshToken) clearTokens();
        return false;
      }
      throw new ApiError('Session refresh is temporarily unavailable', response.status, null);
    }
    const data = unwrapPayload<{ accessToken?: string; refreshToken?: string; user?: unknown }>(await parseResponsePayload(response));
    if (!data || typeof data.accessToken !== 'string' || !data.accessToken
      || typeof data.refreshToken !== 'string' || !data.refreshToken) {
      throw new ApiError('Invalid session refresh response', 502, null);
    }
    if (getRefreshToken() !== refreshToken) return false;
    saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(abort.signal.aborted ? 'Session refresh timed out' : 'Session refresh is temporarily unavailable', 0, null);
  } finally {
    abort.cleanup();
  }
}

function refreshAccessToken(): Promise<boolean> {
  refreshPromise ??= performAccessTokenRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export function refreshAccessTokenForSession(): Promise<boolean> {
  return refreshAccessToken();
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {},
): Promise<TResponse> {
  const url = `${joinApiPath(path)}${toQueryString(options.query)}`;
  const token = getAccessToken();
  const method = options.method ?? 'GET';
  const timeout = Math.max(1_000, options.timeoutMs ?? config.apiRequestTimeoutMs);
  const abort = createTimeoutSignal(timeout, options.signal);
  const idempotencyKey = options.idempotencyKey?.trim() || (needsIdempotencyKey(method) ? createIdempotencyKey(method, path) : '');
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': createRequestId(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const execute = () =>
    fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: abort.signal,
      cache: 'no-store',
    });

  try {
    let response = await execute();

    if (response.status === 401) {
      const refreshed = getAccessToken() !== token && Boolean(getAccessToken())
        ? true : await refreshAccessToken();
      if (refreshed) {
        const nextToken = getAccessToken();
        if (nextToken) headers.Authorization = `Bearer ${nextToken}`;
        response = await execute();
      }
    }

    const payload = await parseResponsePayload(response);

    if (!response.ok) {
      if (response.status === 401 && getAccessToken() === headers.Authorization?.slice(7)) clearTokens();
      const message = extractErrorMessage(payload, response.statusText);
      reportApiFailure(path, message, response.status, startedAt);
      throw new ApiError(message, response.status, payload);
    }

    return unwrapPayload<TResponse>(payload);
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    const message = abort.signal.aborted ? `API timeout po ${timeout} ms` : error instanceof Error ? error.message : 'API request failed';
    reportApiFailure(path, message, 0, startedAt);
    throw new ApiError(message, 0, { path: path.split('?')[0] });
  } finally {
    abort.cleanup();
  }
}

function reportApiFailure(path: string, message: string, statusCode: number, startedAt: number): void {
  if (path.includes('/observability/frontend-events')) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  reportFrontendEvent({
    type: 'api_failure',
    severity: statusCode >= 500 || statusCode === 0 ? 'error' : 'warning',
    source: path,
    statusCode,
    durationMs: Math.max(0, Math.round(now - startedAt)),
    message: redactedErrorMessage(message),
  });
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const item = payload as Record<string, unknown>;
    if (typeof item.message === 'string') return item.message;
    const error = item.error;
    if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
      return (error as Record<string, string>).message;
    }
  }
  return fallback || 'API request failed';
}
