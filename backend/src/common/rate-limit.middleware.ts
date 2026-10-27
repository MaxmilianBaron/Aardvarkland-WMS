import { createHash } from 'node:crypto';

import { getClientIpAddress } from './request-ip.helpers';

export interface RateLimitRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  socket: { remoteAddress?: string };
  path?: string;
  originalUrl?: string;
  url: string;
  method: string;
}

interface RateLimitResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

type RateLimitNextFunction = () => void;

export interface BasicRateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  now?: () => number;
  trustProxyHops?: number;
  authLoginMax?: number;
  authRefreshMax?: number;
  webhookMax?: number;
  metrics?: { incrementCounter(name: string, value?: number): void };
}

export interface RateLimitDecision {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface DistributedRateLimitStore {
  increment(input: {
    key: string;
    windowMs: number;
    max: number;
    now: number;
  }): Promise<RateLimitDecision>;
}

export interface DistributedRateLimitOptions extends BasicRateLimitOptions {
  store: DistributedRateLimitStore;
  failOpen?: boolean;
}

interface RateLimitBucketRow {
  count: number;
  reset_at: Date | string;
}

interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

export class PostgresRateLimitStore implements DistributedRateLimitStore {
  constructor(private readonly prisma: RawQueryClient) {}

  async increment(input: {
    key: string;
    windowMs: number;
    max: number;
    now: number;
  }): Promise<RateLimitDecision> {
    const resetAt = new Date(input.now + input.windowMs);
    const rows = await this.prisma.$queryRawUnsafe<RateLimitBucketRow[]>(
      `
        INSERT INTO rate_limit_buckets (key, count, reset_at, created_at, updated_at)
        VALUES ($1, 1, $2, NOW(), NOW())
        ON CONFLICT (key) DO UPDATE
        SET
          count = CASE
            WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
            ELSE rate_limit_buckets.count + 1
          END,
          reset_at = CASE
            WHEN rate_limit_buckets.reset_at <= NOW() THEN EXCLUDED.reset_at
            ELSE rate_limit_buckets.reset_at
          END,
          updated_at = NOW()
        RETURNING count, reset_at
      `,
      input.key,
      resetAt,
    );
    const row = rows[0];
    const count = Number(row?.count ?? input.max + 1);
    const rowResetAt = row?.reset_at instanceof Date ? row.reset_at.getTime() : Date.parse(String(row?.reset_at ?? resetAt.toISOString()));

    return {
      allowed: count <= input.max,
      key: input.key,
      limit: input.max,
      remaining: Math.max(0, input.max - count),
      resetAt: Number.isFinite(rowResetAt) ? rowResetAt : resetAt.getTime(),
    };
  }
}

export function createRateLimitStore(options: BasicRateLimitOptions): (key: string) => RateLimitDecision {
  const windowMs = clampInteger(options.windowMs, 1_000, 86_400_000, 60_000);
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  return (rawKey: string): RateLimitDecision => {
    const normalizedRawKey = rawKey || 'unknown';
    const max = getMaxForRateLimitKey(normalizedRawKey, options);
    const key = `${options.keyPrefix ?? 'wms'}:${normalizedRawKey}`;
    const currentTime = now();
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > currentTime ? existing : { count: 0, resetAt: currentTime + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= currentTime) buckets.delete(bucketKey);
      }
    }

    const remaining = Math.max(0, max - bucket.count);
    return { allowed: bucket.count <= max, key, limit: max, remaining, resetAt: bucket.resetAt };
  };
}

export function createBasicRateLimitMiddleware(options: BasicRateLimitOptions) {
  const decide = createRateLimitStore(options);

  return (request: RateLimitRequest, response: RateLimitResponse, next: RateLimitNextFunction): void => {
    const decisions = buildRateLimitKeys(request, options).map((key) => decide(key));
    const decision = selectMostRestrictiveDecision(decisions);
    applyRateLimitHeaders(response, decision);

    if (!decision.allowed) {
      options.metrics?.incrementCounter(`rate_limit_blocked_${rateLimitBucketName(decision.key)}_total`);
      options.metrics?.incrementCounter('rate_limit_blocked_total');
      sendRateLimitExceeded(request, response);
      return;
    }

    next();
  };
}

export function createDistributedRateLimitMiddleware(options: DistributedRateLimitOptions) {
  const windowMs = clampInteger(options.windowMs, 1_000, 86_400_000, 60_000);
  const now = options.now ?? Date.now;
  const failOpen = options.failOpen ?? true;

  return async (request: RateLimitRequest, response: RateLimitResponse, next: RateLimitNextFunction): Promise<void> => {
    const keys = buildRateLimitKeys(request, options).map((rawKey) => ({
      key: `${options.keyPrefix ?? 'wms'}:${rawKey}`,
      max: getMaxForRateLimitKey(rawKey, options),
    }));

    try {
      const decisions = await Promise.all(
        keys.map(({ key, max }) => options.store.increment({ key, windowMs, max, now: now() })),
      );
      const decision = selectMostRestrictiveDecision(decisions);
      applyRateLimitHeaders(response, decision);

      if (!decision.allowed) {
        options.metrics?.incrementCounter(`rate_limit_blocked_${rateLimitBucketName(decision.key)}_total`);
        options.metrics?.incrementCounter('rate_limit_blocked_total');
        sendRateLimitExceeded(request, response);
        return;
      }

      next();
    } catch {
      if (failOpen) {
        options.metrics?.incrementCounter('rate_limit_store_unavailable_total');
        next();
        return;
      }

      options.metrics?.incrementCounter('rate_limit_store_unavailable_total');
      response.status(503).json({
        error: {
          code: 'rate_limit_store_unavailable',
          message: 'Rate limit store is unavailable.',
          statusCode: 503,
          timestamp: new Date().toISOString(),
          path: request.originalUrl ?? request.url,
          method: request.method,
        },
      });
    }
  };
}

function applyRateLimitHeaders(response: RateLimitResponse, decision: RateLimitDecision): void {
  response.setHeader('X-RateLimit-Limit', String(decision.limit));
  response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
  response.setHeader('X-RateLimit-Reset', new Date(decision.resetAt).toISOString());
}

function sendRateLimitExceeded(request: RateLimitRequest, response: RateLimitResponse): void {
  response.status(429).json({
    error: {
      code: 'rate_limit_exceeded',
      message: 'Too many requests. Please retry after the current rate limit window resets.',
      statusCode: 429,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      method: request.method,
    },
  });
}

export function buildRateLimitKeys(request: RateLimitRequest, options: Pick<BasicRateLimitOptions, 'trustProxyHops'> = {}): string[] {
  const ip = getClientIpAddress(request, { trustProxyHops: options.trustProxyHops });
  const routeBucket = getRouteBucket(request);
  const keys = [`${routeBucket}:ip:${ip}`];

  if (routeBucket === 'auth-login') {
    const loginIdentifier = readLoginIdentifier(request.body);
    if (loginIdentifier) {
      keys.push(`${routeBucket}:account:${hashRateLimitIdentity(loginIdentifier)}`);
    }
  }

  return Array.from(new Set(keys));
}

function getRouteBucket(request: RateLimitRequest): string {
  const path = normalizePath(request.path ?? request.originalUrl ?? request.url);
  if (path.startsWith('/api/auth/login') || path.startsWith('/auth/login')) return 'auth-login';
  if (path.startsWith('/api/auth/refresh') || path.startsWith('/auth/refresh')) return 'auth-refresh';
  if (path.includes('/webhooks/')) return 'webhook';
  return 'api';
}

function normalizePath(path: string): string {
  return path.split('?')[0] ?? path;
}

function readLoginIdentifier(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  for (const key of ['email', 'username', 'userName', 'login']) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().toLowerCase().slice(0, 320);
    }
  }

  return null;
}

function hashRateLimitIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function getMaxForRateLimitKey(rawKey: string, options: BasicRateLimitOptions): number {
  const routeBucket = rawKey.split(':')[0] ?? 'api';
  const defaultMax = clampInteger(options.max, 1, 100_000, 600);

  switch (routeBucket) {
    case 'auth-login':
      return clampInteger(options.authLoginMax ?? Math.min(defaultMax, 20), 1, 100_000, defaultMax);
    case 'auth-refresh':
      return clampInteger(options.authRefreshMax ?? Math.min(defaultMax, 120), 1, 100_000, defaultMax);
    case 'webhook':
      return clampInteger(options.webhookMax ?? defaultMax, 1, 100_000, defaultMax);
    default:
      return defaultMax;
  }
}

function rateLimitBucketName(key: string): string {
  const parts = key.split(':');
  const bucket = parts.find((part) => ['auth-login', 'auth-refresh', 'webhook', 'api'].includes(part)) ?? 'api';
  return bucket.replace(/-/g, '_');
}

function selectMostRestrictiveDecision(decisions: RateLimitDecision[]): RateLimitDecision {
  return decisions.reduce((selected, current) => {
    if (!selected.allowed && current.allowed) return selected;
    if (selected.allowed && !current.allowed) return current;
    if (current.remaining < selected.remaining) return current;
    if (current.remaining === selected.remaining && current.resetAt > selected.resetAt) return current;
    return selected;
  });
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
