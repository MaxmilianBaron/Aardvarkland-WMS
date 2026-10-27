import { ActionStatus } from '../../components/ops/ActionStatus';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable } from '../../components/ui/DataTable';
import { MetricCard } from '../../components/ui/MetricCard';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { getIntegrationEnterpriseReconciliationReport, getIntegrationOperationsSummary, listIntegrationEnterpriseDeadLetters, replayIntegrationEnterpriseDeadLetter, runIntegrationEnterpriseReconciliation } from '../../core/api/wms';
import { useWorkspace } from '../../core/workspace/workspace';

interface IntegrationSummary {
  generatedAt: string | Date;
  endpoints: { total: number; active: number; error: number; inactive: number };
  externalSystems: { total: number; active: number };
  outbox: Array<{ status: string; count: number; totalAttempts: number }>;
  deadLetters: { open: number; retrying: number; resolved: number; ignored: number };
  dispatch: { last24h: number; failures24h: number; successRate24h: number };
  recommendedActions: string[];
}
interface DeadLetter {
  id: string;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  errorMessage: string;
  attempts: number;
  updatedAt: string | Date;
}
interface ReconciliationReport {
  generatedAt: string | Date;
  externalSystemCode: string | null;
  resources: Array<{ resourceType: string; mappedCount: number; orphanMappingCount: number; missingMappingCount: number }>;
  openDeadLetters: number;
  pendingOutboxEvents: number;
  auditLogId: string | null;
}

const fallbackSummary: IntegrationSummary = {
  generatedAt: new Date().toISOString(),
  endpoints: { total: 0, active: 0, error: 0, inactive: 0 },
  externalSystems: { total: 0, active: 0 },
  outbox: [],
  deadLetters: { open: 0, retrying: 0, resolved: 0, ignored: 0 },
  dispatch: { last24h: 0, failures24h: 0, successRate24h: 0 },
  recommendedActions: [],
};
const fallbackDeadLetters: DeadLetter[] = [];
const fallbackReport: ReconciliationReport = {
  generatedAt: new Date().toISOString(),
  externalSystemCode: null,
  resources: [],
  openDeadLetters: 0,
  pendingOutboxEvents: 0,
  auditLogId: null,
};

function identity<T>(payload: unknown): T { return payload as T; }
function pct(value: number) { return `${Math.round(value * 1000) / 10}%`; }
function metric(label: string, value: string | number, change: string, severity: 'good' | 'warning' | 'critical' | 'neutral' = 'neutral') { return { label, value: String(value), change, severity }; }
function statusTone(value: string) {
  const upper = value.toUpperCase();
  if (upper === 'OPEN' || upper === 'RETRYING' || upper === 'FAILED') return 'warning' as const;
  if (upper === 'RESOLVED' || upper === 'REPLAYED' || upper === 'ACTIVE') return 'good' as const;
  return 'neutral' as const;
}

export function IntegrationOperationsPage() {
  const { warehouse } = useWorkspace();
  const mutation = useApiMutation();
  const summary = useApiResource({ fallback: fallbackSummary, loader: () => getIntegrationOperationsSummary<IntegrationSummary>(), map: identity<IntegrationSummary> });
  const deadLetters = useApiResource({ fallback: fallbackDeadLetters, loader: () => listIntegrationEnterpriseDeadLetters<DeadLetter[]>({ status: 'OPEN' }), map: identity<DeadLetter[]> });
  const report = useApiResource({ fallback: fallbackReport, loader: () => getIntegrationEnterpriseReconciliationReport<ReconciliationReport>(), map: (payload) => (payload ?? fallbackReport) as ReconciliationReport });

  const refreshAll = () => { summary.refresh(); deadLetters.refresh(); report.refresh(); };
  const runReconciliation = async () => {
    const result = await mutation.run('Spustit párování', () => runIntegrationEnterpriseReconciliation<ReconciliationReport>({ warehouseReference: warehouse.id }));
    if (result) refreshAll();
  };
  const replay = async (id: string) => {
    const result = await mutation.run('Opakovat dead-letter', () => replayIntegrationEnterpriseDeadLetter(id, { note: 'Opakování spuštěné z Aardvarkland UI' }));
    if (result) refreshAll();
  };

  return (
    <div className="page-grid integration-ops-page">
      <div className="span-12"><DataSourceBanner label="API provozu integrací" resource={summary} /></div>
      <section className="ops-command-header span-12">
        <div>
          <p className="eyebrow">produkční integrace</p>
          <h1>Provoz integrací</h1>
          <p>ERP, e-shop, dopravci, EDI, opakování webhooků, dead-lettery a párování v jednom přehledném místě.</p>
        </div>
        <div className="ops-command-actions">
          <Button onClick={runReconciliation} tone="primary" disabled={mutation.status === 'running'}>Spustit párování</Button>
          <Button onClick={refreshAll}>Obnovit</Button>
        </div>
      </section>

      <div className="metric-grid metric-grid--compact span-12">
        <MetricCard metric={metric('Endpointy', `${summary.data.endpoints.active}/${summary.data.endpoints.total}`, `${summary.data.endpoints.error} s chybou`, summary.data.endpoints.error ? 'warning' : 'good')} />
        <MetricCard metric={metric('Externí systémy', summary.data.externalSystems.active, `${summary.data.externalSystems.total} nastaveno`, 'good')} />
        <MetricCard metric={metric('Otevřené DLQ', summary.data.deadLetters.open + summary.data.deadLetters.retrying, `${summary.data.deadLetters.resolved} vyřešeno`, summary.data.deadLetters.open ? 'warning' : 'good')} />
        <MetricCard metric={metric('Odeslání 24 h', pct(summary.data.dispatch.successRate24h), `${summary.data.dispatch.failures24h} chyb`, summary.data.dispatch.failures24h ? 'warning' : 'good')} />
      </div>

      <Card title="Doporučené kroky" eyebrow="kontrola operátora" className="span-5">
        <div className="activity-list">
          {summary.data.recommendedActions.map((action) => <article key={action}><Badge tone={action.includes('čist') ? 'good' : 'warning'}>{action.includes('čist') ? 'OK' : 'Řešit'}</Badge><div><strong>{action}</strong><p>Každý bod je propojený na opakování, párování nebo stav endpointu.</p></div></article>)}
        </div>
      </Card>

      <Card title="Outbox a webhooky" eyebrow="opakovatelná expedice událostí" className="span-7">
        <DataTable rows={summary.data.outbox} getRowKey={(row) => row.status} columns={[
          { key: 'status', label: 'Stav', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
          { key: 'count', label: 'Události', align: 'right', render: (row) => row.count },
          { key: 'attempts', label: 'Pokusy celkem', align: 'right', render: (row) => row.totalAttempts },
        ]} />
      </Card>

      <Card title="Dead-letter fronta" eyebrow="opakovat / vyřešit" className="span-7">
        <DataTable rows={deadLetters.data} getRowKey={(row) => row.id} columns={[
          { key: 'event', label: 'Událost', render: (row) => <strong>{row.eventType}</strong> },
          { key: 'status', label: 'Stav', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
          { key: 'error', label: 'Chyba', render: (row) => <span title={row.errorMessage}>{row.errorMessage}</span> },
          { key: 'attempts', label: 'Pokusy', align: 'right', render: (row) => row.attempts },
          { key: 'action', label: 'Akce', align: 'right', render: (row) => <Button size="sm" onClick={() => { void replay(row.id); }}>Opakovat</Button> },
        ]} />
      </Card>

      <Card title="Report párování" eyebrow={report.data.auditLogId ? `Audit ${report.data.auditLogId}` : 'poslední běh'} className="span-5">
        <div className="settings-stack">
          <article><span>Otevřené DLQ</span><strong>{report.data.openDeadLetters}</strong></article>
          <article><span>Čeká v outboxu</span><strong>{report.data.pendingOutboxEvents}</strong></article>
          <article><span>Vygenerováno</span><strong>{new Date(report.data.generatedAt).toLocaleString()}</strong></article>
        </div>
        <div className="mini-list mini-list--rules">
          {report.data.resources.map((item) => (
            <article key={item.resourceType}>
              <div><strong>{item.resourceType}</strong><p>spárováno {item.mappedCount} · osiřelé {item.orphanMappingCount} · chybí {item.missingMappingCount}</p></div>
              <Badge tone={item.orphanMappingCount || item.missingMappingCount ? 'warning' : 'good'}>{item.orphanMappingCount || item.missingMappingCount ? 'Pozor' : 'OK'}</Badge>
            </article>
          ))}
        </div>
      </Card>

      <div className="span-12"><ActionStatus mutation={mutation} /></div>
    </div>
  );
}
