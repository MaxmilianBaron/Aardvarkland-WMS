import { languageLocale, pickLanguage } from '../../core/i18n/i18n';
import { useMemo, useState } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ResourceFreshness } from '../../components/ui/ResourceFreshness';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import {
  acknowledgeReliabilityIncident,
  deliverReliabilityAlerts,
  getReadiness,
  getReliabilityAlertDeliveries,
  getReliabilityAlerts,
  getReliabilityIncidents,
  getReliabilityRecovery,
  getReliabilityRetention,
  getRuntimeSnapshot,
  getStartupHealth,
  refreshStartupPreflight,
  resolveReliabilityIncident,
  runReliabilityRetention,
} from '../../core/api/wms';
import type { Severity } from '../../core/types/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface AlertRow {
  key: string;
  source: string;
  severity: string;
  title: string;
  detail: string;
  action: string;
  count: number | null;
  detectedAt: string;
}

interface AlertSnapshot {
  status: string;
  generatedAt: string;
  alertCount: number;
  alerts: AlertRow[];
}

interface IncidentState {
  status: string;
  note: string;
  acknowledgedByDisplayName: string;
  acknowledgedAt: string;
  resolvedByDisplayName: string;
  resolvedAt: string;
}

interface IncidentRow {
  key: string;
  severity: string;
  title: string;
  detail: string;
  action: string;
  count: number | null;
  detectedAt: string;
  state: IncidentState;
}

interface IncidentSnapshot {
  status: string;
  generatedAt: string;
  incidents: IncidentRow[];
}

interface AlertDeliveryRow {
  alertKey: string;
  channel: string;
  severity: string;
  title: string;
  lastStatus: string;
  lastSentAt: string;
  lastSeenAt: string;
  sentCount: number;
  error: string;
}

interface RecoveryCheck {
  status: string;
  required: boolean;
  ageSeconds: number | null;
  lastSuccessfulAt: string;
  artifact: string;
  sizeBytes: number | null;
  sha256: string;
  targetDatabase: string;
  tableCount: number | null;
  detail: string;
}

interface RecoverySnapshot {
  status: string;
  generatedAt: string;
  backup: RecoveryCheck;
  restoreDrill: RecoveryCheck;
}

interface RuntimeRoute {
  method: string;
  route: string;
  p95DurationMs: number;
  p99DurationMs: number;
}

interface RuntimeSnapshot {
  frontend: {
    totalEvents: number;
    recentErrors: number;
    lastEventAt: string | null;
    countsByType: Record<string, number>;
    countsBySeverity: Record<string, number>;
    recentEvents: FrontendEventRow[];
  };
  performance: {
    slowRouteWarnMs: number;
    slowRouteCriticalMs: number;
    http5xxRateWarnPerMinute: number;
    recent5xxPerMinute: number;
    slowRequestsTotal: number;
    criticalSlowRequestsTotal: number;
    slowRoutes: RuntimeRoute[];
    criticalRoutes: RuntimeRoute[];
  };
}

interface FrontendEventRow {
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
}

interface HealthCheckRow {
  name: string;
  status: string;
  detail: string;
}

interface HealthSnapshot {
  status: string;
  checks: HealthCheckRow[];
}

interface RetentionItem {
  key: string;
  table: string;
  description: string;
  retentionDays: number;
  eligibleCount: number;
  deletedCount: number;
  skipped: boolean;
}

interface RetentionSnapshot {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  lastRun: { finishedAt: string; totalDeleted: number } | null;
  preview: {
    totalEligible: number;
    totalDeleted: number;
    items: RetentionItem[];
  };
}

const emptyAlerts: AlertSnapshot = { status: 'ok', generatedAt: '', alertCount: 0, alerts: [] };
const emptyIncidents: IncidentSnapshot = { status: 'ok', generatedAt: '', incidents: [] };
const emptyDeliveries: AlertDeliveryRow[] = [];
const emptyHealth: HealthSnapshot = { status: 'ok', checks: [] };
const emptyRecoveryCheck: RecoveryCheck = {
  status: 'ok',
  required: false,
  ageSeconds: null,
  lastSuccessfulAt: '',
  artifact: '',
  sizeBytes: null,
  sha256: '',
  targetDatabase: '',
  tableCount: null,
  detail: '',
};
const emptyRecovery: RecoverySnapshot = {
  status: 'ok',
  generatedAt: '',
  backup: emptyRecoveryCheck,
  restoreDrill: emptyRecoveryCheck,
};
const emptyRuntime: RuntimeSnapshot = {
  frontend: {
    totalEvents: 0,
    recentErrors: 0,
    lastEventAt: null,
    countsByType: {},
    countsBySeverity: {},
    recentEvents: [],
  },
  performance: {
    slowRouteWarnMs: 1000,
    slowRouteCriticalMs: 3000,
    http5xxRateWarnPerMinute: 10,
    recent5xxPerMinute: 0,
    slowRequestsTotal: 0,
    criticalSlowRequestsTotal: 0,
    slowRoutes: [],
    criticalRoutes: [],
  },
};
const emptyRetention: RetentionSnapshot = {
  enabled: false,
  intervalSeconds: 0,
  batchSize: 0,
  lastRun: null,
  preview: { totalEligible: 0, totalDeleted: 0, items: [] },
};

export function ReliabilityPage() {
  const { language, can } = useWorkspace();
  const [incidentNotes, setIncidentNotes] = useState<Record<string, string>>({});
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const locale = languageLocale(language);
  const canRunJobs = can('job.manage');
  const alerts = useApiResource<AlertSnapshot>({
    fallback: emptyAlerts,
    productionFallback: emptyAlerts,
    loader: () => getReliabilityAlerts<unknown>(),
    map: mapAlerts,
  });
  const startup = useApiResource<HealthSnapshot>({
    fallback: emptyHealth,
    productionFallback: emptyHealth,
    loader: () => getStartupHealth<unknown>(),
    map: mapHealth,
  });
  const incidents = useApiResource<IncidentSnapshot>({
    fallback: emptyIncidents,
    productionFallback: emptyIncidents,
    loader: () => getReliabilityIncidents<unknown>(),
    map: mapIncidents,
  });
  const deliveries = useApiResource<AlertDeliveryRow[]>({
    fallback: emptyDeliveries,
    productionFallback: emptyDeliveries,
    loader: () => getReliabilityAlertDeliveries<unknown>(),
    map: mapAlertDeliveries,
  });
  const recovery = useApiResource<RecoverySnapshot>({
    fallback: emptyRecovery,
    productionFallback: emptyRecovery,
    loader: () => getReliabilityRecovery<unknown>(),
    map: mapRecovery,
  });
  const runtime = useApiResource<RuntimeSnapshot>({
    fallback: emptyRuntime,
    productionFallback: emptyRuntime,
    loader: () => getRuntimeSnapshot<unknown>(),
    map: mapRuntime,
    refreshIntervalMs: 30000,
    staleAfterMs: 90000,
  });
  const readiness = useApiResource<HealthSnapshot>({
    fallback: emptyHealth,
    productionFallback: emptyHealth,
    loader: () => getReadiness<unknown>(),
    map: mapHealth,
  });
  const retention = useApiResource<RetentionSnapshot>({
    fallback: emptyRetention,
    productionFallback: emptyRetention,
    loader: () => getReliabilityRetention<unknown>(),
    map: mapRetention,
  });
  const mutation = useApiMutation();

  const alertColumns = useMemo<Column<AlertRow>[]>(() => [
    {
      key: 'severity',
      label: text.columns.severity,
      render: (row) => <Badge tone={severityTone(row.severity)}>{severityLabel(row.severity, language)}</Badge>,
    },
    {
      key: 'issue',
      label: text.columns.issue,
      render: (row) => <div><strong>{row.title}</strong><small>{row.detail}</small></div>,
    },
    {
      key: 'action',
      label: text.columns.action,
      render: (row) => <span>{row.action}</span>,
    },
  ], [language, text]);

  const retentionColumns = useMemo<Column<RetentionItem>[]>(() => [
    { key: 'table', label: text.retention.table, render: (row) => <div><strong>{row.table}</strong><small>{row.description}</small></div> },
    { key: 'days', label: text.retention.days, align: 'right', render: (row) => row.retentionDays },
    { key: 'eligible', label: text.retention.eligible, align: 'right', render: (row) => row.skipped ? text.retention.skipped : row.eligibleCount },
  ], [text]);

  const frontendColumns = useMemo<Column<FrontendEventRow>[]>(() => [
    { key: 'type', label: text.frontend.type, render: (row) => <div><strong>{frontendTypeLabel(row.type, language)}</strong><small>{row.route ?? text.frontend.noRoute}</small></div> },
    { key: 'severity', label: text.columns.severity, render: (row) => <Badge tone={frontendSeverityTone(row.severity)}>{frontendSeverityLabel(row.severity, language)}</Badge> },
    { key: 'message', label: text.frontend.message, render: (row) => <span>{row.message ?? row.source ?? text.frontend.noMessage}</span> },
    { key: 'received', label: text.frontend.received, render: (row) => <span>{formatDate(row.receivedAt, locale)}</span> },
  ], [language, locale, text]);

  const incidentColumns = useMemo<Column<IncidentRow>[]>(() => [
    {
      key: 'severity',
      label: text.columns.severity,
      render: (row) => <Badge tone={severityTone(row.severity)}>{severityLabel(row.severity, language)}</Badge>,
    },
    {
      key: 'issue',
      label: text.columns.issue,
      render: (row) => <div><strong>{row.title}</strong><small>{row.detail}</small></div>,
    },
    {
      key: 'owner',
      label: text.incidents.owner,
      render: (row) => (
        <div>
          <Badge tone={incidentStateTone(row.state.status)}>{incidentStateLabel(row.state.status, language)}</Badge>
          <small>{incidentOwner(row.state, text)}</small>
        </div>
      ),
    },
    {
      key: 'response',
      label: text.incidents.response,
      render: (row) => (
        <div className="button-row">
          <input
            aria-label={text.incidents.note}
            value={incidentNotes[row.key] ?? row.state.note}
            placeholder={text.incidents.note}
            onChange={(event) => setIncidentNotes((notes) => ({ ...notes, [row.key]: event.target.value }))}
          />
          <Button size="sm" type="button" onClick={() => updateIncident(row.key, 'acknowledge')} disabled={!canRunJobs || mutation.status === 'running'}>
            {text.actions.acknowledge}
          </Button>
          <Button size="sm" tone="primary" type="button" onClick={() => updateIncident(row.key, 'resolve')} disabled={!canRunJobs || mutation.status === 'running'}>
            {text.actions.resolve}
          </Button>
        </div>
      ),
    },
  ], [canRunJobs, incidentNotes, language, mutation.status, text]);

  const deliveryColumns = useMemo<Column<AlertDeliveryRow>[]>(() => [
    { key: 'channel', label: text.deliveries.channel, render: (row) => <div><strong>{row.channel}</strong><small>{row.title}</small></div> },
    { key: 'status', label: text.deliveries.status, render: (row) => <Badge tone={deliveryTone(row.lastStatus)}>{deliveryLabel(row.lastStatus, language)}</Badge> },
    { key: 'sent', label: text.deliveries.sent, align: 'right', render: (row) => row.sentCount },
    { key: 'seen', label: text.deliveries.lastSeen, render: (row) => <span>{formatDate(row.lastSeenAt, locale)}</span> },
  ], [language, locale, text]);

  const refreshAll = () => {
    alerts.refresh();
    incidents.refresh();
    deliveries.refresh();
    recovery.refresh();
    runtime.refresh();
    startup.refresh();
    readiness.refresh();
    retention.refresh();
  };
  const runAlertDelivery = async () => {
    const result = await mutation.run(text.actions.deliverAlerts, () => deliverReliabilityAlerts());
    if (result) {
      alerts.refresh();
      deliveries.refresh();
    }
  };
  const updateIncident = async (incidentKey: string, action: 'acknowledge' | 'resolve') => {
    const note = incidentNotes[incidentKey] ?? '';
    const result = await mutation.run(
      action === 'acknowledge' ? text.actions.acknowledge : text.actions.resolve,
      () => action === 'acknowledge'
        ? acknowledgeReliabilityIncident(incidentKey, { note })
        : resolveReliabilityIncident(incidentKey, { note }),
    );
    if (result) {
      incidents.refresh();
      alerts.refresh();
    }
  };
  const runCleanup = async (dryRun: boolean) => {
    const result = await mutation.run(dryRun ? text.actions.previewCleanup : text.actions.runCleanup, () =>
      runReliabilityRetention({ dryRun }),
    );
    if (result) {
      retention.refresh();
      alerts.refresh();
    }
  };
  const refreshPreflight = async () => {
    const result = await mutation.run(text.actions.refreshPreflight, () => refreshStartupPreflight());
    if (result) {
      startup.refresh();
      alerts.refresh();
    }
  };

  return (
    <div className="page-grid">
      <section className="wms-page-intro span-12">
        <div>
          <h2>{text.title}</h2>
        </div>
        <div className="button-row">
          <ResourceFreshness status={runtime.status} refreshedAt={runtime.refreshedAt} ageSeconds={runtime.ageSeconds} stale={runtime.stale} />
          <Button size="sm" type="button" onClick={refreshAll}>{text.actions.refresh}</Button>
        </div>
      </section>

      <Card title={text.summary.title} className="span-12">
        <div className="metric-stack metric-stack--compact">
          <article><span>{text.summary.alerts}</span><strong>{alerts.data.alertCount}</strong></article>
          <article><span>{text.summary.incidents}</span><strong>{incidents.data.incidents.length}</strong></article>
          <article><span>{text.summary.startup}</span><strong><Badge tone={statusTone(startup.data.status)}>{statusLabel(startup.data.status, language)}</Badge></strong></article>
          <article><span>{text.summary.ready}</span><strong><Badge tone={statusTone(readiness.data.status)}>{statusLabel(readiness.data.status, language)}</Badge></strong></article>
          <article><span>{text.summary.recovery}</span><strong><Badge tone={statusTone(recovery.data.status)}>{statusLabel(recovery.data.status, language)}</Badge></strong></article>
          <article><span>{text.summary.retention}</span><strong>{retention.data.preview.totalEligible}</strong></article>
          <article><span>{text.summary.frontendErrors}</span><strong>{runtime.data.frontend.recentErrors}</strong></article>
        </div>
        {(alerts.status === 'error' || incidents.status === 'error' || deliveries.status === 'error' || recovery.status === 'error' || runtime.status === 'error' || startup.status === 'error' || readiness.status === 'error' || retention.status === 'error') && (
          <div className="inline-banner inline-banner--warning" role="alert">
            <span>{text.loadError}</span>
          </div>
        )}
      </Card>

      <Card
        title={text.alerts.title}
        className="span-12"
        action={<Button size="sm" type="button" onClick={runAlertDelivery} disabled={!canRunJobs || mutation.status === 'running'}>{text.actions.deliverAlerts}</Button>}
      >
        <DataTable
          rows={alerts.data.alerts}
          columns={alertColumns}
          getRowKey={(row) => row.key}
          emptyTitle={text.alerts.emptyTitle}
          emptyText={text.alerts.emptyText}
        />
      </Card>

      <Card title={text.incidents.title} className="span-12">
        <DataTable
          rows={incidents.data.incidents}
          columns={incidentColumns}
          getRowKey={(row) => row.key}
          emptyTitle={text.incidents.emptyTitle}
          emptyText={text.incidents.emptyText}
        />
      </Card>

      <Card title={text.recovery.title} className="span-6">
        <div className="settings-stack">
          <RecoveryCheckRow title={text.recovery.backup} check={recovery.data.backup} text={text} locale={locale} />
          <RecoveryCheckRow title={text.recovery.restoreDrill} check={recovery.data.restoreDrill} text={text} locale={locale} />
        </div>
      </Card>

      <Card title={text.performance.title} className="span-6">
        <div className="metric-stack metric-stack--compact">
          <article><span>{text.performance.recent5xx}</span><strong>{runtime.data.performance.recent5xxPerMinute}/{runtime.data.performance.http5xxRateWarnPerMinute}</strong></article>
          <article><span>{text.performance.slowRequests}</span><strong>{runtime.data.performance.slowRequestsTotal}</strong></article>
          <article><span>{text.performance.criticalSlowRequests}</span><strong>{runtime.data.performance.criticalSlowRequestsTotal}</strong></article>
        </div>
        <div className="settings-stack">
          {runtime.data.performance.slowRoutes.slice(0, 3).map((route) => (
            <article key={`${route.method}-${route.route}`}>
              <div>
                <strong>{route.method} {route.route}</strong>
                <span>p95 {route.p95DurationMs} ms · p99 {route.p99DurationMs} ms</span>
              </div>
              <Badge tone={runtime.data.performance.criticalRoutes.some((critical) => critical.route === route.route) ? 'critical' : 'warning'}>
                {runtime.data.performance.criticalRoutes.some((critical) => critical.route === route.route) ? text.performance.critical : text.performance.slow}
              </Badge>
            </article>
          ))}
          {runtime.data.performance.slowRoutes.length === 0 && <p className="role-note">{text.performance.empty}</p>}
        </div>
      </Card>

      <Card
        title={text.frontend.title}
        className="span-6"
        action={<ResourceFreshness status={runtime.status} refreshedAt={runtime.refreshedAt} ageSeconds={runtime.ageSeconds} stale={runtime.stale} />}
      >
        <div className="metric-stack metric-stack--compact">
          <article><span>{text.frontend.total}</span><strong>{runtime.data.frontend.totalEvents}</strong></article>
          <article><span>{text.frontend.errors}</span><strong>{runtime.data.frontend.recentErrors}</strong></article>
          <article><span>{text.frontend.last}</span><strong>{runtime.data.frontend.lastEventAt ? formatDate(runtime.data.frontend.lastEventAt, locale) : text.frontend.never}</strong></article>
        </div>
        <DataTable
          rows={runtime.data.frontend.recentEvents}
          columns={frontendColumns}
          getRowKey={(row) => row.id}
          emptyTitle={text.frontend.emptyTitle}
          emptyText={text.frontend.emptyText}
        />
      </Card>

      <Card title={text.deliveries.title} className="span-12">
        <DataTable
          rows={deliveries.data}
          columns={deliveryColumns}
          getRowKey={(row) => `${row.alertKey}-${row.channel}`}
          emptyTitle={text.deliveries.emptyTitle}
          emptyText={text.deliveries.emptyText}
        />
      </Card>

      <Card
        title={text.preflight.title}
        className="span-6"
        action={<Button size="sm" type="button" onClick={refreshPreflight} disabled={!canRunJobs || mutation.status === 'running'}>{text.actions.verify}</Button>}
      >
        <CheckList checks={startup.data.checks} language={language} emptyText={text.preflight.empty} />
      </Card>

      <Card title={text.readiness.title} className="span-6">
        <CheckList checks={readiness.data.checks} language={language} emptyText={text.readiness.empty} />
      </Card>

      <Card
        title={text.retention.title}
        className="span-12"
        action={(
          <div className="button-row">
            <Button size="sm" type="button" onClick={() => runCleanup(true)} disabled={mutation.status === 'running'}>{text.actions.previewCleanup}</Button>
            <Button size="sm" tone="primary" type="button" onClick={() => runCleanup(false)} disabled={!canRunJobs || mutation.status === 'running'}>{text.actions.runCleanup}</Button>
          </div>
        )}
      >
        <div className="metric-stack metric-stack--compact">
          <article><span>{text.retention.enabled}</span><strong>{retention.data.enabled ? text.yes : text.no}</strong></article>
          <article><span>{text.retention.interval}</span><strong>{formatDuration(retention.data.intervalSeconds, language)}</strong></article>
          <article><span>{text.retention.batch}</span><strong>{retention.data.batchSize}</strong></article>
          <article><span>{text.retention.lastRun}</span><strong>{retention.data.lastRun ? formatDate(retention.data.lastRun.finishedAt, locale) : text.retention.never}</strong></article>
        </div>
        <DataTable
          rows={retention.data.preview.items}
          columns={retentionColumns}
          getRowKey={(row) => row.key}
          emptyTitle={text.retention.emptyTitle}
          emptyText={text.retention.emptyText}
        />
        <ActionStatus mutation={mutation} />
      </Card>
    </div>
  );
}

function CheckList({ checks, language, emptyText }: { checks: HealthCheckRow[]; language: Language; emptyText: string }) {
  if (checks.length === 0) return <p className="role-note">{emptyText}</p>;
  return (
    <div className="settings-stack">
      {checks.map((check) => (
        <article key={check.name}>
          <div>
            <strong>{check.name}</strong>
            {check.detail && <span>{check.detail}</span>}
          </div>
          <Badge tone={checkTone(check.status)}>{checkLabel(check.status, language)}</Badge>
        </article>
      ))}
    </div>
  );
}

function RecoveryCheckRow({ title, check, text, locale }: { title: string; check: RecoveryCheck; text: typeof czech; locale: string }) {
  return (
    <article>
      <div>
        <strong>{title}</strong>
        <span>
          {check.lastSuccessfulAt ? formatDate(check.lastSuccessfulAt, locale) : text.recovery.never}
          {check.artifact ? ` · ${check.artifact}` : ''}
          {check.sizeBytes !== null ? ` · ${formatBytes(check.sizeBytes)}` : ''}
          {check.sha256 ? ` · SHA256 ${check.sha256.slice(0, 12)}` : ''}
          {check.targetDatabase ? ` · ${check.targetDatabase}` : ''}
          {check.tableCount !== null ? ` · ${check.tableCount} ${text.recovery.tables}` : ''}
        </span>
        {check.detail && <span>{check.detail}</span>}
      </div>
      <Badge tone={checkTone(check.status)}>{check.status === 'ok' ? text.recovery.ok : text.recovery.warn}</Badge>
    </article>
  );
}

function mapAlerts(payload: unknown): AlertSnapshot {
  const row = record(payload);
  return {
    status: stringValue(row['status'], 'ok'),
    generatedAt: stringValue(row['generatedAt'], ''),
    alertCount: numberValue(row['alertCount']),
    alerts: array(row['alerts']).map((entry) => {
      const alert = record(entry);
      return {
        key: stringValue(alert['key'], Math.random().toString(36)),
        source: stringValue(alert['source'], ''),
        severity: stringValue(alert['severity'], 'info'),
        title: stringValue(alert['title'], '-'),
        detail: stringValue(alert['detail'], ''),
        action: stringValue(alert['action'], ''),
        count: nullableNumber(alert['count']),
        detectedAt: stringValue(alert['detectedAt'], ''),
      };
    }),
  };
}

function mapIncidents(payload: unknown): IncidentSnapshot {
  const row = record(payload);
  return {
    status: stringValue(row['status'], 'ok'),
    generatedAt: stringValue(row['generatedAt'], ''),
    incidents: array(row['incidents']).map((entry) => {
      const incident = record(entry);
      const state = record(incident['state']);
      return {
        key: stringValue(incident['key'], Math.random().toString(36)),
        severity: stringValue(incident['severity'], 'info'),
        title: stringValue(incident['title'], '-'),
        detail: stringValue(incident['detail'], ''),
        action: stringValue(incident['action'], ''),
        count: nullableNumber(incident['count']),
        detectedAt: stringValue(incident['detectedAt'], ''),
        state: {
          status: stringValue(state['status'], 'OPEN'),
          note: stringValue(state['note'], ''),
          acknowledgedByDisplayName: stringValue(state['acknowledgedByDisplayName'], ''),
          acknowledgedAt: stringValue(state['acknowledgedAt'], ''),
          resolvedByDisplayName: stringValue(state['resolvedByDisplayName'], ''),
          resolvedAt: stringValue(state['resolvedAt'], ''),
        },
      };
    }),
  };
}

function mapAlertDeliveries(payload: unknown): AlertDeliveryRow[] {
  return array(payload).map((entry) => {
    const row = record(entry);
    return {
      alertKey: stringValue(row['alertKey'], Math.random().toString(36)),
      channel: stringValue(row['channel'], '-'),
      severity: stringValue(row['severity'], 'info'),
      title: stringValue(row['title'], '-'),
      lastStatus: stringValue(row['lastStatus'], 'skipped'),
      lastSentAt: stringValue(row['lastSentAt'], ''),
      lastSeenAt: stringValue(row['lastSeenAt'], ''),
      sentCount: numberValue(row['sentCount']),
      error: stringValue(row['error'], ''),
    };
  });
}

function mapRecovery(payload: unknown): RecoverySnapshot {
  const row = record(payload);
  return {
    status: stringValue(row['status'], 'ok'),
    generatedAt: stringValue(row['generatedAt'], ''),
    backup: mapRecoveryCheck(row['backup']),
    restoreDrill: mapRecoveryCheck(row['restoreDrill']),
  };
}

function mapRecoveryCheck(payload: unknown): RecoveryCheck {
  const row = record(payload);
  return {
    status: stringValue(row['status'], 'ok'),
    required: Boolean(row['required']),
    ageSeconds: nullableNumber(row['ageSeconds']),
    lastSuccessfulAt: stringValue(row['lastSuccessfulAt'], ''),
    artifact: stringValue(row['artifact'], ''),
    sizeBytes: nullableNumber(row['sizeBytes']),
    sha256: stringValue(row['sha256'], ''),
    targetDatabase: stringValue(row['targetDatabase'], ''),
    tableCount: nullableNumber(row['tableCount']),
    detail: stringValue(row['detail'], ''),
  };
}

function mapRuntime(payload: unknown): RuntimeSnapshot {
  const row = record(payload);
  const frontend = record(row['frontend']);
  const performance = record(row['performance']);
  return {
    frontend: {
      totalEvents: numberValue(frontend['totalEvents']),
      recentErrors: numberValue(frontend['recentErrors']),
      lastEventAt: nullableString(frontend['lastEventAt']),
      countsByType: stringNumberRecord(frontend['countsByType']),
      countsBySeverity: stringNumberRecord(frontend['countsBySeverity']),
      recentEvents: array(frontend['recentEvents']).map(mapFrontendEvent),
    },
    performance: {
      slowRouteWarnMs: numberValue(performance['slowRouteWarnMs']) || 1000,
      slowRouteCriticalMs: numberValue(performance['slowRouteCriticalMs']) || 3000,
      http5xxRateWarnPerMinute: numberValue(performance['http5xxRateWarnPerMinute']) || 10,
      recent5xxPerMinute: numberValue(performance['recent5xxPerMinute']),
      slowRequestsTotal: numberValue(performance['slowRequestsTotal']),
      criticalSlowRequestsTotal: numberValue(performance['criticalSlowRequestsTotal']),
      slowRoutes: array(performance['slowRoutes']).map(mapRuntimeRoute),
      criticalRoutes: array(performance['criticalRoutes']).map(mapRuntimeRoute),
    },
  };
}

function mapFrontendEvent(payload: unknown): FrontendEventRow {
  const row = record(payload);
  return {
    id: stringValue(row['id'], Math.random().toString(36)),
    type: stringValue(row['type'], 'unknown'),
    severity: stringValue(row['severity'], 'info'),
    route: nullableString(row['route']),
    language: nullableString(row['language']),
    roleId: nullableString(row['roleId']),
    appVersion: nullableString(row['appVersion']),
    occurredAt: stringValue(row['occurredAt'], ''),
    receivedAt: stringValue(row['receivedAt'], ''),
    message: nullableString(row['message']),
    source: nullableString(row['source']),
    statusCode: nullableNumber(row['statusCode']),
    durationMs: nullableNumber(row['durationMs']),
    browserOnline: typeof row['browserOnline'] === 'boolean' ? row['browserOnline'] : null,
  };
}

function mapRuntimeRoute(payload: unknown): RuntimeRoute {
  const row = record(payload);
  return {
    method: stringValue(row['method'], 'GET'),
    route: stringValue(row['route'], '-'),
    p95DurationMs: numberValue(row['p95DurationMs']),
    p99DurationMs: numberValue(row['p99DurationMs']),
  };
}

function mapHealth(payload: unknown): HealthSnapshot {
  const row = record(payload);
  return {
    status: stringValue(row['status'], 'ok'),
    checks: array(row['checks']).map((entry) => {
      const check = record(entry);
      return {
        name: stringValue(check['name'], '-'),
        status: stringValue(check['status'], 'ok'),
        detail: stringValue(check['detail'], ''),
      };
    }),
  };
}

function mapRetention(payload: unknown): RetentionSnapshot {
  const row = record(payload);
  const preview = record(row['preview']);
  const lastRun = record(row['lastRun']);
  return {
    enabled: Boolean(row['enabled']),
    intervalSeconds: numberValue(row['intervalSeconds']),
    batchSize: numberValue(row['batchSize']),
    lastRun: lastRun['finishedAt'] ? {
      finishedAt: stringValue(lastRun['finishedAt'], ''),
      totalDeleted: numberValue(lastRun['totalDeleted']),
    } : null,
    preview: {
      totalEligible: numberValue(preview['totalEligible']),
      totalDeleted: numberValue(preview['totalDeleted']),
      items: array(preview['items']).map((entry) => {
        const item = record(entry);
        return {
          key: stringValue(item['key'], Math.random().toString(36)),
          table: stringValue(item['table'], '-'),
          description: stringValue(item['description'], ''),
          retentionDays: numberValue(item['retentionDays']),
          eligibleCount: numberValue(item['eligibleCount']),
          deletedCount: numberValue(item['deletedCount']),
          skipped: Boolean(item['skipped']),
        };
      }),
    },
  };
}

function statusTone(value: string): Severity {
  if (value === 'ok') return 'good';
  if (value === 'fail') return 'critical';
  return 'warning';
}

function checkTone(value: string): Severity {
  if (value === 'ok') return 'good';
  if (value === 'fail') return 'critical';
  return 'warning';
}

function severityTone(value: string): Severity {
  if (value === 'critical') return 'critical';
  if (value === 'warning') return 'warning';
  return 'neutral';
}

function incidentStateTone(value: string): Severity {
  if (value === 'RESOLVED') return 'good';
  if (value === 'ACKNOWLEDGED') return 'warning';
  return 'neutral';
}

function deliveryTone(value: string): Severity {
  if (value === 'sent') return 'good';
  if (value === 'failed') return 'critical';
  return 'neutral';
}

function frontendSeverityTone(value: string): Severity {
  if (value === 'critical' || value === 'error') return 'critical';
  if (value === 'warning') return 'warning';
  return 'neutral';
}

function statusLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechStatus, en: englishStatus, ua: ukrainianStatus });
  return labels[value] ?? value;
}

function checkLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechCheck, en: englishCheck, ua: ukrainianCheck });
  return labels[value] ?? value;
}

function severityLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechSeverity, en: englishSeverity, ua: ukrainianSeverity });
  return labels[value] ?? value;
}

function incidentStateLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechIncidentState, en: englishIncidentState, ua: ukrainianIncidentState });
  return labels[value] ?? value;
}

function deliveryLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechDelivery, en: englishDelivery, ua: ukrainianDelivery });
  return labels[value] ?? value;
}

function frontendSeverityLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechFrontendSeverity, en: englishFrontendSeverity, ua: ukrainianFrontendSeverity });
  return labels[value] ?? value;
}

function frontendTypeLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechFrontendTypes, en: englishFrontendTypes, ua: ukrainianFrontendTypes });
  return labels[value] ?? value;
}

function incidentOwner(state: IncidentState, text: typeof czech) {
  if (state.status === 'RESOLVED' && state.resolvedByDisplayName) {
    return `${text.incidents.resolvedBy} ${state.resolvedByDisplayName}`;
  }
  if (state.acknowledgedByDisplayName) {
    return `${text.incidents.acknowledgedBy} ${state.acknowledgedByDisplayName}`;
  }
  return text.incidents.unassigned;
}

function formatDuration(seconds: number, language: Language) {
  if (seconds <= 0) return '-';
  const hours = Math.round(seconds / 3600);
  const unit: Record<Language, string> = { cs: 'h', en: 'h', ua: 'год', fr: 'h', de: 'Std.', es: 'h' };
  return `${hours} ${unit[language]}`;
}

function formatDate(value: string, locale: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  const parsed = numberValue(value);
  return value === undefined || value === null ? null : parsed;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringNumberRecord(value: unknown): Record<string, number> {
  const item = record(value);
  return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, numberValue(entry)]));
}

const czech = {
  title: 'Stabilita',
  loadError: 'Provozní stav se nepodařilo načíst.',
  yes: 'Ano',
  no: 'Ne',
  actions: {
    refresh: 'Obnovit',
    verify: 'Ověřit',
    acknowledge: 'Potvrdit',
    resolve: 'Vyřešit',
    deliverAlerts: 'Odeslat alerty',
    refreshPreflight: 'Ověření startupu',
    previewCleanup: 'Náhled úklidu',
    runCleanup: 'Spustit úklid',
  },
  summary: { title: 'Provozní souhrn', alerts: 'Alerty', incidents: 'Incidenty', startup: 'Startup', ready: 'Readiness', recovery: 'Recovery', retention: 'K úklidu', frontendErrors: 'Frontend chyby' },
  alerts: { title: 'Alerty', emptyTitle: 'Žádné alerty', emptyText: 'Backend teď nehlásí žádný provozní incident.' },
  incidents: {
    title: 'Incidenty',
    owner: 'Řeší',
    response: 'Reakce',
    note: 'Poznámka',
    acknowledgedBy: 'Potvrdil',
    resolvedBy: 'Vyřešil',
    unassigned: 'Nikdo nepřiřazen',
    emptyTitle: 'Žádné incidenty',
    emptyText: 'Aktuálně není otevřený žádný provozní incident.',
  },
  recovery: {
    title: 'Recovery',
    backup: 'Backup',
    restoreDrill: 'Restore drill',
    never: 'Neběželo',
    tables: 'tabulek',
    ok: 'OK',
    warn: 'Varování',
  },
  performance: {
    title: 'Výkon',
    recent5xx: '5xx / minuta',
    slowRequests: 'Pomalé požadavky',
    criticalSlowRequests: 'Kriticky pomalé',
    slow: 'Pomalé',
    critical: 'Kritické',
    empty: 'Žádná pomalá route v aktuálních metrikách.',
  },
  frontend: {
    title: 'Frontend runtime',
    type: 'Událost',
    message: 'Detail',
    received: 'Přijato',
    total: 'Události celkem',
    errors: 'Chyby v paměti',
    last: 'Poslední událost',
    never: 'Neběželo',
    noRoute: 'Bez route',
    noMessage: 'Bez detailu',
    emptyTitle: 'Žádné frontend události',
    emptyText: 'Prohlížeč zatím neposlal žádnou runtime událost.',
  },
  deliveries: {
    title: 'Doručení alertů',
    channel: 'Kanál',
    status: 'Stav',
    sent: 'Odesláno',
    lastSeen: 'Naposledy',
    emptyTitle: 'Žádné doručení',
    emptyText: 'Alert kanály zatím nemají uložený stav.',
  },
  preflight: { title: 'Startup preflight', empty: 'Startup kontroly zatím nejsou k dispozici.' },
  readiness: { title: 'Readiness', empty: 'Readiness kontroly zatím nejsou k dispozici.' },
  retention: {
    title: 'Retence dat',
    table: 'Tabulka',
    days: 'Dní',
    eligible: 'K úklidu',
    enabled: 'Automatika',
    interval: 'Interval',
    batch: 'Batch',
    lastRun: 'Poslední běh',
    never: 'Neběželo',
    skipped: 'Vypnuto',
    emptyTitle: 'Žádné retenční položky',
    emptyText: 'Backend nevrátil retenční plán.',
  },
  columns: { severity: 'Stav', issue: 'Problém', action: 'Akce' },
};

const english = {
  title: 'Reliability',
  loadError: 'Operational status could not be loaded.',
  yes: 'Yes',
  no: 'No',
  actions: {
    refresh: 'Refresh',
    verify: 'Verify',
    acknowledge: 'Acknowledge',
    resolve: 'Resolve',
    deliverAlerts: 'Deliver alerts',
    refreshPreflight: 'Startup verification',
    previewCleanup: 'Preview cleanup',
    runCleanup: 'Run cleanup',
  },
  summary: { title: 'Operational summary', alerts: 'Alerts', incidents: 'Incidents', startup: 'Startup', ready: 'Readiness', recovery: 'Recovery', retention: 'Cleanup', frontendErrors: 'Frontend errors' },
  alerts: { title: 'Alerts', emptyTitle: 'No alerts', emptyText: 'The backend is not reporting any operational incident.' },
  incidents: {
    title: 'Incidents',
    owner: 'Owner',
    response: 'Response',
    note: 'Note',
    acknowledgedBy: 'Acknowledged by',
    resolvedBy: 'Resolved by',
    unassigned: 'Unassigned',
    emptyTitle: 'No incidents',
    emptyText: 'No operational incident is currently open.',
  },
  recovery: {
    title: 'Recovery',
    backup: 'Backup',
    restoreDrill: 'Restore drill',
    never: 'Never',
    tables: 'tables',
    ok: 'OK',
    warn: 'Warning',
  },
  performance: {
    title: 'Performance',
    recent5xx: '5xx / minute',
    slowRequests: 'Slow requests',
    criticalSlowRequests: 'Critical slow',
    slow: 'Slow',
    critical: 'Critical',
    empty: 'No slow route is present in current metrics.',
  },
  frontend: {
    title: 'Frontend runtime',
    type: 'Event',
    message: 'Detail',
    received: 'Received',
    total: 'Total events',
    errors: 'Stored errors',
    last: 'Latest event',
    never: 'Never',
    noRoute: 'No route',
    noMessage: 'No detail',
    emptyTitle: 'No frontend events',
    emptyText: 'The browser has not reported any runtime event yet.',
  },
  deliveries: {
    title: 'Alert delivery',
    channel: 'Channel',
    status: 'State',
    sent: 'Sent',
    lastSeen: 'Last seen',
    emptyTitle: 'No delivery state',
    emptyText: 'Alert channels do not have stored state yet.',
  },
  preflight: { title: 'Startup preflight', empty: 'Startup checks are not available yet.' },
  readiness: { title: 'Readiness', empty: 'Readiness checks are not available yet.' },
  retention: {
    title: 'Data retention',
    table: 'Table',
    days: 'Days',
    eligible: 'Eligible',
    enabled: 'Automatic',
    interval: 'Interval',
    batch: 'Batch',
    lastRun: 'Last run',
    never: 'Never',
    skipped: 'Skipped',
    emptyTitle: 'No retention items',
    emptyText: 'The backend did not return a retention plan.',
  },
  columns: { severity: 'State', issue: 'Issue', action: 'Action' },
};

const ukrainian = {
  title: 'Стабільність',
  loadError: 'Не вдалося завантажити операційний стан.',
  yes: 'Так',
  no: 'Ні',
  actions: {
    refresh: 'Оновити',
    verify: 'Перевірити',
    acknowledge: 'Підтвердити',
    resolve: 'Вирішити',
    deliverAlerts: 'Надіслати алерти',
    refreshPreflight: 'Перевірка запуску',
    previewCleanup: 'Попередній перегляд',
    runCleanup: 'Запустити очищення',
  },
  summary: { title: 'Операційний підсумок', alerts: 'Алерти', incidents: 'Інциденти', startup: 'Запуск', ready: 'Готовність', recovery: 'Recovery', retention: 'До очищення', frontendErrors: 'Frontend помилки' },
  alerts: { title: 'Алерти', emptyTitle: 'Немає алертів', emptyText: 'Backend не повідомляє про операційні інциденти.' },
  incidents: {
    title: 'Інциденти',
    owner: 'Відповідальний',
    response: 'Реакція',
    note: 'Нотатка',
    acknowledgedBy: 'Підтвердив',
    resolvedBy: 'Вирішив',
    unassigned: 'Не призначено',
    emptyTitle: 'Немає інцидентів',
    emptyText: 'Зараз немає відкритого операційного інциденту.',
  },
  recovery: {
    title: 'Recovery',
    backup: 'Backup',
    restoreDrill: 'Restore drill',
    never: 'Не запускалось',
    tables: 'таблиць',
    ok: 'OK',
    warn: 'Попередження',
  },
  performance: {
    title: 'Продуктивність',
    recent5xx: '5xx / хвилина',
    slowRequests: 'Повільні запити',
    criticalSlowRequests: 'Критично повільні',
    slow: 'Повільно',
    critical: 'Критично',
    empty: 'У поточних метриках немає повільної route.',
  },
  frontend: {
    title: 'Frontend runtime',
    type: 'Подія',
    message: 'Деталі',
    received: 'Отримано',
    total: 'Усього подій',
    errors: 'Помилки в памʼяті',
    last: 'Остання подія',
    never: 'Не запускалось',
    noRoute: 'Без route',
    noMessage: 'Без деталей',
    emptyTitle: 'Немає frontend подій',
    emptyText: 'Браузер ще не надіслав жодної runtime події.',
  },
  deliveries: {
    title: 'Доставка алертів',
    channel: 'Канал',
    status: 'Стан',
    sent: 'Надіслано',
    lastSeen: 'Останній раз',
    emptyTitle: 'Немає стану доставки',
    emptyText: 'Канали алертів ще не мають збереженого стану.',
  },
  preflight: { title: 'Startup preflight', empty: 'Перевірки запуску поки недоступні.' },
  readiness: { title: 'Readiness', empty: 'Перевірки готовності поки недоступні.' },
  retention: {
    title: 'Зберігання даних',
    table: 'Таблиця',
    days: 'Днів',
    eligible: 'До очищення',
    enabled: 'Автоматично',
    interval: 'Інтервал',
    batch: 'Пакет',
    lastRun: 'Останній запуск',
    never: 'Не запускалось',
    skipped: 'Пропущено',
    emptyTitle: 'Немає елементів ретенції',
    emptyText: 'Backend не повернув план ретенції.',
  },
  columns: { severity: 'Стан', issue: 'Проблема', action: 'Дія' },
};

const czechStatus: Record<string, string> = { ok: 'V pořádku', degraded: 'Omezeno', fail: 'Selhání' };
const englishStatus: Record<string, string> = { ok: 'OK', degraded: 'Limited', fail: 'Failure' };
const ukrainianStatus: Record<string, string> = { ok: 'В порядку', degraded: 'Обмежено', fail: 'Збій' };
const czechCheck: Record<string, string> = { ok: 'OK', warn: 'Varování', fail: 'Chyba' };
const englishCheck: Record<string, string> = { ok: 'OK', warn: 'Warning', fail: 'Error' };
const ukrainianCheck: Record<string, string> = { ok: 'OK', warn: 'Попередження', fail: 'Помилка' };
const czechSeverity: Record<string, string> = { info: 'Info', warning: 'Varování', critical: 'Kritické' };
const englishSeverity: Record<string, string> = { info: 'Info', warning: 'Warning', critical: 'Critical' };
const ukrainianSeverity: Record<string, string> = { info: 'Інфо', warning: 'Попередження', critical: 'Критично' };
const czechFrontendSeverity: Record<string, string> = { info: 'Info', warning: 'Varování', error: 'Chyba', critical: 'Kritické' };
const englishFrontendSeverity: Record<string, string> = { info: 'Info', warning: 'Warning', error: 'Error', critical: 'Critical' };
const ukrainianFrontendSeverity: Record<string, string> = { info: 'Інфо', warning: 'Попередження', error: 'Помилка', critical: 'Критично' };
const czechFrontendTypes: Record<string, string> = {
  app_loaded: 'Načtení aplikace',
  js_error: 'JS chyba',
  error_boundary: 'Obnova UI',
  api_failure: 'API chyba',
  blank_screen: 'Prázdná obrazovka',
  pwa_update: 'PWA aktualizace',
  service_worker: 'Service worker',
  offline_state: 'Offline stav',
};
const englishFrontendTypes: Record<string, string> = {
  app_loaded: 'App loaded',
  js_error: 'JS error',
  error_boundary: 'UI recovery',
  api_failure: 'API failure',
  blank_screen: 'Blank screen',
  pwa_update: 'PWA update',
  service_worker: 'Service worker',
  offline_state: 'Offline state',
};
const ukrainianFrontendTypes: Record<string, string> = {
  app_loaded: 'Завантаження застосунку',
  js_error: 'JS помилка',
  error_boundary: 'Відновлення UI',
  api_failure: 'API помилка',
  blank_screen: 'Порожній екран',
  pwa_update: 'PWA оновлення',
  service_worker: 'Service worker',
  offline_state: 'Offline стан',
};
const czechIncidentState: Record<string, string> = { OPEN: 'Otevřený', ACKNOWLEDGED: 'Potvrzený', RESOLVED: 'Vyřešený' };
const englishIncidentState: Record<string, string> = { OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' };
const ukrainianIncidentState: Record<string, string> = { OPEN: 'Відкритий', ACKNOWLEDGED: 'Підтверджено', RESOLVED: 'Вирішено' };
const czechDelivery: Record<string, string> = { sent: 'Odesláno', skipped: 'Přeskočeno', failed: 'Selhalo' };
const englishDelivery: Record<string, string> = { sent: 'Sent', skipped: 'Skipped', failed: 'Failed' };
const ukrainianDelivery: Record<string, string> = { sent: 'Надіслано', skipped: 'Пропущено', failed: 'Помилка' };
