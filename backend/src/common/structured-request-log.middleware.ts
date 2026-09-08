import { getClientIpAddress } from './request-ip.helpers';
import { REQUEST_ID_HEADER, getRequestIdFromRequest } from './request-id.middleware';
import { redactLogValue, redactUrlQuery } from './log-redaction.helpers';

interface StructuredLogRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { id?: string; warehouses?: Array<{ warehouseId?: string; warehouseCode?: string }> };
}

interface StructuredLogResponse {
  statusCode?: number;
  once(event: 'finish', listener: () => void): void;
  setHeader?(name: string, value: string): void;
}

export interface StructuredRequestLogOptions {
  enabled: boolean;
  service: string;
  version: string;
  releaseSha: string;
  environment: string;
  trustProxyHops?: number;
}

export function createStructuredRequestLogMiddleware(options: StructuredRequestLogOptions) {
  return (request: StructuredLogRequest, response: StructuredLogResponse, next: () => void): void => {
    if (!options.enabled) {
      next();
      return;
    }

    const started = process.hrtime.bigint();
    response.once('finish', () => {
      const statusCode = response.statusCode ?? 0;
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const requestId = getRequestIdFromRequest(request);
      response.setHeader?.(REQUEST_ID_HEADER, requestId);
      const logRecord = redactLogValue({
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
        service: options.service,
        version: options.version,
        releaseSha: options.releaseSha,
        environment: options.environment,
        requestId,
        http: {
          method: request.method ?? 'UNKNOWN',
          route: redactUrlQuery(request.originalUrl ?? request.url ?? '/'),
          statusCode,
          durationMs: Number(durationMs.toFixed(3)),
          userAgent: readHeader(request.headers, 'user-agent') ?? null,
          ipAddress: getClientIpAddress(
            { headers: request.headers ?? {}, ip: request.ip, socket: request.socket },
            { trustProxyHops: options.trustProxyHops },
          ),
        },
        actor: {
          userId: request.user?.id ?? null,
          warehouseIds: request.user?.warehouses?.map((warehouse) => warehouse.warehouseId).filter(Boolean) ?? [],
          warehouseCodes: request.user?.warehouses?.map((warehouse) => warehouse.warehouseCode).filter(Boolean) ?? [],
        },
      });

      writeStructuredLog(logRecord);
    });

    next();
  };
}

function writeStructuredLog(record: unknown): void {
  const line = JSON.stringify(record);
  const level = typeof record === 'object' && record && 'level' in record
    ? String((record as { level?: unknown }).level)
    : 'info';

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = headers?.[key];
  return Array.isArray(value) ? value[0] : value;
}
