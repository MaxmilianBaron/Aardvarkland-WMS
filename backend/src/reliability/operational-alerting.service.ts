import { Injectable } from '@nestjs/common';

import { RuntimeMetricsService } from '../observability';
import { OperationalAlert, OperationalAlertSnapshot } from './reliability.types';
import { OperationalStatusService } from './operational-status.service';
import { RecoveryStatusService } from './recovery-status.service';
import { RetentionCleanupService } from './retention-cleanup.service';
import { StartupPreflightService } from './startup-preflight.service';

@Injectable()
export class OperationalAlertingService {
  constructor(
    private readonly operationalStatus: OperationalStatusService,
    private readonly startupPreflight: StartupPreflightService,
    private readonly retentionCleanup: RetentionCleanupService,
    private readonly recoveryStatus: RecoveryStatusService,
    private readonly runtimeMetrics: RuntimeMetricsService,
  ) {}

  async getAlertSnapshot(): Promise<OperationalAlertSnapshot> {
    const generatedAt = new Date().toISOString();
    const [status, retentionStatus, recovery] = await Promise.all([
      this.operationalStatus.getStatus(),
      this.retentionCleanup.getStatus(),
      this.recoveryStatus.getStatus(),
    ]);
    const alerts: OperationalAlert[] = status.incidents.map((incident) => ({
      key: incident.key,
      source: 'operational-status',
      severity: incident.severity,
      title: incident.title,
      detail: incident.detail,
      action: incident.action,
      count: incident.count,
      detectedAt: incident.detectedAt,
    }));

    const startup = this.startupPreflight.getSnapshot();
    for (const check of startup?.checks ?? []) {
      if (check.status === 'ok') continue;
      alerts.push({
        key: `startup-${check.name}`,
        source: 'startup-preflight',
        severity: check.status === 'fail' ? 'critical' : 'warning',
        title: `Startup preflight: ${check.name}`,
        detail: typeof check.detail === 'string' ? check.detail : `Startup preflight check ${check.name} reported ${check.status}.`,
        action: 'Resolve startup preflight checks before accepting production warehouse traffic.',
        detectedAt: startup?.checkedAt ?? generatedAt,
      });
    }

    if (retentionStatus.preview.totalEligible > retentionStatus.batchSize * 5) {
      alerts.push({
        key: 'retention-backlog',
        source: 'retention-cleanup',
        severity: 'warning',
        title: 'Retention cleanup backlog',
        detail: `${retentionStatus.preview.totalEligible} old terminal record(s) are eligible for cleanup.`,
        action: 'Confirm retention settings and run cleanup through the reliability panel or queue worker.',
        count: retentionStatus.preview.totalEligible,
        detectedAt: generatedAt,
      });
    }

    for (const [name, check] of Object.entries({ backup: recovery.backup, restoreDrill: recovery.restoreDrill })) {
      if (check.status === 'ok') continue;
      alerts.push({
        key: `recovery-${name}`,
        source: 'recovery',
        severity: check.required ? 'critical' : 'warning',
        title: name === 'backup' ? 'Backup readiness is stale' : 'Restore drill is missing or stale',
        detail: check.detail ?? `${name} recovery readiness check reported a warning.`,
        action: name === 'backup'
          ? 'Run the local backup job and confirm the SHA256 manifest is recorded.'
          : 'Run a restore drill into a non-production database and record the report.',
        detectedAt: recovery.generatedAt,
      });
    }

    const runtime = this.runtimeMetrics.getRuntimeSnapshot();
    const criticalRoute = runtime.performance.criticalRoutes[0];
    const slowRoute = runtime.performance.slowRoutes[0];
    if (criticalRoute) {
      alerts.push({
        key: 'performance-critical-route-latency',
        source: 'runtime-metrics',
        severity: 'critical',
        title: 'Critical route latency',
        detail: `${criticalRoute.method} ${criticalRoute.route} p99=${criticalRoute.p99DurationMs}ms exceeds ${runtime.performance.slowRouteCriticalMs}ms.`,
        action: 'Check database/index health, queue pressure, and recent deployment changes.',
        detectedAt: generatedAt,
      });
    } else if (slowRoute) {
      alerts.push({
        key: 'performance-slow-route-latency',
        source: 'runtime-metrics',
        severity: 'warning',
        title: 'Slow route latency',
        detail: `${slowRoute.method} ${slowRoute.route} p95=${slowRoute.p95DurationMs}ms exceeds ${runtime.performance.slowRouteWarnMs}ms.`,
        action: 'Review runtime metrics and database query plans for the slowest route.',
        detectedAt: generatedAt,
      });
    }

    if (runtime.performance.recent5xxPerMinute >= runtime.performance.http5xxRateWarnPerMinute) {
      alerts.push({
        key: 'performance-5xx-rate',
        source: 'runtime-metrics',
        severity: runtime.performance.recent5xxPerMinute >= runtime.performance.http5xxRateWarnPerMinute * 2
          ? 'critical'
          : 'warning',
        title: 'Elevated API 5xx rate',
        detail: `${runtime.performance.recent5xxPerMinute} HTTP 5xx response(s) were recorded in the last minute.`,
        action: 'Inspect structured logs, readiness checks, and dependency failures before continuing rollout.',
        detectedAt: generatedAt,
      });
    }

    const snapshotStatus = alerts.some((alert) => alert.severity === 'critical')
      ? 'fail'
      : alerts.some((alert) => alert.severity === 'warning')
        ? 'degraded'
        : 'ok';

    return {
      status: snapshotStatus,
      generatedAt,
      alertCount: alerts.length,
      alerts,
    };
  }
}
