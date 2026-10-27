import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

import { buildApiErrorResponse } from '../api-error.helpers';
import { REQUEST_ID_HEADER, getRequestIdFromRequest } from '../request-id.middleware';

interface HttpRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface HttpResponseLike {
  status(statusCode: number): HttpResponseLike;
  setHeader(name: string, value: string): void;
  json(body: unknown): unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequestLike>();
    const response = context.getResponse<HttpResponseLike>();
    const requestId = getRequestIdFromRequest(request);
    const body = buildApiErrorResponse({
      error: exception,
      path: request.originalUrl ?? request.url ?? '',
      method: request.method ?? 'GET',
      requestId,
    });

    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(body.error.statusCode).json(body);
  }
}
