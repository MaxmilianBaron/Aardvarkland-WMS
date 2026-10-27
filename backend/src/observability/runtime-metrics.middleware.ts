import { RuntimeMetricsService } from './runtime-metrics.service';

interface MetricsRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
}

interface MetricsResponse {
  statusCode?: number;
  once(event: 'finish', listener: () => void): void;
}

export function createRuntimeMetricsMiddleware(metrics: RuntimeMetricsService) {
  return (request: MetricsRequest, response: MetricsResponse, next: () => void): void => {
    const started = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      metrics.recordHttpRequest({
        method: request.method ?? 'UNKNOWN',
        route: request.originalUrl ?? request.url ?? '/',
        statusCode: response.statusCode ?? 0,
        durationMs,
      });
    });
    next();
  };
}
