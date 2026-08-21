import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Env } from '../config/env';

interface HttpMetricKey {
  method: string;
  route: string;
  statusCode: number;
}

export interface RuntimeRouteSnapshot {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  totalDurationMs: number;
  averageDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

export interface RuntimeMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  requestsTotal: number;
  errorsTotal: number;
  frontend: FrontendRuntimeSnapshot;
  slowestRoutes: RuntimeRouteSnapshot[];
  performance: RuntimePerformanceSnapshot;
  statusCodeGroups: Record<string, number>;
  workerCounters: Record<string, number>;
  counters: Record<string, number>;
  workerHeartbeat: RuntimeWorkerHeartbeatSnapshot;
}

export interface RuntimePerformanceSnapshot {
  slowRouteWarnMs: number;
  slowRouteCriticalMs: number;
  http5xxRateWarnPerMinute: number;
  recent5xxPerMinute: number;
  slowRequestsTotal: number;
  criticalSlowRequestsTotal: number;
  slowRoutes: RuntimeRouteSnapshot[];
  criticalRoutes: RuntimeRouteSnapshot[];
}

export interface RuntimeWorkerHeartbeatSnapshot {
  lastSeenAt: string | null;
  ageSeconds: number | null;
}

export interface FrontendRuntimeEventInput {
  type: string;
  severity: string;
  route?: string;
  language?: string;
  roleId?: string;
  appVersion?: string;
  occurredAt?: string;
  message?: string;
  source?: string;
  statusCode?: number;
  durationMs?: number;
  browserOnline?: boolean;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface FrontendRuntimeEvent {
  id: string;
  type: string;
  severity: string;
  route: string | null;
  language: string | null;
  roleId: string | null;
  appVersion: string | null;
  occurredAt: string;
  receivedAt: string;
  message: string | null;
  source: string | null;
  statusCode: number | null;
  durationMs: number | null;
  browserOnline: boolean | null;
  userAgent: string | null;
}

export interface FrontendRuntimeSnapshot {
  totalEvents: number;
  recentEvents: FrontendRuntimeEvent[];
  countsByType: Record<string, number>;
  countsBySeverity: Record<string, number>;
  recentErrors: number;
  lastEventAt: string | null;
}

@Injectable()
export class RuntimeMetricsService {
  private readonly startedAt = new Date();
  private readonly httpRequests = new Map<string, number>();
  private readonly httpDurationMs = new Map<string, number>();
  private readonly httpRecentDurationsMs = new Map<string, number[]>();
  private readonly recent5xxTimestamps = new Array<number>();
  private readonly workerCounters = new Map<string, number>();
  private readonly counters = new Map<string, number>();
  private readonly frontendEvents: FrontendRuntimeEvent[] = [];
  private frontendEventSequence = 0;
  private slowRequestsTotal = 0;
  private criticalSlowRequestsTotal = 0;
  private workerLastSeenAt: Date | null = null;

  constructor(
    @Optional() private readonly config?: ConfigService<Env, true>,
  ) {}

  recordHttpRequest(input: HttpMetricKey & { durationMs: number }): void {
    const key = metricKey(input.method, input.route, String(input.statusCode));
    const durationMs = Math.max(0, input.durationMs);
    this.httpRequests.set(key, (this.httpRequests.get(key) ?? 0) + 1);
    this.httpDurationMs.set(key, (this.httpDurationMs.get(key) ?? 0) + durationMs);
    appendRecentDuration(this.httpRecentDurationsMs, key, durationMs);
    if (durationMs >= this.getSlowRouteWarnMs()) {
      this.slowRequestsTotal += 1;
    }
    if (durationMs >= this.getSlowRouteCriticalMs()) {
      this.criticalSlowRequestsTotal += 1;
    }
    if (input.statusCode >= 500) {
      this.recent5xxTimestamps.push(Date.now());
      this.pruneRecent5xx();
    }
  }

  incrementWorkerCounter(name: string, value = 1): void {
    const normalized = normalizeMetricToken(name);
    this.workerCounters.set(normalized, (this.workerCounters.get(normalized) ?? 0) + value);
    this.workerLastSeenAt = new Date();
  }

  incrementCounter(name: string, value = 1): void {
    const normalized = normalizeMetricToken(name);
    this.counters.set(normalized, (this.counters.get(normalized) ?? 0) + value);
  }

  recordFrontendEvent(input: FrontendRuntimeEventInput): FrontendRuntimeEvent {
    const receivedAt = new Date();
    const event: FrontendRuntimeEvent = {
      id: `fe-${receivedAt.getTime().toString(36)}-${(++this.frontendEventSequence).toString(36)}`,
      type: normalizeMetricToken(input.type),
      severity: normalizeMetricToken(input.severity).toLowerCase(),
      route: sanitizeOptional(input.route, 160),
      language: sanitizeOptional(input.language, 12),
      roleId: sanitizeOptional(input.roleId, 80),
      appVersion: sanitizeOptional(input.appVersion, 80),
      occurredAt: normalizeIsoDate(input.occurredAt, receivedAt),
      receivedAt: receivedAt.toISOString(),
      message: sanitizeOptional(input.message, 500),
      source: sanitizeOptional(input.source, 240),
      statusCode: typeof input.statusCode === 'number' ? Math.max(0, Math.min(599, Math.trunc(input.statusCode))) : null,
      durationMs: typeof input.durationMs === 'number' ? Math.max(0, Math.min(120000, Math.trunc(input.durationMs))) : null,
      browserOnline: typeof input.browserOnline === 'boolean' ? input.browserOnline : null,
      userAgent: sanitizeOptional(input.userAgent, 240),
    };
    this.frontendEvents.push(event);
    if (this.frontendEvents.length > 200) {
      this.frontendEvents.splice(0, this.frontendEvents.length - 200);
    }
    this.incrementCounter(`frontend_${event.type}`);
    if (['error', 'critical'].includes(event.severity)) {
      this.incrementCounter('frontend_errors');
    }
    return event;
  }

  getWorkerHeartbeat(): RuntimeWorkerHeartbeatSnapshot {
    return {
      lastSeenAt: this.workerLastSeenAt?.toISOString() ?? null,
      ageSeconds: this.workerLastSeenAt
        ? Math.max(0, Math.floor((Date.now() - this.workerLastSeenAt.getTime()) / 1000))
        : null,
    };
  }

  getRuntimeSnapshot(): RuntimeMetricsSnapshot {
    const routeSnapshots = this.buildRouteSnapshots();
    const slowestRoutes = [...routeSnapshots]
      .sort((left, right) => right.averageDurationMs - left.averageDurationMs)
      .slice(0, 10);
    const performance = this.buildPerformanceSnapshot(routeSnapshots);
    const statusCodeGroups: Record<string, number> = {};
    let requestsTotal = 0;
    let errorsTotal = 0;

    for (const route of routeSnapshots) {
      requestsTotal += route.count;
      const group = `${Math.floor(route.statusCode / 100)}xx`;
      statusCodeGroups[group] = (statusCodeGroups[group] ?? 0) + route.count;
      if (route.statusCode >= 500) {
        errorsTotal += route.count;
      }
    }

    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      requestsTotal,
      errorsTotal,
      frontend: this.getFrontendSnapshot(),
      slowestRoutes,
      performance,
      statusCodeGroups,
      workerCounters: Object.fromEntries(this.workerCounters.entries()),
      counters: Object.fromEntries(this.counters.entries()),
      workerHeartbeat: this.getWorkerHeartbeat(),
    };
  }

  renderPrometheusMetrics(): string {
    const lines: string[] = [
      '# HELP wms_app_uptime_seconds Process uptime for the WMS API.',
      '# TYPE wms_app_uptime_seconds gauge',
      `wms_app_uptime_seconds ${Math.floor((Date.now() - this.startedAt.getTime()) / 1000)}`,
      '# HELP wms_http_requests_total HTTP requests served by the WMS API.',
      '# TYPE wms_http_requests_total counter',
    ];

    for (const [key, count] of this.httpRequests.entries()) {
      const [method = 'UNKNOWN', route = 'unknown', statusCode = '0'] = key.split('|');
      lines.push(
        `wms_http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_code="${escapeLabel(statusCode)}"} ${count}`,
      );
    }

    lines.push(
      '# HELP wms_http_request_duration_ms_sum Total HTTP request duration in milliseconds.',
      '# TYPE wms_http_request_duration_ms_sum counter',
    );
    for (const [key, sum] of this.httpDurationMs.entries()) {
      const [method = 'UNKNOWN', route = 'unknown', statusCode = '0'] = key.split('|');
      lines.push(
        `wms_http_request_duration_ms_sum{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_code="${escapeLabel(statusCode)}"} ${sum.toFixed(3)}`,
      );
    }

    lines.push(
      '# HELP wms_worker_events_total Background worker lifecycle and queue counters.',
      '# TYPE wms_worker_events_total counter',
    );
    for (const [name, count] of this.workerCounters.entries()) {
      lines.push(`wms_worker_events_total{name="${escapeLabel(name)}"} ${count}`);
    }

    lines.push(
      '# HELP wms_runtime_events_total Runtime hardening counters such as rate-limit blocks and readiness warnings.',
      '# TYPE wms_runtime_events_total counter',
    );
    for (const [name, count] of this.counters.entries()) {
      lines.push(`wms_runtime_events_total{name="${escapeLabel(name)}"} ${count}`);
    }
    lines.push(
      '# HELP wms_frontend_runtime_events_total Frontend runtime events reported by the browser.',
      '# TYPE wms_frontend_runtime_events_total counter',
    );
    const frontend = this.getFrontendSnapshot();
    for (const [type, count] of Object.entries(frontend.countsByType)) {
      lines.push(`wms_frontend_runtime_events_total{type="${escapeLabel(type)}"} ${count}`);
    }
    lines.push(
      '# HELP wms_frontend_recent_errors Frontend error or critical events retained in memory.',
      '# TYPE wms_frontend_recent_errors gauge',
      `wms_frontend_recent_errors ${frontend.recentErrors}`,
    );

    const heartbeat = this.getWorkerHeartbeat();
    const performance = this.buildPerformanceSnapshot(this.buildRouteSnapshots());
    lines.push(
      '# HELP wms_queue_worker_last_seen_age_seconds Age of the latest queue worker heartbeat. -1 means no heartbeat yet.',
      '# TYPE wms_queue_worker_last_seen_age_seconds gauge',
      `wms_queue_worker_last_seen_age_seconds ${heartbeat.ageSeconds ?? -1}`,
      '# HELP wms_http_recent_5xx_per_minute Recent HTTP 5xx responses per minute.',
      '# TYPE wms_http_recent_5xx_per_minute gauge',
      `wms_http_recent_5xx_per_minute ${performance.recent5xxPerMinute}`,
      '# HELP wms_http_slow_requests_total HTTP requests slower than the configured warning threshold.',
      '# TYPE wms_http_slow_requests_total counter',
      `wms_http_slow_requests_total ${performance.slowRequestsTotal}`,
      '# HELP wms_http_critical_slow_requests_total HTTP requests slower than the configured critical threshold.',
      '# TYPE wms_http_critical_slow_requests_total counter',
      `wms_http_critical_slow_requests_total ${performance.criticalSlowRequestsTotal}`,
    );

    return `${lines.join('\n')}\n`;
  }

  private buildRouteSnapshots(): RuntimeRouteSnapshot[] {
    return [...this.httpRequests.entries()].map(([key, count]) => {
      const [method = 'UNKNOWN', route = 'unknown', statusCodeText = '0'] = key.split('|');
      const totalDurationMs = this.httpDurationMs.get(key) ?? 0;
      const recentDurations = this.httpRecentDurationsMs.get(key) ?? [];
      return {
        method,
        route,
        statusCode: Number(statusCodeText),
        count,
        totalDurationMs: Number(totalDurationMs.toFixed(3)),
        averageDurationMs: Number((totalDurationMs / Math.max(1, count)).toFixed(3)),
        p95DurationMs: percentile(recentDurations, 0.95),
        p99DurationMs: percentile(recentDurations, 0.99),
      };
    });
  }

  private getFrontendSnapshot(): FrontendRuntimeSnapshot {
    const countsByType: Record<string, number> = {};
    const countsBySeverity: Record<string, number> = {};
    let recentErrors = 0;

    for (const event of this.frontendEvents) {
      countsByType[event.type] = (countsByType[event.type] ?? 0) + 1;
      countsBySeverity[event.severity] = (countsBySeverity[event.severity] ?? 0) + 1;
      if (['error', 'critical'].includes(event.severity)) {
        recentErrors += 1;
      }
    }

    return {
      totalEvents: this.frontendEventSequence,
      recentEvents: [...this.frontendEvents].slice(-20).reverse(),
      countsByType,
      countsBySeverity,
      recentErrors,
      lastEventAt: this.frontendEvents[this.frontendEvents.length - 1]?.receivedAt ?? null,
    };
  }

  private buildPerformanceSnapshot(routeSnapshots: RuntimeRouteSnapshot[]): RuntimePerformanceSnapshot {
    const slowRouteWarnMs = this.getSlowRouteWarnMs();
    const slowRouteCriticalMs = this.getSlowRouteCriticalMs();
    this.pruneRecent5xx();

    return {
      slowRouteWarnMs,
      slowRouteCriticalMs,
      http5xxRateWarnPerMinute: this.getHttp5xxRateWarnPerMinute(),
      recent5xxPerMinute: this.recent5xxTimestamps.length,
      slowRequestsTotal: this.slowRequestsTotal,
      criticalSlowRequestsTotal: this.criticalSlowRequestsTotal,
      slowRoutes: routeSnapshots
        .filter((route) => route.p95DurationMs >= slowRouteWarnMs || route.averageDurationMs >= slowRouteWarnMs)
        .sort((left, right) => Math.max(right.p95DurationMs, right.averageDurationMs) - Math.max(left.p95DurationMs, left.averageDurationMs))
        .slice(0, 10),
      criticalRoutes: routeSnapshots
        .filter((route) => route.p99DurationMs >= slowRouteCriticalMs || route.averageDurationMs >= slowRouteCriticalMs)
        .sort((left, right) => Math.max(right.p99DurationMs, right.averageDurationMs) - Math.max(left.p99DurationMs, left.averageDurationMs))
        .slice(0, 10),
    };
  }

  private pruneRecent5xx(): void {
    const cutoff = Date.now() - 60_000;
    while (this.recent5xxTimestamps.length > 0 && (this.recent5xxTimestamps[0] ?? 0) < cutoff) {
      this.recent5xxTimestamps.shift();
    }
  }

  private getSlowRouteWarnMs(): number {
    return this.config?.get('SLOW_ROUTE_WARN_MS', { infer: true }) ?? 1000;
  }

  private getSlowRouteCriticalMs(): number {
    return this.config?.get('SLOW_ROUTE_CRITICAL_MS', { infer: true }) ?? 3000;
  }

  private getHttp5xxRateWarnPerMinute(): number {
    return this.config?.get('HTTP_5XX_RATE_WARN_PER_MINUTE', { infer: true }) ?? 10;
  }
}

function appendRecentDuration(target: Map<string, number[]>, key: string, durationMs: number): void {
  const durations = target.get(key) ?? [];
  durations.push(durationMs);
  if (durations.length > 200) {
    durations.splice(0, durations.length - 200);
  }
  target.set(key, durations);
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return Number((sorted[index] ?? 0).toFixed(3));
}

function metricKey(method: string, route: string, statusCode: string): string {
  return [normalizeMetricToken(method).toUpperCase(), normalizeRoute(route), statusCode].join('|');
}

function normalizeRoute(route: string): string {
  const path = route.split('?')[0] ?? '/';
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':uuid')
    .replace(/\d+/g, ':id')
    .slice(0, 200);
}

function normalizeMetricToken(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_:-]+/g, '_');
  return normalized || 'unknown';
}

function sanitizeOptional(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeIsoDate(value: unknown, fallback: Date): string {
  if (typeof value !== 'string') {
    return fallback.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
