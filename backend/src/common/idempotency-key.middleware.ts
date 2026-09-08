export interface IdempotencyRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  method: string;
  originalUrl?: string;
  path?: string;
  url: string;
}

interface IdempotencyResponse {
  status(code: number): { json(body: unknown): void };
}

type IdempotencyNextFunction = () => void;

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Only routes whose service layer actually consumes idempotencyKey belong here.
// A header requirement without replay/deduplication is a false guarantee and can
// make callers assume that retries are safe when the operation may run twice.
const CRITICAL_WRITE_PATTERNS: RegExp[] = [
  /^\/warehouses\/[^/]+\/inbound-shipments\/[^/]+\/receive$/,
  /^\/warehouses\/[^/]+\/inventory\/quants\/(receive|move|adjust|[^/]+\/block|[^/]+\/unblock)$/,
  /^\/warehouses\/[^/]+\/print\/jobs$/,
  /^\/warehouses\/[^/]+\/print-jobs$/,
  /^\/warehouses\/[^/]+\/print-jobs\/[^/]+\/reprint$/,
  /^\/warehouses\/[^/]+\/parcels\/[^/]+\/labels\/print-jobs$/,
  /^\/warehouses\/[^/]+\/label-print-jobs\/[^/]+\/reprint$/,
];

export function createIdempotencyKeyRequiredMiddleware() {
  return (request: IdempotencyRequest, response: IdempotencyResponse, next: IdempotencyNextFunction): void => {
    if (!isIdempotencyKeyRequired(request.method, request.originalUrl ?? request.path ?? request.url)) {
      next();
      return;
    }

    const key = readHeader(request.headers, 'idempotency-key');
    if (key.trim().length > 0) {
      attachIdempotencyKeyToBody(request, key.trim());
      next();
      return;
    }

    response.status(428).json({
      error: {
        code: 'idempotency_key_required',
        message: 'Idempotency-Key header is required for this operation.',
        statusCode: 428,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
        method: request.method,
      },
    });
  };
}

function attachIdempotencyKeyToBody(request: IdempotencyRequest, key: string): void {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    return;
  }

  const body = request.body as Record<string, unknown>;
  body['idempotencyKey'] = key;
}

export function isIdempotencyKeyRequired(method: string, rawPath: string): boolean {
  if (!UNSAFE_METHODS.has(method.trim().toUpperCase())) {
    return false;
  }

  const path = normalizeApiPath(rawPath);
  return CRITICAL_WRITE_PATTERNS.some((pattern) => pattern.test(path));
}

function normalizeApiPath(rawPath: string): string {
  let path = rawPath.split('?')[0]?.trim().toLowerCase() ?? '/';
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  path = path.replace(/^\/api(?=\/|$)/, '');
  path = path.replace(/^\/v\d+(?=\/|$)/, '');
  return path || '/';
}

function readHeader(headers: IdempotencyRequest['headers'], name: string): string {
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) {
    return direct[0] ?? '';
  }
  return direct ?? '';
}
