export const API_LEGACY_PREFIX = '/api';
export const API_V1_PREFIX = '/api/v1';
export const API_VERSION_HEADER = 'x-api-version';

interface RequestLike {
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

export function createApiVersionRewriteMiddleware() {
  return (request: RequestLike, response: ResponseLike, next: () => void): void => {
    const originalUrl = request.originalUrl ?? request.url ?? '';
    const requestUrl = request.url ?? '';
    const isVersionedRequest = startsWithPrefix(originalUrl, API_V1_PREFIX) || startsWithPrefix(requestUrl, API_V1_PREFIX);

    if (isVersionedRequest && request.url) {
      request.url = rewritePrefix(request.url, API_V1_PREFIX, API_LEGACY_PREFIX);
    }

    (request as { apiVersion?: string }).apiVersion = isVersionedRequest ? '1' : getHeaderVersion(request) ?? 'legacy';
    response.setHeader(API_VERSION_HEADER, isVersionedRequest ? '1' : 'legacy');
    next();
  };
}

export function getApiVersionFromRequest(request: RequestLike): string {
  const existing = (request as { apiVersion?: unknown }).apiVersion;

  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }

  return startsWithPrefix(request.originalUrl ?? request.url ?? '', API_V1_PREFIX) ? '1' : 'legacy';
}

export function isVersionedApiRequest(request: RequestLike): boolean {
  return getApiVersionFromRequest(request) !== 'legacy' || startsWithPrefix(request.originalUrl ?? request.url ?? '', API_V1_PREFIX);
}

function getHeaderVersion(request: RequestLike): string | null {
  const raw = request.headers?.[API_VERSION_HEADER] ?? request.headers?.[API_VERSION_HEADER.toUpperCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  return value;
}

function startsWithPrefix(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`);
}

function rewritePrefix(value: string, fromPrefix: string, toPrefix: string): string {
  if (value === fromPrefix) {
    return toPrefix;
  }

  if (value.startsWith(`${fromPrefix}/`) || value.startsWith(`${fromPrefix}?`)) {
    return `${toPrefix}${value.slice(fromPrefix.length)}`;
  }

  return value;
}
