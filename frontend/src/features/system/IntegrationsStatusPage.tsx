import { languageLocale, pickLanguage } from '../../core/i18n/i18n';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useApiResource } from '../../core/api/useApiResource';
import { getOpsIntegrationCommandCenter } from '../../core/api/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface IntegrationConnector {
  code: string;
  title: string;
  mode: string;
  health: string;
  lastSyncAt: string | null;
  openEvents: number;
  deadLetters: number;
}

interface IntegrationStatus {
  connectors: IntegrationConnector[];
  deadLetterCount: number;
  retryableCount: number;
  reconciliation: {
    status: string;
    lastRunAt: string | null;
  };
}

const emptyStatus: IntegrationStatus = {
  connectors: [],
  deadLetterCount: 0,
  retryableCount: 0,
  reconciliation: { status: 'NOT_RUN', lastRunAt: null },
};

export function IntegrationsStatusPage() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const locale = languageLocale(language);
  const resource = useApiResource<IntegrationStatus>({
    fallback: emptyStatus,
    productionFallback: emptyStatus,
    loader: () => getOpsIntegrationCommandCenter<unknown>(warehouseId),
    map: mapStatus,
    dependencies: [warehouseId],
  });

  return (
    <div className="page-grid">
      <section className="wms-page-intro span-12">
        <div>
          <h2>{text.title}</h2>
        </div>
        {resource.data.deadLetterCount > 0 && <Badge tone="warning">{resource.data.deadLetterCount} {text.deadLetters}</Badge>}
      </section>

      <Card
        title={text.connections}
        className="span-12"
        action={<Button size="sm" type="button" onClick={resource.refresh} disabled={resource.status === 'loading'}>{text.refresh}</Button>}
      >
        {resource.status === 'error' && (
          <div className="inline-banner inline-banner--warning" role="alert">
            <span>{text.loadError}</span>
          </div>
        )}

        {resource.data.connectors.length === 0 ? (
          <EmptyState title={text.emptyTitle} text={text.emptyText} />
        ) : (
          <div className="integration-list">
            {resource.data.connectors.map((connector) => (
              <article className="integration-row" key={connector.code}>
                <div className="integration-row__main">
                  <strong>{connector.title}</strong>
                  <Badge tone={healthTone(connector.health)}>{healthLabel(connector.health, language)}</Badge>
                </div>
                <div className="integration-row__meta">
                  <span>{connector.openEvents} {text.events}</span>
                  <span>{connector.lastSyncAt ? new Date(connector.lastSyncAt).toLocaleString(locale) : text.notSynced}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {resource.data.connectors.length > 0 && (
        <Card title={text.operations} className="span-12">
          <div className="metric-stack metric-stack--compact">
            <article><span>{text.retryable}</span><strong>{resource.data.retryableCount}</strong></article>
            <article><span>{text.reconciliation}</span><strong>{stateLabel(resource.data.reconciliation.status, language)}</strong></article>
            <article><span>{text.lastRun}</span><strong>{resource.data.reconciliation.lastRunAt ? new Date(resource.data.reconciliation.lastRunAt).toLocaleDateString(locale) : text.notRun}</strong></article>
          </div>
        </Card>
      )}
    </div>
  );
}

function mapStatus(payload: unknown): IntegrationStatus {
  const row = record(payload);
  const reconciliation = record(row['reconciliation']);
  const connectors = array(row['connectors']).map((value) => {
    const connector = record(value);
    return {
      code: stringValue(connector['code'], 'CONNECTOR'),
      title: stringValue(connector['title'], 'Connection'),
      mode: stringValue(connector['mode'], ''),
      health: stringValue(connector['health'], 'UNKNOWN'),
      lastSyncAt: nullableString(connector['lastSyncAt']),
      openEvents: numberValue(connector['openEvents']),
      deadLetters: numberValue(connector['deadLetters']),
    };
  }).filter(isProductionConnector);

  return {
    connectors,
    deadLetterCount: connectors.reduce((total, connector) => total + connector.deadLetters, 0),
    retryableCount: connectors.reduce((total, connector) => total + connector.openEvents, 0),
    reconciliation: {
      status: stringValue(reconciliation['status'], 'NOT_RUN'),
      lastRunAt: nullableString(reconciliation['lastRunAt']),
    },
  };
}

function isProductionConnector(connector: IntegrationConnector) {
  const mode = connector.mode.toUpperCase();
  const code = connector.code.toUpperCase();
  const title = connector.title.toUpperCase();
  if (mode === 'SANDBOX' || mode === 'DRY_RUN' || mode === 'DEMO' || mode === 'MOCK') return false;
  if (code.endsWith('_DEMO') || code.includes('_PLACEHOLDER') || code.includes('_SANDBOX')) return false;
  if (/(^|_)[A-D]$/.test(code) || /^CARRIER_[A-D]$/.test(code) || /^PRINT_PACK_[0-9]+$/.test(code) || code.includes('CLIENT_')) return false;
  if (title.includes('DEMO') || title.includes('PLACEHOLDER') || title.includes('SANDBOX')) return false;
  return true;
}

function healthTone(value: string) {
  if (value === 'CONNECTED' || value === 'READY' || value === 'OK') return 'good';
  if (value === 'MISSING_CREDENTIALS' || value === 'ERROR') return 'critical';
  return 'warning';
}

function healthLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechHealth, en: englishHealth, ua: ukrainianHealth });
  return labels[value] ?? value;
}

function stateLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechState, en: englishState, ua: ukrainianState });
  return labels[value] ?? value;
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

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const czech = {
  title: 'Integrace',
  subtitle: 'Napojení e-shopu, dopravců a účetnictví.',
  deadLetters: 'chyb',
  connections: 'Napojení',
  operations: 'Provoz',
  refresh: 'Obnovit',
  loadError: 'Integrace se nepodařilo načíst.',
  events: 'událostí',
  retryable: 'Lze opakovat',
  reconciliation: 'Párování',
  lastRun: 'Poslední běh',
  notRun: 'Neběželo',
  notSynced: 'Bez synchronizace',
  emptyTitle: 'Žádné integrace',
  emptyText: 'Zatím nejsou nastavená žádná skutečná napojení.',
};

const english = {
  title: 'Integrations',
  subtitle: 'Connections to e-shop, carriers, and accounting.',
  deadLetters: 'errors',
  connections: 'Connections',
  operations: 'Operations',
  refresh: 'Refresh',
  loadError: 'Integrations could not be loaded.',
  events: 'events',
  retryable: 'Retryable',
  reconciliation: 'Reconciliation',
  lastRun: 'Last run',
  notRun: 'Not run',
  notSynced: 'No sync',
  emptyTitle: 'No integrations',
  emptyText: 'No real connections have been configured yet.',
};

const ukrainian = {
  title: 'Інтеграції',
  subtitle: 'Підключення до e-shop, перевізників та бухгалтерії.',
  deadLetters: 'помилок',
  connections: 'Підключення',
  operations: 'Операції',
  refresh: 'Оновити',
  loadError: 'Не вдалося завантажити інтеграції.',
  events: 'подій',
  retryable: 'Можна повторити',
  reconciliation: 'Зіставлення',
  lastRun: 'Останній запуск',
  notRun: 'Не запускалось',
  notSynced: 'Без синхронізації',
  emptyTitle: 'Немає інтеграцій',
  emptyText: 'Поки не налаштовано жодного реального підключення.',
};

const czechHealth: Record<string, string> = {
  CONNECTED: 'Připojeno',
  READY: 'Připraveno',
  DEGRADED: 'Omezeno',
  MISSING_CREDENTIALS: 'Chybí přístupy',
  ERROR: 'Chyba',
  UNKNOWN: 'Neznámé',
};

const englishHealth: Record<string, string> = {
  CONNECTED: 'Connected',
  READY: 'Ready',
  DEGRADED: 'Limited',
  MISSING_CREDENTIALS: 'Missing credentials',
  ERROR: 'Error',
  UNKNOWN: 'Unknown',
};

const ukrainianHealth: Record<string, string> = {
  CONNECTED: 'Підключено',
  READY: 'Готово',
  DEGRADED: 'Обмежено',
  MISSING_CREDENTIALS: 'Бракує доступів',
  ERROR: 'Помилка',
  UNKNOWN: 'Невідомо',
};

const czechState: Record<string, string> = {
  NOT_RUN: 'Neběželo',
  OK: 'V pořádku',
  ERROR: 'Chyba',
};

const englishState: Record<string, string> = {
  NOT_RUN: 'Not run',
  OK: 'OK',
  ERROR: 'Error',
};

const ukrainianState: Record<string, string> = {
  NOT_RUN: 'Не запускалось',
  OK: 'В порядку',
  ERROR: 'Помилка',
};
