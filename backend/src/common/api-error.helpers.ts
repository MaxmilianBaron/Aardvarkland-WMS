import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorDetail {
  field?: string;
  code?: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
    path: string;
    method: string;
    requestId: string;
    details: ApiErrorDetail[];
  };
}

export interface BuildApiErrorInput {
  error: unknown;
  path: string;
  method: string;
  requestId: string;
  timestamp?: Date;
}

export function buildApiErrorResponse(input: BuildApiErrorInput): ApiErrorResponse {
  const statusCode = getStatusCode(input.error);
  const exceptionResponse = getExceptionResponse(input.error);

  return {
    error: {
      code: getErrorCode(input.error, statusCode),
      message: getErrorMessage(input.error, exceptionResponse, statusCode),
      statusCode,
      timestamp: (input.timestamp ?? new Date()).toISOString(),
      path: input.path,
      method: input.method.toUpperCase(),
      requestId: input.requestId,
      details: getErrorDetails(exceptionResponse, statusCode),
    },
  };
}

export function getStatusCode(error: unknown): number {
  return error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
}

export function getErrorCode(error: unknown, statusCode = getStatusCode(error)): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();

    if (isRecord(response) && typeof response['code'] === 'string') {
      return normalizeErrorCode(response['code']);
    }
  }

  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${statusCode}`;
  }
}

function getExceptionResponse(error: unknown): unknown {
  return error instanceof HttpException ? error.getResponse() : null;
}

function getErrorMessage(error: unknown, exceptionResponse: unknown, statusCode: number): string {
  if (statusCode >= 500) {
    return 'Unexpected server error';
  }

  if (isRecord(exceptionResponse)) {
    const rawMessage = exceptionResponse['message'];

    if (typeof rawMessage === 'string' && rawMessage.trim().length > 0) {
      return rawMessage;
    }

    if (Array.isArray(rawMessage) && rawMessage.length > 0) {
      return 'Validation failed';
    }

    if (typeof exceptionResponse['error'] === 'string' && exceptionResponse['error'].trim().length > 0) {
      return exceptionResponse['error'];
    }
  }

  if (typeof exceptionResponse === 'string' && exceptionResponse.trim().length > 0) {
    return exceptionResponse;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unexpected server error';
}

function getErrorDetails(exceptionResponse: unknown, statusCode: number): ApiErrorDetail[] {
  if (statusCode >= 500) {
    return [];
  }

  if (!isRecord(exceptionResponse)) {
    return [];
  }

  const rawMessage = exceptionResponse['message'];

  if (Array.isArray(rawMessage)) {
    return rawMessage.map((message) => ({ message: String(message) }));
  }

  const rawDetails = exceptionResponse['details'];

  if (Array.isArray(rawDetails)) {
    return rawDetails.map(normalizeDetail);
  }

  return [];
}

function normalizeDetail(value: unknown): ApiErrorDetail {
  if (!isRecord(value)) {
    return { message: String(value) };
  }

  return {
    field: typeof value['field'] === 'string' ? value['field'] : undefined,
    code: typeof value['code'] === 'string' ? normalizeErrorCode(value['code']) : undefined,
    message: typeof value['message'] === 'string' ? value['message'] : JSON.stringify(value),
  };
}

function normalizeErrorCode(value: string): string {
  return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
