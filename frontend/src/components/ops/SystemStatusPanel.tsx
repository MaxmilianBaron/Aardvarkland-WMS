import { pickLanguage } from '../../core/i18n/i18n';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useApiResource } from '../../core/api/useApiResource';
import { getHealth, getReadiness, getWarehouseIntegrity } from '../../core/api/wms';
import { useWorkspace } from '../../core/workspace/workspace';

interface HealthView { status: string; issueKeys: string[]; }
interface IntegrityView { status: string; issueCount: number; }

const emptyHealth: HealthView = { status: '-', issueKeys: [] };
const emptyIntegrity: IntegrityView = { status: '-', issueCount: 0 };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = '-'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapHealth(payload: unknown): HealthView {
  const item = record(payload);
  const checks = Array.isArray(item.checks) ? item.checks : [];
  return {
    status: stringValue(item.status ?? item.ok),
    issueKeys: checks
      .map(record)
      .filter((check) => stringValue(check.status, 'ok').toLowerCase() !== 'ok')
      .map((check) => stringValue(check.name, 'system')),
  };
}

function mapIntegrity(payload: unknown): IntegrityView {
  const item = record(payload);
  const summary = record(item.summary);
  const issues = item.issues;
  return {
    status: stringValue(item.status),
    issueCount: Array.isArray(issues)
      ? issues.length
      : numberValue(summary.errorCount) + numberValue(summary.warningCount),
  };
}

function isGoodStatus(status: string) {
  return ['live', 'ready', 'ok', 'passed', 'healthy'].includes(status.toLowerCase());
}

export function SystemStatusPanel() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const health = useApiResource({ fallback: emptyHealth, productionFallback: emptyHealth, loader: () => getHealth<unknown>({ timeoutMs: 8_000 }), map: mapHealth });
  const readiness = useApiResource({ fallback: emptyHealth, productionFallback: emptyHealth, loader: () => getReadiness<unknown>({ timeoutMs: 8_000 }), map: mapHealth });
  const integrity = useApiResource({ fallback: emptyIntegrity, productionFallback: emptyIntegrity, loader: () => getWarehouseIntegrity<unknown>(warehouseId, { timeoutMs: 12_000 }), map: mapIntegrity });
  const refreshAll = () => { health.refresh(); readiness.refresh(); integrity.refresh(); };

  const loading = [health.status, readiness.status, integrity.status].includes('loading');
  const issues = [
    health.status === 'error' || !isGoodStatus(health.data.status) ? text.backend : null,
    readiness.status === 'error'
      ? text.database
      : !isGoodStatus(readiness.data.status)
        ? readiness.data.issueKeys.map((key) => text.issueLabels[key] ?? text.issueLabels.system).join(', ') || text.database
        : null,
    integrity.status === 'error' || integrity.data.issueCount > 0 || !isGoodStatus(integrity.data.status) ? text.integrity : null,
  ].filter(Boolean) as string[];
  const hasIssue = issues.length > 0;
  const title = loading ? text.loadingTitle : hasIssue ? text.problemTitle : text.okTitle;
  const detail = loading ? text.loadingDetail : hasIssue ? `${text.check}: ${issues.join(', ')}` : text.okDetail;

  return (
    <div className="system-status-panel system-status-panel--compact">
      <div className="system-status-summary">
        <Badge tone={loading ? 'neutral' : hasIssue ? 'warning' : 'good'}>
          {loading ? text.loading : hasIssue ? text.needsCheck : text.available}
        </Badge>
        <div className="system-status-summary__copy">
          <strong>{title}</strong>
          <small>{detail}</small>
        </div>
        <Button size="sm" tone="secondary" onClick={refreshAll}>{text.refresh}</Button>
      </div>
    </div>
  );
}

const czech = {
  available: 'Dostupné',
  needsCheck: 'Ke kontrole',
  loading: 'Ověřuji',
  loadingTitle: 'Ověřuji stav systému.',
  loadingDetail: 'Kontroluji server a databázi.',
  okTitle: 'Systém je dostupný.',
  okDetail: 'Server a databáze odpovídají.',
  problemTitle: 'Systém vyžaduje kontrolu.',
  check: 'Zkontrolovat',
  backend: 'server',
  database: 'databázi',
  integrity: 'integritu skladu',
  issueLabels: {
    database: 'databázi',
    rateLimitStore: 'rate limit',
    outbox: 'outbox',
    queueWorker: 'worker',
    printQueue: 'tiskovou frontu',
    system: 'systém',
  } as Record<string, string>,
  refresh: 'Obnovit',
};

const english = {
  available: 'Available',
  needsCheck: 'Check needed',
  loading: 'Checking',
  loadingTitle: 'Checking system status.',
  loadingDetail: 'Checking server and database.',
  okTitle: 'System is available.',
  okDetail: 'Server and database are responding.',
  problemTitle: 'System needs attention.',
  check: 'Check',
  backend: 'server',
  database: 'database',
  integrity: 'warehouse integrity',
  issueLabels: {
    database: 'database',
    rateLimitStore: 'rate limit',
    outbox: 'outbox',
    queueWorker: 'worker',
    printQueue: 'print queue',
    system: 'system',
  } as Record<string, string>,
  refresh: 'Refresh',
};

const ukrainian = {
  available: 'Доступно',
  needsCheck: 'Потрібна перевірка',
  loading: 'Перевіряю',
  loadingTitle: 'Перевіряю стан системи.',
  loadingDetail: 'Перевіряю сервер і базу даних.',
  okTitle: 'Система доступна.',
  okDetail: 'Сервер і база даних відповідають.',
  problemTitle: 'Система потребує уваги.',
  check: 'Перевірити',
  backend: 'сервер',
  database: 'базу даних',
  integrity: 'цілісність складу',
  issueLabels: {
    database: 'базу даних',
    rateLimitStore: 'rate limit',
    outbox: 'outbox',
    queueWorker: 'worker',
    printQueue: 'чергу друку',
    system: 'систему',
  } as Record<string, string>,
  refresh: 'Оновити',
};
