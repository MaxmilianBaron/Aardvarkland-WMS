import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

export type NextFunctionLike = () => void;

export function createRequestIdMiddleware() {
  return (request: RequestLike, response: ResponseLike, next: NextFunctionLike): void => {
    const requestId = getRequestIdFromRequest(request);
    setRequestIdOnRequest(request, requestId);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  };
}

export function getRequestIdFromRequest(request: RequestLike): string {
  const raw = request.headers?.[REQUEST_ID_HEADER] ?? request.headers?.[REQUEST_ID_HEADER.toUpperCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value === 'string' && isSafeRequestId(value)) {
    return value;
  }

  const existing = (request as { requestId?: unknown }).requestId;

  if (typeof existing === 'string' && isSafeRequestId(existing)) {
    return existing;
  }

  return randomUUID();
}

function setRequestIdOnRequest(request: RequestLike, requestId: string): void {
  (request as { requestId?: string }).requestId = requestId;
}

function isSafeRequestId(value: string): boolean {
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(value);
}
