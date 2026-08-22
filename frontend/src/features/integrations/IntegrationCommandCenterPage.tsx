import { ActionStatus } from '../../components/ops/ActionStatus';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { getOperationsIntegrationCommandCenter, retryOperationsIntegrationEvent, runOperationsReconciliation } from '../../core/api/wms';
import { useWorkspace } from '../../core/workspace/workspace';

interface RuntimeConnector { code: string; title: string; category: string; mode: string; health: string; openEvents: number; deadLetters: number; lastSyncAt: string | null; requiredSecrets: string[]; capabilities: string[]; }
interface RuntimeIntegrationEvent { id: string; connectorCode: string; flow: string; state: string; externalId: string; attempts: number; maxAttempts: number; retryAfter: string | null; lastError: string | null; updatedAt: string; }
interface RuntimeIntegrationCommandCenter {
  warehouseId: string;
  connectors: RuntimeConnector[];
  events: RuntimeIntegrationEvent[];
  deadLetterCount: number;
  retryableCount: number;
  reconciliation: { lastRunAt: string | null; status: string; mismatches: number; nextRunHint: string; };
  productionChecklist: Array<{ code: string; label: string; status: string; }>;
}

const fallbackCenter: RuntimeIntegrationCommandCenter = {
  warehouseId: 'MAIN',
  connectors: [],
  events: [],
  deadLetterCount: 0,
  retryableCount: 0,
  reconciliation: { lastRunAt: null, status: 'NOT_RUN', mismatches: 0, nextRunHint: '' },
  productionChecklist: [],
};

function identity<T>(payload: unknown): T { return payload as T; }
function healthTone(value: string) { return value === 'CONNECTED' || value === 'READY' ? 'good' : value === 'DEGRADED' ? 'warning' : 'critical'; }
function stateTone(value: string) { return value === 'APPLIED' || value === 'READY' ? 'good' : value === 'DEAD_LETTER' ? 'critical' : 'warning'; }
function checklistTone(value: string) { return value === 'ok' ? 'good' : value === 'missing' ? 'critical' : 'warning'; }

export function IntegrationCommandCenterPage() {
  const { warehouseId } = useWorkspace();
  const resource = useApiResource({ fallback: fallbackCenter, loader: () => getOperationsIntegrationCommandCenter<RuntimeIntegrationCommandCenter>(warehouseId), map: identity<RuntimeIntegrationCommandCenter>, dependencies: [warehouseId] });
  const mutation = useApiMutation();
  const retryable = resource.data.events.find((event) => event.state === 'DEAD_LETTER' || event.state === 'WAITING' || event.state === 'RETRYING');

  const retryFirst = async () => {
    if (!retryable) return;
    await mutation.run('Opakovat integrační událost', () => retryOperationsIntegrationEvent(warehouseId, retryable.id));
    resource.refresh();
  };

  const reconcile = async () => {
    await mutation.run('Spustit párování', () => runOperationsReconciliation(warehouseId, { dryRun: true }));
    resource.refresh();
  };

  return (
    <div className="page-grid ops-runtime-page">
      <div className="span-12"><DataSourceBanner label="Běh integrací" resource={resource} /></div>

      <section className="runtime-hero span-12">
        <div>
          <p className="eyebrow">ERP · e-shop · dopravci · EDI · tisk</p>
          <h2>Řízení integrací</h2>
          <p>Jeden přehled pro konektory, opakování událostí, dead-lettery, auditní stopu a párování před fakturací nebo uzávěrkou.</p>
        </div>
        <div className="runtime-hero__actions">
          <Badge tone={resource.data.deadLetterCount ? 'critical' : 'good'}>{resource.data.deadLetterCount} dead-letterů</Badge>
          <Button type="button" onClick={retryFirst} disabled={!retryable || mutation.status === 'running'}>Opakovat další</Button>
          <Button type="button" tone="primary" onClick={reconcile} disabled={mutation.status === 'running'}>Spustit párování</Button>
        </div>
      </section>

      <div className="runtime-status-grid span-12 runtime-status-grid--wide">
        <article><span>Konektory</span><strong>{resource.data.connectors.length}</strong></article>
        <article><span>Otevřené události</span><strong>{resource.data.events.filter((event) => event.state !== 'APPLIED').length}</strong></article>
        <article><span>Lze opakovat</span><strong>{resource.data.retryableCount}</strong></article>
        <article><span>Neshody</span><strong>{resource.data.reconciliation.mismatches}</strong></article>
      </div>

      <Card title="Stav konektorů" eyebrow="přístupy · mapování · poslední sync" className="span-7">
        <div className="connector-grid">
          {resource.data.connectors.map((connector) => (
            <article className="connector-card" key={connector.code}>
              <div className="runtime-card-icon">{connector.category.slice(0, 2)}</div>
              <div>
                <strong>{connector.title}</strong>
                <p>{connector.code} · {connector.mode} · {connector.capabilities.slice(0, 3).join(', ')}</p>
              </div>
              <Badge tone={healthTone(connector.health)}>{connector.health}</Badge>
              <small>{connector.openEvents} otevřeno · {connector.deadLetters} DLQ</small>
            </article>
          ))}
        </div>
      </Card>

      <Card title="Kontrola produkce" eyebrow="pojistky před spuštěním" className="span-5">
        <div className="runtime-list">
          {resource.data.productionChecklist.map((item) => (
            <article key={item.code}>
              <div><strong>{item.label}</strong><p>{item.code}</p></div>
              <Badge tone={checklistTone(item.status)}>{item.status}</Badge>
            </article>
          ))}
        </div>
        <div className="runtime-note">
          <strong>Reconciliation</strong>
          <p>{resource.data.reconciliation.status} · {resource.data.reconciliation.nextRunHint}</p>
        </div>
      </Card>

      <Card title="Fronta událostí" eyebrow="opakování webhooků · dead-letter monitoring" className="span-12">
        <div className="runtime-list runtime-list--grid">
          {resource.data.events.map((event) => (
            <article key={event.id}>
              <div>
                <strong>{event.connectorCode} · {event.flow}</strong>
                <p>{event.externalId} · pokus {event.attempts}/{event.maxAttempts}{event.lastError ? ` · ${event.lastError}` : ''}</p>
              </div>
              <Badge tone={stateTone(event.state)}>{event.state}</Badge>
            </article>
          ))}
        </div>
      </Card>
      <div className="span-12"><ActionStatus mutation={mutation} /></div>
    </div>
  );
}
