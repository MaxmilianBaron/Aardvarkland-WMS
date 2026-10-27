import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

import { getRequestIdFromRequest } from '../common';
import { RealtimeBroadcasterService } from './realtime-broadcaster.service';

interface MutationRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}

@Injectable()
export class MutationRealtimeInterceptor implements NestInterceptor {
  constructor(private readonly realtime: RealtimeBroadcasterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<MutationRequest>();
    const warehouseReference = getWarehouseReference(request);

    if (!warehouseReference || !isMutation(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.realtime.publish(warehouseReference, {
          type: 'warehouse.mutation',
          data: {
            method: request.method?.toUpperCase() ?? 'UNKNOWN',
            path: sanitizePath(request.originalUrl ?? request.url ?? '/'),
            requestId: getRequestIdFromRequest(request),
          },
        });
      }),
    );
  }
}

function isMutation(method: string | undefined): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method?.toUpperCase() ?? '');
}

function getWarehouseReference(request: MutationRequest): string | null {
  return (
    readString(request.params, 'warehouseId') ??
    readString(request.params, 'warehouseCode') ??
    readString(request.query, 'warehouseId') ??
    readString(request.query, 'warehouseCode') ??
    readBodyString(request.body, 'warehouseId') ??
    readBodyString(request.body, 'warehouseCode') ??
    readHeader(request.headers, 'x-warehouse-id') ??
    readHeader(request.headers, 'x-warehouse-code') ??
    null
  );
}

function readString(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBodyString(body: unknown, key: string): string | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? readString(body as Record<string, unknown>, key)
    : null;
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = headers[key];
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized?.trim() || null;
}

function sanitizePath(value: string): string {
  return (value.split('?')[0] ?? '/').slice(0, 240);
}
