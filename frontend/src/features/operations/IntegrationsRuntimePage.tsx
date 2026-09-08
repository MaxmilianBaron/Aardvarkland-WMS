import { useMemo } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import {
  applyOpsIntegrationEvent,
  getOpsIntegrationCommandCenter,
  ingestOpsIntegrationEvent,
  retryOpsIntegrationEvent,
  runOpsReconciliation,
  testOpsPrintLabel,
} from '../../core/api/wms';
import { useWorkspace } from '../../core/workspace/workspace';

type RuntimeIntegrationState = 'READY' | 'WAITING' | 'RETRYING' | 'DEAD_LETTER' | 'APPLIED' | string;
type ConnectorHealth = 'CONNECTED' | 'DEGRADED' | 'MISSING_CREDENTIALS' | string;

interface RuntimeConnector {
  code: string;
  title: string;
  category: string;
  mode: string;
  health: ConnectorHealth;
  openEvents: number;
  deadLetters: number;
  lastSyncAt: string | null;
  requiredSecrets: string[];
  capabilities: string[];
}

interface RuntimeIntegrationEvent {
  id: string;
  connectorCode: string;
  flow: string;
  state: RuntimeIntegrationState;
  externalId: string;
  attempts: number;
  maxAttempts: number;
  retryAfter: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface RuntimeIntegrationCommandCenter {
  warehouseId: string;
  connectors: RuntimeConnector[];
  events: RuntimeIntegrationEvent[];
  deadLetterCount: number;
  retryableCount: number;
  reconciliation: {
    lastRunAt: string | null;
    status: string;
    mismatches: number;
    nextRunHint: string;
  };
  productionChecklist: Array<{ code: string; label: string; status: 'ok' | 'watch' | 'missing' }>;
}

const fallbackCommandCenter: RuntimeIntegrationCommandCenter = {
  warehouseId: 'MAIN',
  connectors: [],
  events: [],
  deadLetterCount: 0,
  retryableCount: 0,
  reconciliation: {
    lastRunAt: null,
    status: 'NOT_RUN',
    mismatches: 0,
    nextRunHint: '',
  },
  productionChecklist: [],
};

export function IntegrationsRuntimePage() {
  const { warehouseId } = useWorkspace();
  const mutation = useApiMutation();
  const resource = useApiResource<RuntimeIntegrationCommandCenter>({
    fallback: { ...fallbackCommandCenter, warehouseId },
    loader: () => getOpsIntegrationCommandCenter<unknown>(warehouseId),
    map: mapCommandCenter,
    dependencies: [warehouseId],
  });
  const data = resource.data;
  const firstRetryable = useMemo(
    () => data.events.find((event) => event.state === 'DEAD_LETTER' || event.state === 'WAITING' || event.state === 'RETRYING'),
    [data.events],
  );
  const firstApplicable = useMemo(
    () => data.events.find((event) => event.state !== 'APPLIED'),
    [data.events],
  );

  async function ingestSampleOrder() {
    await mutation.run('Načíst e-shop událost', () =>
      ingestOpsIntegrationEvent(warehouseId, {
        connectorCode: 'ECOMMERCE',
        flow: 'order.import',
        externalId: `SHOP-${Date.now().toString().slice(-5)}`,
        state: 'WAITING',
        payload: { orderNumber: `SO-${Date.now().toString().slice(-5)}`, source: 'ui-sample' },
      }),
    );
    resource.refresh();
  }

  async function retryEvent(event?: RuntimeIntegrationEvent) {
    if (!event) return;
    await mutation.run('Opakovat integrační událost', () => retryOpsIntegrationEvent(warehouseId, event.id));
    resource.refresh();
  }

  async function applyEvent(event?: RuntimeIntegrationEvent) {
    if (!event) return;
    await mutation.run('Aplikovat integrační událost', () =>
      applyOpsIntegrationEvent(warehouseId, event.id, {
        mapping: { externalId: event.externalId, wmsReference: `WMS-${event.externalId}` },
        note: 'Aplikováno z řízení provozu.',
      }),
    );
    resource.refresh();
  }

  async function runReconcile() {
    await mutation.run('Spustit párování', () => runOpsReconciliation(warehouseId, { dryRun: true }));
    resource.refresh();
  }

  async function testLabel() {
    await mutation.run('Vykreslit testovací štítek', () => testOpsPrintLabel(warehouseId, { dryRun: true, reference: `LBL-${Date.now().toString().slice(-5)}` }));
    resource.refresh();
  }

  return (
    <div className="page-grid ops-runtime-page">
      <div className="span-12"><DataSourceBanner label="Běh integrací" resource={resource} /></div>
      <section className="rf-console-hero span-12">
        <div>
          <p className="eyebrow">produkční integrace</p>
          <h1>Řízení integrací</h1>
          <p>Běh ERP, e-shopu, dopravců, EDI a tisku s opakováním, dead-lettery, párováním a mapováním událostí.</p>
        </div>
        <div className="rf-console-hero__actions">
          <Badge tone={data.deadLetterCount ? 'critical' : 'good'}>{data.deadLetterCount} dead-letterů</Badge>
          <Button size="sm" onClick={ingestSampleOrder}>Načíst objednávku</Button>
          <Button size="sm" onClick={() => { void retryEvent(firstRetryable); }} disabled={!firstRetryable}>Opakovat další</Button>
          <Button size="sm" tone="primary" onClick={runReconcile}>Spárovat</Button>
        </div>
      </section>

      <Card title="Konektory" eyebrow="ERP · e-shop · dopravci · EDI · tisk" className="span-5">
        <div className="ops-connector-list">
          {data.connectors.map((connector) => (
            <article key={connector.code}>
              <div>
                <strong>{connector.code}</strong>
                <span>{connector.title}</span>
                <small>{connector.capabilities.slice(0, 3).join(' · ')}</small>
              </div>
              <Badge tone={healthTone(connector.health)} compact>{healthLabel(connector.health)}</Badge>
            </article>
          ))}
        </div>
      </Card>

      <Card title="Kontrola produkce" eyebrow="pojistky před spuštěním" className="span-7">
        <div className="ops-checklist">
          {data.productionChecklist.map((item) => (
            <article key={item.code}>
              <Badge tone={item.status === 'ok' ? 'good' : item.status === 'watch' ? 'warning' : 'critical'} compact>{checklistLabel(item.status)}</Badge>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
        <div className="ops-reconciliation-box">
          <div>
            <span>Párování</span>
            <strong>{stateLabel(data.reconciliation.status)}</strong>
            <small>{data.reconciliation.nextRunHint}</small>
          </div>
          <div>
            <span>Neshody</span>
            <strong>{data.reconciliation.mismatches}</strong>
            <small>{data.reconciliation.lastRunAt ? new Date(data.reconciliation.lastRunAt).toLocaleString() : 'zatím neběželo'}</small>
          </div>
          <Button size="sm" onClick={testLabel}>Test štítku</Button>
        </div>
      </Card>

      <Card title="Fronta událostí" eyebrow="idempotence · mapování · opakování" className="span-12" action={<Button size="sm" onClick={() => { void applyEvent(firstApplicable); }} disabled={!firstApplicable}>Aplikovat další</Button>}>
        <div className="ops-event-table">
          <div className="ops-event-table__head"><span>Konektor</span><span>Tok</span><span>Externí ID</span><span>Stav</span><span>Pokusy</span><span>Akce</span></div>
          {data.events.slice(0, 12).map((event) => (
            <article key={event.id}>
              <span>{event.connectorCode}</span>
              <span>{event.flow}</span>
              <strong>{event.externalId}</strong>
              <Badge tone={eventTone(event.state)} compact>{stateLabel(event.state)}</Badge>
              <span>{event.attempts}/{event.maxAttempts}</span>
              <div className="ops-event-table__actions">
                <Button size="sm" onClick={() => { void retryEvent(event); }} disabled={event.state === 'APPLIED'}>Opakovat</Button>
                <Button size="sm" tone="primary" onClick={() => { void applyEvent(event); }} disabled={event.state === 'APPLIED'}>Aplikovat</Button>
              </div>
            </article>
          ))}
        </div>
      </Card>
      <div className="span-12"><ActionStatus mutation={mutation} /></div>
    </div>
  );
}

function mapCommandCenter(payload: unknown): RuntimeIntegrationCommandCenter {
  const row = asRecord(payload);
  const reconciliation = asRecord(row['reconciliation']);
  return {
    warehouseId: text(row['warehouseId'], fallbackCommandCenter.warehouseId),
    connectors: array(row['connectors']).map(mapConnector),
    events: array(row['events']).map(mapEvent),
    deadLetterCount: numberValue(row['deadLetterCount'], 0),
    retryableCount: numberValue(row['retryableCount'], 0),
    reconciliation: {
      lastRunAt: nullableText(reconciliation['lastRunAt']),
      status: text(reconciliation['status'], 'NOT_RUN'),
      mismatches: numberValue(reconciliation['mismatches'], 0),
      nextRunHint: text(reconciliation['nextRunHint'], 'Spusť párování před ostrým spuštěním.'),
    },
    productionChecklist: array(row['productionChecklist']).map(mapChecklist),
  };
}

function mapConnector(value: unknown): RuntimeConnector {
  const row = asRecord(value);
  return {
    code: text(row['code'], 'CONNECTOR'),
    title: text(row['title'], 'Konektor'),
    category: text(row['category'], 'WEBHOOK'),
    mode: text(row['mode'], 'SANDBOX'),
    health: text(row['health'], 'DEGRADED'),
    openEvents: numberValue(row['openEvents'], 0),
    deadLetters: numberValue(row['deadLetters'], 0),
    lastSyncAt: nullableText(row['lastSyncAt']),
    requiredSecrets: array(row['requiredSecrets']).map((item) => text(item, '')).filter(Boolean),
    capabilities: array(row['capabilities']).map((item) => text(item, '')).filter(Boolean),
  };
}

function mapEvent(value: unknown): RuntimeIntegrationEvent {
  const row = asRecord(value);
  return {
    id: text(row['id'], `event-${Math.random().toString(36).slice(2)}`),
    connectorCode: text(row['connectorCode'], 'CONNECTOR'),
    flow: text(row['flow'], 'event.flow'),
    state: text(row['state'], 'WAITING'),
    externalId: text(row['externalId'], 'external-id'),
    attempts: numberValue(row['attempts'], 0),
    maxAttempts: numberValue(row['maxAttempts'], 5),
    retryAfter: nullableText(row['retryAfter']),
    lastError: nullableText(row['lastError']),
    updatedAt: text(row['updatedAt'], new Date().toISOString()),
  };
}

function mapChecklist(value: unknown): { code: string; label: string; status: 'ok' | 'watch' | 'missing' } {
  const row = asRecord(value);
  const status = text(row['status'], 'watch');
  return {
    code: text(row['code'], 'check'),
    label: text(row['label'], 'Kontrolní bod'),
    status: status === 'ok' || status === 'watch' || status === 'missing' ? status : 'watch',
  };
}

function healthTone(value: string) {
  if (value === 'CONNECTED') return 'good';
  if (value === 'MISSING_CREDENTIALS') return 'critical';
  return 'warning';
}

function eventTone(value: string) {
  if (value === 'APPLIED' || value === 'READY') return 'good';
  if (value === 'DEAD_LETTER') return 'critical';
  if (value === 'RETRYING' || value === 'WAITING') return 'warning';
  return 'neutral';
}

function healthLabel(value: string) {
  const map: Record<string, string> = {
    CONNECTED: 'Připojeno',
    READY: 'Připraveno',
    DEGRADED: 'Omezeno',
    MISSING_CREDENTIALS: 'Chybí přístupy',
  };
  return map[value] ?? value;
}

function stateLabel(value: string) {
  const map: Record<string, string> = {
    READY: 'Připraveno',
    WAITING: 'Čeká',
    RETRYING: 'Opakuje se',
    DEAD_LETTER: 'Dead-letter',
    APPLIED: 'Aplikováno',
    NOT_RUN: 'Neběželo',
  };
  return map[value] ?? value;
}

function checklistLabel(value: string) {
  const map: Record<string, string> = {
    ok: 'OK',
    watch: 'Pozor',
    missing: 'Chybí',
  };
  return map[value] ?? value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
