import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

import { getApiVersionFromRequest, isVersionedApiRequest } from './api-version.middleware';
import { getRequestIdFromRequest } from './request-id.middleware';

export interface ApiSuccessEnvelope<T = unknown> {
  data: T;
  meta: {
    apiVersion: string;
    requestId: string;
    timestamp: string;
  };
}

interface RequestLike {
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}

@Injectable()
export class ApiResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();

    return next.handle().pipe(
      map((body) => (shouldEnvelopeResponse(request, body) ? buildApiSuccessEnvelope(body, request) : body)),
    );
  }
}

export function buildApiSuccessEnvelope<T>(body: T, request: RequestLike, timestamp = new Date()): ApiSuccessEnvelope<T> {
  return {
    data: body,
    meta: {
      apiVersion: getApiVersionFromRequest(request),
      requestId: getRequestIdFromRequest(request),
      timestamp: timestamp.toISOString(),
    },
  };
}

export function shouldEnvelopeResponse(request: RequestLike, body: unknown): boolean {
  if (body === undefined || isAlreadyEnveloped(body)) {
    return false;
  }

  const path = request.originalUrl ?? request.url ?? '';

  if (path === '/' || path.startsWith('/docs')) {
    return false;
  }

  return isVersionedApiRequest(request) || readsTrue(request.headers?.['x-response-envelope']) || readsTrue(request.query?.['envelope']);
}

function isAlreadyEnveloped(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'data' in value && 'meta' in value;
}

function readsTrue(value: unknown): boolean {
  const normalized = Array.isArray(value) ? value[0] : value;

  return typeof normalized === 'string' && ['1', 'true', 'yes'].includes(normalized.trim().toLowerCase());
}
