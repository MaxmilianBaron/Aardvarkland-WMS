import { languageLocale, pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ResourceFreshness } from '../../components/ui/ResourceFreshness';
import { useApiResource } from '../../core/api/useApiResource';
import { getControlTower } from '../../core/api/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface StatusCount {
  key: string;
  count: number;
}

interface ControlTowerRisk {
  code: string;
  severity: string;
  message: string;
  metric: number;
}

interface ControlTowerView {
  status: string;
  generatedAt: string | null;
  windows: {
    cutoffWindowHours: number;
    staleTaskMinutes: number;
  };
  backlog: {
    openTasks: number;
    staleTasks: number;
    tasksByStatus: StatusCount[];
    tasksByType: StatusCount[];
  };
  outbound: {
    cutoffRiskOrders: number;
    exceptionOrders: number;
    ordersByStatus: StatusCount[];
  };
  waves: {
    activeWaves: number;
    unreleasedWaves: number;
    wavesByStatus: StatusCount[];
  };
  shipping: {
    carrierExceptions: number;
    shipmentsByStatus: StatusCount[];
  };
  exceptions: {
    openExceptions: number;
    criticalOpenExceptions: number;
    exceptionsBySeverity: StatusCount[];
  };
  slotting: {
    openRecommendations: number;
  };
  dockBoard: {
    doors: DockDoorRow[];
    scheduledAppointments: number;
    waitingTrailers: number;
    dwellRiskTrailers: number;
    unavailableDoors: number;
  };
  slaMonitor: {
    dueSoonOrders: number;
    overdueOrders: number;
    staleTasks: number;
    carrierExceptions: number;
    status: string;
  };
  risks: ControlTowerRisk[];
}

interface DockDoorRow {
  id: string;
  code: string;
  status: string;
  doorType: string;
  zone: string | null;
  activeAppointmentNumber: string | null;
  activeTrailerNumber: string | null;
}

interface AlertRow {
  code: string;
  title: string;
  detail: string;
  count: number;
  tone: 'good' | 'warning' | 'critical' | 'neutral';
}

interface DrilldownRow {
  group: string;
  key: string;
  label: string;
  count: number;
  tone: 'good' | 'warning' | 'critical' | 'neutral';
}

const emptyView: ControlTowerView = {
  status: 'UNKNOWN',
  generatedAt: null,
  windows: { cutoffWindowHours: 0, staleTaskMinutes: 0 },
  backlog: { openTasks: 0, staleTasks: 0, tasksByStatus: [], tasksByType: [] },
  outbound: { cutoffRiskOrders: 0, exceptionOrders: 0, ordersByStatus: [] },
  waves: { activeWaves: 0, unreleasedWaves: 0, wavesByStatus: [] },
  shipping: { carrierExceptions: 0, shipmentsByStatus: [] },
  exceptions: { openExceptions: 0, criticalOpenExceptions: 0, exceptionsBySeverity: [] },
  slotting: { openRecommendations: 0 },
  dockBoard: { doors: [], scheduledAppointments: 0, waitingTrailers: 0, dwellRiskTrailers: 0, unavailableDoors: 0 },
  slaMonitor: { dueSoonOrders: 0, overdueOrders: 0, staleTasks: 0, carrierExceptions: 0, status: 'OK' },
  risks: [],
};

export function ControlTowerPage() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const resource = useApiResource<ControlTowerView>({
    fallback: emptyView,
    productionFallback: emptyView,
    loader: () => getControlTower<unknown>(warehouseId),
    map: mapControlTower,
    dependencies: [warehouseId],
    refreshIntervalMs: 30000,
    refreshOnRealtime: true,
    staleAfterMs: 90000,
  });
  const alertRows = buildAlertRows(resource.data.risks, text, language);
  const drilldownRows = buildDrilldownRows(resource.data, text, language);

  const riskColumns: Column<ControlTowerRisk>[] = [
    { key: 'severity', label: text.riskColumns.severity, render: (row) => <Badge tone={severityTone(row.severity)}>{severityLabel(row.severity, language)}</Badge> },
    { key: 'code', label: text.riskColumns.area, render: (row) => <strong>{riskCodeLabel(row.code, language)}</strong> },
    { key: 'message', label: text.riskColumns.message, render: (row) => messageLabel(row.message, language) },
    { key: 'metric', label: text.riskColumns.metric, align: 'right', render: (row) => row.metric },
  ];
  const drilldownColumns: Column<DrilldownRow>[] = [
    { key: 'group', label: text.drilldownColumns.group, render: (row) => row.group },
    { key: 'state', label: text.drilldownColumns.state, render: (row) => <Badge tone={row.tone}>{row.label}</Badge> },
    { key: 'count', label: text.drilldownColumns.count, align: 'right', render: (row) => row.count },
  ];
  const dockColumns: Column<DockDoorRow>[] = [
    { key: 'code', label: text.dockColumns.door, render: (row) => <strong>{row.code}</strong> },
    { key: 'status', label: text.dockColumns.status, render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'good' : 'warning'}>{statusKeyLabel(row.status, language)}</Badge> },
    { key: 'zone', label: text.dockColumns.zone, render: (row) => row.zone || text.notSet },
    { key: 'appointment', label: text.dockColumns.appointment, render: (row) => row.activeAppointmentNumber || text.notSet },
    { key: 'trailer', label: text.dockColumns.trailer, render: (row) => row.activeTrailerNumber || text.notSet },
  ];

  return (
    <div className="page-grid">
      <div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div>

      <section className="wms-page-intro span-12">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          {resource.data.generatedAt && <p>{text.generatedAt}: {formatDate(resource.data.generatedAt, language)}</p>}
        </div>
        <div className="button-row">
          <ResourceFreshness status={resource.status} refreshedAt={resource.refreshedAt} ageSeconds={resource.ageSeconds} stale={resource.stale} />
          <Badge tone={resource.data.status === 'OK' ? 'good' : resource.data.status === 'ERROR' ? 'critical' : 'warning'}>
            {stateLabel(resource.data.status, language)}
          </Badge>
          <Button size="sm" type="button" onClick={resource.refresh} disabled={resource.status === 'loading'}>{text.refresh}</Button>
        </div>
      </section>

      {resource.status === 'loading' && (
        <div className="inline-banner span-12" role="status">
          <span>{text.loading}</span>
        </div>
      )}

      <Card title={text.shiftTitle} eyebrow={text.shiftEyebrow} className="span-12">
        <div className="metric-stack metric-stack--inline">
          <article><span>{text.metrics.openTasks}</span><strong>{resource.data.backlog.openTasks}</strong></article>
          <article><span>{text.metrics.staleTasks}</span><strong>{resource.data.backlog.staleTasks}</strong></article>
          <article><span>{text.metrics.cutoffRisk}</span><strong>{resource.data.outbound.cutoffRiskOrders}</strong></article>
          <article><span>{text.metrics.openExceptions}</span><strong>{resource.data.exceptions.openExceptions}</strong></article>
          <article><span>{text.metrics.criticalExceptions}</span><strong>{resource.data.exceptions.criticalOpenExceptions}</strong></article>
          <article><span>{text.metrics.carrierExceptions}</span><strong>{resource.data.shipping.carrierExceptions}</strong></article>
          <article><span>{text.metrics.activeWaves}</span><strong>{resource.data.waves.activeWaves}</strong></article>
          <article><span>{text.metrics.slotting}</span><strong>{resource.data.slotting.openRecommendations}</strong></article>
        </div>
      </Card>

      <Card title={text.slaTitle} eyebrow={text.slaEyebrow} className="span-5">
        <div className="settings-stack">
          <article><span>{text.sla.status}</span><strong>{stateLabel(resource.data.slaMonitor.status, language)}</strong></article>
          <article><span>{text.sla.dueSoon}</span><strong>{resource.data.slaMonitor.dueSoonOrders}</strong></article>
          <article><span>{text.sla.overdue}</span><strong>{resource.data.slaMonitor.overdueOrders}</strong></article>
          <article><span>{text.sla.staleTasks}</span><strong>{resource.data.slaMonitor.staleTasks}</strong></article>
        </div>
      </Card>

      <Card title={text.dockTitle} eyebrow={text.dockEyebrow} className="span-7">
        <div className="metric-stack metric-stack--inline">
          <article><span>{text.dockMetrics.appointments}</span><strong>{resource.data.dockBoard.scheduledAppointments}</strong></article>
          <article><span>{text.dockMetrics.waiting}</span><strong>{resource.data.dockBoard.waitingTrailers}</strong></article>
          <article><span>{text.dockMetrics.dwellRisk}</span><strong>{resource.data.dockBoard.dwellRiskTrailers}</strong></article>
          <article><span>{text.dockMetrics.unavailable}</span><strong>{resource.data.dockBoard.unavailableDoors}</strong></article>
        </div>
        <DataTable
          rows={resource.data.dockBoard.doors}
          columns={dockColumns}
          getRowKey={(row) => row.id || row.code}
          emptyTitle={text.dockEmptyTitle}
          emptyText={text.dockEmptyText}
        />
      </Card>

      <Card title={text.alertsTitle} eyebrow={text.alertsEyebrow} className="span-7">
        {alertRows.length ? (
          <div className="activity-list">
            {alertRows.map((alert) => (
              <article key={alert.code}>
                <Badge tone={alert.tone}>{alert.count}</Badge>
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title={text.emptyAlertsTitle} text={text.emptyAlertsText} />
        )}
      </Card>

      <Card title={text.windowsTitle} eyebrow={text.windowsEyebrow} className="span-5">
        <div className="settings-stack">
          <article><span>{text.windows.cutoff}</span><strong>{formatHours(resource.data.windows.cutoffWindowHours, text)}</strong></article>
          <article><span>{text.windows.staleTask}</span><strong>{formatMinutes(resource.data.windows.staleTaskMinutes, text)}</strong></article>
          <article><span>{text.windows.snapshot}</span><strong>{resource.data.generatedAt ? formatDate(resource.data.generatedAt, language) : text.windows.notAvailable}</strong></article>
        </div>
      </Card>

      <Card title={text.flowTitle} eyebrow={text.flowEyebrow} className="span-6">
        <div className="event-list event-list--compact">
          {renderStatusList(resource.data.backlog.tasksByType, text.emptyFlow, language, taskTypeLabel)}
        </div>
      </Card>

      <Card title={text.outboundTitle} eyebrow={text.outboundEyebrow} className="span-6">
        <div className="event-list event-list--compact">
          {renderStatusList(resource.data.outbound.ordersByStatus, text.emptyFlow, language)}
        </div>
      </Card>

      <Card title={text.risksTitle} eyebrow={text.risksEyebrow} className="span-12">
        {resource.data.risks.length ? (
          <DataTable rows={resource.data.risks} columns={riskColumns} getRowKey={(row) => row.code} emptyTitle={text.emptyTitle} emptyText={text.emptyText} />
        ) : (
          <EmptyState title={text.emptyTitle} text={text.emptyText} />
        )}
      </Card>

      <Card title={text.drilldownTitle} eyebrow={text.drilldownEyebrow} className="span-12">
        <DataTable
          rows={drilldownRows}
          columns={drilldownColumns}
          getRowKey={(row) => `${row.group}-${row.key}`}
          emptyTitle={text.drilldownEmptyTitle}
          emptyText={text.drilldownEmptyText}
        />
      </Card>
    </div>
  );
}

function mapControlTower(payload: unknown): ControlTowerView {
  const row = record(payload);
  const backlog = record(row['backlog']);
  const outbound = record(row['outbound']);
  const waves = record(row['waves']);
  const shipping = record(row['shipping']);
  const exceptions = record(row['exceptions']);
  const slotting = record(row['slotting']);
  const dockBoard = record(row['dockBoard']);
  const slaMonitor = record(row['slaMonitor']);
  const risks = array(row['risks']).map(mapRisk);
  return {
    status: deriveStatus(risks, numberValue(exceptions['criticalOpenExceptions']), numberValue(exceptions['openExceptions'])),
    generatedAt: nullableString(row['generatedAt']),
    windows: {
      cutoffWindowHours: numberValue(record(row['windows'])['cutoffWindowHours']),
      staleTaskMinutes: numberValue(record(row['windows'])['staleTaskMinutes']),
    },
    backlog: {
      openTasks: numberValue(backlog['openTasks']),
      staleTasks: numberValue(backlog['staleTasks']),
      tasksByStatus: mapStatusCounts(backlog['tasksByStatus']),
      tasksByType: mapStatusCounts(backlog['tasksByType']),
    },
    outbound: {
      cutoffRiskOrders: numberValue(outbound['cutoffRiskOrders']),
      exceptionOrders: numberValue(outbound['exceptionOrders']),
      ordersByStatus: mapStatusCounts(outbound['ordersByStatus']),
    },
    waves: {
      activeWaves: numberValue(waves['activeWaves']),
      unreleasedWaves: numberValue(waves['unreleasedWaves']),
      wavesByStatus: mapStatusCounts(waves['wavesByStatus']),
    },
    shipping: {
      carrierExceptions: numberValue(shipping['carrierExceptions']),
      shipmentsByStatus: mapStatusCounts(shipping['shipmentsByStatus']),
    },
    exceptions: {
      openExceptions: numberValue(exceptions['openExceptions']),
      criticalOpenExceptions: numberValue(exceptions['criticalOpenExceptions']),
      exceptionsBySeverity: mapStatusCounts(exceptions['exceptionsBySeverity']),
    },
    slotting: {
      openRecommendations: numberValue(slotting['openRecommendations']),
    },
    dockBoard: {
      doors: array(dockBoard['doors']).map(mapDockDoor).filter((door) => door.code),
      scheduledAppointments: numberValue(dockBoard['scheduledAppointments']),
      waitingTrailers: numberValue(dockBoard['waitingTrailers']),
      dwellRiskTrailers: numberValue(dockBoard['dwellRiskTrailers']),
      unavailableDoors: numberValue(dockBoard['unavailableDoors']),
    },
    slaMonitor: {
      dueSoonOrders: numberValue(slaMonitor['dueSoonOrders']),
      overdueOrders: numberValue(slaMonitor['overdueOrders']),
      staleTasks: numberValue(slaMonitor['staleTasks']),
      carrierExceptions: numberValue(slaMonitor['carrierExceptions']),
      status: stringValue(slaMonitor['status'], 'OK'),
    },
    risks,
  };
}

function mapDockDoor(value: unknown): DockDoorRow {
  const row = record(value);
  return {
    id: stringValue(row['id'], stringValue(row['code'], '')),
    code: stringValue(row['code'], ''),
    status: stringValue(row['status'], 'UNKNOWN'),
    doorType: stringValue(row['doorType'], 'STANDARD'),
    zone: nullableString(row['zone']),
    activeAppointmentNumber: nullableString(row['activeAppointmentNumber']),
    activeTrailerNumber: nullableString(row['activeTrailerNumber']),
  };
}

function mapRisk(value: unknown): ControlTowerRisk {
  const row = record(value);
  return {
    code: stringValue(row['code'], '-'),
    severity: stringValue(row['severity'], 'LOW'),
    message: stringValue(row['message'], ''),
    metric: numberValue(row['metric']),
  };
}

function mapStatusCounts(value: unknown): StatusCount[] {
  return array(value).map((item) => {
    const row = record(item);
    return { key: stringValue(row['key'], '-'), count: numberValue(row['count']) };
  });
}

function renderStatusList(
  rows: StatusCount[],
  emptyText: string,
  language: Language,
  labeler: (value: string, language: Language) => string = statusKeyLabel,
) {
  if (!rows.length) return <p className="muted-copy">{emptyText}</p>;
  return rows.map((row) => (
    <article key={row.key}>
      <span>{labeler(row.key, language)}</span>
      <strong>{row.count}</strong>
    </article>
  ));
}

function buildAlertRows(
  risks: ControlTowerRisk[],
  text: typeof czech,
  language: Language,
): AlertRow[] {
  return risks.map((risk) => ({
    code: risk.code,
    title: riskCodeLabel(risk.code, language),
    detail: riskActionLabel(risk.code, text),
    count: risk.metric,
    tone: severityTone(risk.severity),
  }));
}

function buildDrilldownRows(view: ControlTowerView, text: typeof czech, language: Language): DrilldownRow[] {
  return [
    ...view.backlog.tasksByStatus.map((row) => drilldownRow(text.drilldownGroups.tasks, row, statusKeyLabel(row.key, language), statusTone(row.key))),
    ...view.outbound.ordersByStatus.map((row) => drilldownRow(text.drilldownGroups.orders, row, statusKeyLabel(row.key, language), statusTone(row.key))),
    ...view.waves.wavesByStatus.map((row) => drilldownRow(text.drilldownGroups.waves, row, statusKeyLabel(row.key, language), statusTone(row.key))),
    ...view.shipping.shipmentsByStatus.map((row) => drilldownRow(text.drilldownGroups.shipments, row, statusKeyLabel(row.key, language), statusTone(row.key))),
    ...view.exceptions.exceptionsBySeverity.map((row) => drilldownRow(text.drilldownGroups.exceptions, row, severityLabel(row.key, language), severityTone(row.key))),
  ];
}

function drilldownRow(group: string, row: StatusCount, label: string, tone: DrilldownRow['tone']): DrilldownRow {
  return { group, key: row.key, label, count: row.count, tone };
}

function deriveStatus(risks: ControlTowerRisk[], criticalExceptions: number, openExceptions: number): string {
  if (criticalExceptions > 0 || risks.some((risk) => risk.severity === 'CRITICAL')) return 'ERROR';
  if (openExceptions > 0 || risks.some((risk) => risk.severity === 'HIGH' || risk.severity === 'MEDIUM')) return 'WARNING';
  return 'OK';
}

function statusTone(value: string): 'good' | 'warning' | 'critical' | 'neutral' {
  if (value === 'DONE' || value === 'COMPLETED' || value === 'SHIPPED') return 'good';
  if (value === 'FAILED' || value === 'EXCEPTION' || value === 'BLOCKED') return 'critical';
  if (value === 'OPEN' || value === 'ASSIGNED' || value === 'IN_PROGRESS' || value === 'PICKING' || value === 'PACKING' || value === 'STAGED' || value === 'LOADING') return 'warning';
  return 'neutral';
}

function severityTone(value: string): 'good' | 'warning' | 'critical' | 'neutral' {
  if (value === 'CRITICAL' || value === 'HIGH') return 'critical';
  if (value === 'MEDIUM') return 'warning';
  if (value === 'LOW') return 'neutral';
  return 'neutral';
}

function stateLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechStates, en: englishStates, ua: ukrainianStates });
  return labels[value] ?? value;
}

function severityLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechSeverity, en: englishSeverity, ua: ukrainianSeverity });
  return labels[value] ?? value;
}

function riskCodeLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechRiskCodes, en: englishRiskCodes, ua: ukrainianRiskCodes });
  return labels[value] ?? labels.UNKNOWN;
}

function riskActionLabel(value: string, text: typeof czech) {
  const actions = text.riskActions as Record<string, string>;
  return actions[value] ?? text.riskActions.default;
}

function statusKeyLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechStatusKeys, en: englishStatusKeys, ua: ukrainianStatusKeys });
  return labels[value] ?? value;
}

function taskTypeLabel(value: string, language: Language) {
  const labels = pickLanguage(language, { cs: czechTaskTypes, en: englishTaskTypes, ua: ukrainianTaskTypes });
  return labels[value] ?? labels.UNKNOWN;
}

function messageLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    'Critical warehouse exceptions are open.': {
      cs: 'Ve skladu jsou otevřené kritické výjimky.',
      en: 'Critical warehouse exceptions are open.',
      ua: 'На складі відкриті критичні винятки.',
    },
    'Orders are approaching carrier cutoff while not shipped.': {
      cs: 'Objednávky se blíží uzávěrce dopravce a ještě nejsou odeslané.',
      en: 'Orders are approaching carrier cutoff while not shipped.',
      ua: 'Замовлення наближаються до дедлайну перевізника і ще не відправлені.',
    },
    'Carrier tracking exceptions need review.': {
      cs: 'Výjimky ve sledování dopravce čekají na kontrolu.',
      en: 'Carrier tracking exceptions need review.',
      ua: 'Винятки у відстеженні перевізника потребують перевірки.',
    },
    'Warehouse tasks have been open longer than the stale-task window.': {
      cs: 'Skladové úkoly jsou otevřené déle než povolený limit.',
      en: 'Warehouse tasks have been open longer than the stale-task window.',
      ua: 'Складські завдання відкриті довше за дозволений ліміт.',
    },
    'Open slotting recommendations can improve pick-path efficiency.': {
      cs: 'Otevřená doporučení lokací mohou zkrátit trasu vychystání.',
      en: 'Open slotting recommendations can improve pick-path efficiency.',
      ua: 'Відкриті рекомендації локацій можуть скоротити маршрут відбору.',
    },
    'Planned/draft pick waves are waiting for release.': {
      cs: 'Naplánované vlny čekají na uvolnění.',
      en: 'Planned/draft pick waves are waiting for release.',
      ua: 'Заплановані хвилі очікують випуску.',
    },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function formatDate(value: string, language?: Language): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(localeFor(language));
}

function formatHours(value: number, text: typeof czech): string {
  return value > 0 ? `${value} ${text.units.hours}` : text.windows.notAvailable;
}

function formatMinutes(value: number, text: typeof czech): string {
  return value > 0 ? `${value} ${text.units.minutes}` : text.windows.notAvailable;
}

function localeFor(language?: Language): string {
  return languageLocale(language ?? 'cs');
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
  banner: 'API řízení provozu',
  eyebrow: 'termíny · výjimky · výkon směny',
  title: 'Provoz',
  generatedAt: 'Aktualizováno',
  refresh: 'Obnovit',
  loading: 'Načítám provozní signály.',
  shiftTitle: 'Řídicí plocha směny',
  shiftEyebrow: 'živé signály',
  alertsTitle: 'Operační upozornění',
  alertsEyebrow: 'co řešit jako první',
  slaTitle: 'SLA monitor',
  slaEyebrow: 'cutoff a zpoždění',
  dockTitle: 'Rampy a vozidla',
  dockEyebrow: 'dock board',
  windowsTitle: 'Hlídací okna',
  windowsEyebrow: 'nastavení výpočtu',
  flowTitle: 'Úkoly podle typu',
  flowEyebrow: 'co právě běží',
  outboundTitle: 'Objednávky podle stavu',
  outboundEyebrow: 'expedice',
  risksTitle: 'Rizika k řešení',
  risksEyebrow: 'priorita',
  drilldownTitle: 'Rozpad provozu',
  drilldownEyebrow: 'stavové skupiny',
  emptyFlow: 'Zatím nejsou k dispozici žádné položky.',
  emptyAlertsTitle: 'Bez upozornění',
  emptyAlertsText: 'Aktuální data neobsahují riziko, které by vyžadovalo zásah.',
  dockEmptyTitle: 'Žádné rampy',
  dockEmptyText: 'Server zatím neposlal rampy ani aktivní vozidla.',
  emptyTitle: 'Žádné živé riziko',
  emptyText: 'Server zatím neposlal výjimku ani riziko k řešení.',
  drilldownEmptyTitle: 'Žádný stav k zobrazení',
  drilldownEmptyText: 'Server zatím neposlal stavové rozdělení úkolů, objednávek, vln ani zásilek.',
  units: { hours: 'h', minutes: 'min' },
  notSet: 'Není nastaveno',
  sla: { status: 'Stav', dueSoon: 'Před cutoffem', overdue: 'Po termínu', staleTasks: 'Staré úkoly' },
  dockMetrics: { appointments: 'Schůzky', waiting: 'Čekající vozidla', dwellRisk: 'Dwell riziko', unavailable: 'Mimo provoz' },
  dockColumns: { door: 'Rampa', status: 'Stav', zone: 'Zóna', appointment: 'Slot', trailer: 'Vozidlo' },
  windows: {
    cutoff: 'Okno uzávěrky',
    staleTask: 'Limit stáří úkolu',
    snapshot: 'Čas snímku',
    notAvailable: 'Není k dispozici',
  },
  drilldownGroups: {
    tasks: 'Úkoly',
    orders: 'Objednávky',
    waves: 'Vlny',
    shipments: 'Zásilky',
    exceptions: 'Výjimky',
  },
  drilldownColumns: { group: 'Oblast', state: 'Stav', count: 'Počet' },
  metrics: {
    openTasks: 'Otevřené úkoly',
    staleTasks: 'Zastaralé úkoly',
    cutoffRisk: 'Objednávky před cutoffem',
    openExceptions: 'Otevřené výjimky',
    criticalExceptions: 'Kritické výjimky',
    carrierExceptions: 'Výjimky dopravců',
    activeWaves: 'Aktivní vlny',
    slotting: 'Doporučení lokací',
  },
  riskActions: {
    CRITICAL_EXCEPTIONS_OPEN: 'Otevřete seznam výjimek a přiřaďte kritické případy vedoucímu směny.',
    CUTOFF_RISK_ORDERS: 'Zkontrolujte expedici a upřednostněte objednávky blížící se uzávěrce dopravce.',
    CARRIER_TRACKING_EXCEPTIONS: 'Prověřte zásilky s výjimkou dopravce a rozhodněte o opakování nebo ručním řešení.',
    STALE_TASK_BACKLOG: 'Rozdělte staré úkoly týmu nebo odblokujte úkoly, které čekají na zásah.',
    SLOTTING_RECOMMENDATIONS_OPEN: 'Projděte doporučení lokací, pokud směna potřebuje zkrátit trasu vychystání.',
    UNRELEASED_WAVES: 'Uvolněte připravené vlny nebo potvrďte, že mají zůstat naplánované.',
    default: 'Otevřete související provozní obrazovku a ověřte další postup.',
  },
  riskColumns: { severity: 'Priorita', area: 'Oblast', message: 'Popis', metric: 'Počet' },
};

const english = {
  banner: 'Operations API',
  eyebrow: 'deadlines · exceptions · shift performance',
  title: 'Operations',
  generatedAt: 'Updated',
  refresh: 'Refresh',
  loading: 'Loading operational signals.',
  shiftTitle: 'Shift control board',
  shiftEyebrow: 'live signals',
  alertsTitle: 'Operational alerts',
  alertsEyebrow: 'what to handle first',
  slaTitle: 'SLA monitor',
  slaEyebrow: 'cutoff and delays',
  dockTitle: 'Docks and vehicles',
  dockEyebrow: 'dock board',
  windowsTitle: 'Watch windows',
  windowsEyebrow: 'calculation settings',
  flowTitle: 'Tasks by type',
  flowEyebrow: 'current work',
  outboundTitle: 'Orders by status',
  outboundEyebrow: 'shipping',
  risksTitle: 'Risks to handle',
  risksEyebrow: 'priority',
  drilldownTitle: 'Operations drilldown',
  drilldownEyebrow: 'status groups',
  emptyFlow: 'No items are available yet.',
  emptyAlertsTitle: 'No alerts',
  emptyAlertsText: 'Current data does not contain a risk that needs action.',
  dockEmptyTitle: 'No docks',
  dockEmptyText: 'The server has not sent dock doors or active vehicles yet.',
  emptyTitle: 'No live risk',
  emptyText: 'The server has not sent an exception or risk to handle yet.',
  drilldownEmptyTitle: 'No status to show',
  drilldownEmptyText: 'The server has not sent status breakdowns for tasks, orders, waves, or shipments yet.',
  units: { hours: 'h', minutes: 'min' },
  notSet: 'Not set',
  sla: { status: 'Status', dueSoon: 'Near cutoff', overdue: 'Overdue', staleTasks: 'Stale tasks' },
  dockMetrics: { appointments: 'Appointments', waiting: 'Waiting vehicles', dwellRisk: 'Dwell risk', unavailable: 'Unavailable' },
  dockColumns: { door: 'Dock', status: 'Status', zone: 'Zone', appointment: 'Slot', trailer: 'Vehicle' },
  windows: {
    cutoff: 'Cutoff window',
    staleTask: 'Stale task limit',
    snapshot: 'Snapshot time',
    notAvailable: 'Not available',
  },
  drilldownGroups: {
    tasks: 'Tasks',
    orders: 'Orders',
    waves: 'Waves',
    shipments: 'Shipments',
    exceptions: 'Exceptions',
  },
  drilldownColumns: { group: 'Area', state: 'Status', count: 'Count' },
  metrics: {
    openTasks: 'Open tasks',
    staleTasks: 'Stale tasks',
    cutoffRisk: 'Cutoff risk orders',
    openExceptions: 'Open exceptions',
    criticalExceptions: 'Critical exceptions',
    carrierExceptions: 'Carrier exceptions',
    activeWaves: 'Active waves',
    slotting: 'Slotting recommendations',
  },
  riskActions: {
    CRITICAL_EXCEPTIONS_OPEN: 'Open the exception list and assign critical cases to the shift lead.',
    CUTOFF_RISK_ORDERS: 'Check shipping and prioritize orders approaching the carrier cutoff.',
    CARRIER_TRACKING_EXCEPTIONS: 'Review shipments with carrier exceptions and decide on retry or manual handling.',
    STALE_TASK_BACKLOG: 'Reassign old tasks to the team or unblock work that is waiting for intervention.',
    SLOTTING_RECOMMENDATIONS_OPEN: 'Review location recommendations if the shift needs a shorter pick path.',
    UNRELEASED_WAVES: 'Release ready waves or confirm that they should remain planned.',
    default: 'Open the related operations screen and confirm the next step.',
  },
  riskColumns: { severity: 'Priority', area: 'Area', message: 'Message', metric: 'Count' },
};

const ukrainian = {
  banner: 'API керування операціями',
  eyebrow: 'терміни · винятки · продуктивність зміни',
  title: 'Операції',
  generatedAt: 'Оновлено',
  refresh: 'Оновити',
  loading: 'Завантажуються операційні сигнали.',
  shiftTitle: 'Панель керування зміною',
  shiftEyebrow: 'живі сигнали',
  alertsTitle: 'Операційні сповіщення',
  alertsEyebrow: 'що опрацювати першим',
  slaTitle: 'SLA монітор',
  slaEyebrow: 'дедлайни та затримки',
  dockTitle: 'Рампи та авто',
  dockEyebrow: 'dock board',
  windowsTitle: 'Контрольні вікна',
  windowsEyebrow: 'налаштування розрахунку',
  flowTitle: 'Завдання за типом',
  flowEyebrow: 'поточна робота',
  outboundTitle: 'Замовлення за станом',
  outboundEyebrow: 'відвантаження',
  risksTitle: 'Ризики до вирішення',
  risksEyebrow: 'пріоритет',
  drilldownTitle: 'Деталізація операцій',
  drilldownEyebrow: 'групи станів',
  emptyFlow: 'Поки немає доступних позицій.',
  emptyAlertsTitle: 'Без сповіщень',
  emptyAlertsText: 'Поточні дані не містять ризику, що потребує дії.',
  dockEmptyTitle: 'Немає рамп',
  dockEmptyText: 'Сервер ще не надіслав рампи або активні авто.',
  emptyTitle: 'Немає живого ризику',
  emptyText: 'Сервер поки не надіслав виняток або ризик для вирішення.',
  drilldownEmptyTitle: 'Немає станів для показу',
  drilldownEmptyText: 'Сервер ще не надіслав розподіл станів для завдань, замовлень, хвиль або відправлень.',
  units: { hours: 'год', minutes: 'хв' },
  notSet: 'Не налаштовано',
  sla: { status: 'Стан', dueSoon: 'Біля дедлайну', overdue: 'Прострочено', staleTasks: 'Старі завдання' },
  dockMetrics: { appointments: 'Слоти', waiting: 'Авто чекають', dwellRisk: 'Dwell ризик', unavailable: 'Недоступні' },
  dockColumns: { door: 'Рампа', status: 'Стан', zone: 'Зона', appointment: 'Слот', trailer: 'Авто' },
  windows: {
    cutoff: 'Вікно дедлайну',
    staleTask: 'Ліміт віку завдання',
    snapshot: 'Час знімка',
    notAvailable: 'Недоступно',
  },
  drilldownGroups: {
    tasks: 'Завдання',
    orders: 'Замовлення',
    waves: 'Хвилі',
    shipments: 'Відправлення',
    exceptions: 'Винятки',
  },
  drilldownColumns: { group: 'Область', state: 'Стан', count: 'Кількість' },
  metrics: {
    openTasks: 'Відкриті завдання',
    staleTasks: 'Прострочені завдання',
    cutoffRisk: 'Замовлення перед дедлайном',
    openExceptions: 'Відкриті винятки',
    criticalExceptions: 'Критичні винятки',
    carrierExceptions: 'Винятки перевізників',
    activeWaves: 'Активні хвилі',
    slotting: 'Рекомендації локацій',
  },
  riskActions: {
    CRITICAL_EXCEPTIONS_OPEN: 'Відкрийте список винятків і призначте критичні випадки керівнику зміни.',
    CUTOFF_RISK_ORDERS: 'Перевірте відвантаження та надайте пріоритет замовленням біля дедлайну перевізника.',
    CARRIER_TRACKING_EXCEPTIONS: 'Перегляньте відправлення з винятками перевізника та вирішіть щодо повтору або ручної обробки.',
    STALE_TASK_BACKLOG: 'Перерозподіліть старі завдання команді або розблокуйте роботу, що чекає втручання.',
    SLOTTING_RECOMMENDATIONS_OPEN: 'Перегляньте рекомендації локацій, якщо зміні потрібен коротший маршрут відбору.',
    UNRELEASED_WAVES: 'Випустіть готові хвилі або підтвердьте, що вони мають залишитися запланованими.',
    default: 'Відкрийте пов’язаний операційний екран і підтвердьте наступний крок.',
  },
  riskColumns: { severity: 'Пріоритет', area: 'Область', message: 'Опис', metric: 'Кількість' },
};

const czechStates: Record<string, string> = { OK: 'V pořádku', WARNING: 'Pozor', CRITICAL: 'Kritické', ERROR: 'Chyba', UNKNOWN: 'Neznámé' };
const englishStates: Record<string, string> = { OK: 'OK', WARNING: 'Warning', CRITICAL: 'Critical', ERROR: 'Error', UNKNOWN: 'Unknown' };
const ukrainianStates: Record<string, string> = { OK: 'В порядку', WARNING: 'Увага', CRITICAL: 'Критично', ERROR: 'Помилка', UNKNOWN: 'Н/д' };

const czechSeverity: Record<string, string> = { LOW: 'Nízká', MEDIUM: 'Střední', HIGH: 'Vysoká', CRITICAL: 'Kritická' };
const englishSeverity: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
const ukrainianSeverity: Record<string, string> = { LOW: 'Низький', MEDIUM: 'Середній', HIGH: 'Високий', CRITICAL: 'Критичний' };

const czechRiskCodes: Record<string, string> = {
  CRITICAL_EXCEPTIONS_OPEN: 'Kritické výjimky',
  CUTOFF_RISK_ORDERS: 'Objednávky před cutoffem',
  CARRIER_TRACKING_EXCEPTIONS: 'Výjimky dopravců',
  STALE_TASK_BACKLOG: 'Zastaralé úkoly',
  SLOTTING_RECOMMENDATIONS_OPEN: 'Doporučení lokací',
  UNRELEASED_WAVES: 'Neuvolněné vlny',
  UNKNOWN: 'Jiné riziko',
};
const englishRiskCodes: Record<string, string> = {
  CRITICAL_EXCEPTIONS_OPEN: 'Critical exceptions',
  CUTOFF_RISK_ORDERS: 'Cutoff risk orders',
  CARRIER_TRACKING_EXCEPTIONS: 'Carrier exceptions',
  STALE_TASK_BACKLOG: 'Stale task backlog',
  SLOTTING_RECOMMENDATIONS_OPEN: 'Slotting recommendations',
  UNRELEASED_WAVES: 'Unreleased waves',
  UNKNOWN: 'Other risk',
};
const ukrainianRiskCodes: Record<string, string> = {
  CRITICAL_EXCEPTIONS_OPEN: 'Критичні винятки',
  CUTOFF_RISK_ORDERS: 'Замовлення перед дедлайном',
  CARRIER_TRACKING_EXCEPTIONS: 'Винятки перевізників',
  STALE_TASK_BACKLOG: 'Прострочені завдання',
  SLOTTING_RECOMMENDATIONS_OPEN: 'Рекомендації локацій',
  UNRELEASED_WAVES: 'Невипущені хвилі',
  UNKNOWN: 'Інший ризик',
};

const czechTaskTypes: Record<string, string> = {
  RECEIVE: 'Příjem',
  PUTAWAY: 'Zaskladnění',
  PICK: 'Vychystání',
  PACK: 'Balení',
  MOVE: 'Přesun',
  REPLENISH: 'Doplnění',
  COUNT: 'Inventura',
  LOAD: 'Nakládka',
  UNKNOWN: 'Jiný typ',
};
const englishTaskTypes: Record<string, string> = {
  RECEIVE: 'Receiving',
  PUTAWAY: 'Putaway',
  PICK: 'Picking',
  PACK: 'Packing',
  MOVE: 'Move',
  REPLENISH: 'Replenishment',
  COUNT: 'Count',
  LOAD: 'Loading',
  UNKNOWN: 'Other type',
};
const ukrainianTaskTypes: Record<string, string> = {
  RECEIVE: 'Приймання',
  PUTAWAY: 'Розміщення',
  PICK: 'Відбір',
  PACK: 'Пакування',
  MOVE: 'Переміщення',
  REPLENISH: 'Поповнення',
  COUNT: 'Інвентаризація',
  LOAD: 'Завантаження',
  UNKNOWN: 'Інший тип',
};

const czechStatusKeys: Record<string, string> = {
  OPEN: 'Otevřeno',
  ACTIVE: 'Aktivní',
  INACTIVE: 'Neaktivní',
  MAINTENANCE: 'Servis',
  ASSIGNED: 'Přiděleno',
  IN_PROGRESS: 'Probíhá',
  BLOCKED: 'Blokováno',
  DONE: 'Hotovo',
  FAILED: 'Chyba',
  CANCELLED: 'Zrušeno',
  DRAFT: 'Rozpracováno',
  CREATED: 'Vytvořeno',
  ALLOCATED: 'Alokováno',
  PICKING: 'Vychystávání',
  PICKED: 'Vychystáno',
  PACKING: 'Balení',
  PACKED: 'Zabaleno',
  PLANNED: 'Naplánováno',
  RELEASED: 'Uvolněno',
  COMPLETED: 'Dokončeno',
  STAGED: 'Připraveno k expedici',
  LOADING: 'Nakládka',
  SHIPPED: 'Odesláno',
  EXCEPTION: 'Výjimka',
};
const englishStatusKeys: Record<string, string> = {
  OPEN: 'Open',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  MAINTENANCE: 'Maintenance',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
  CREATED: 'Created',
  ALLOCATED: 'Allocated',
  PICKING: 'Picking',
  PICKED: 'Picked',
  PACKING: 'Packing',
  PACKED: 'Packed',
  PLANNED: 'Planned',
  RELEASED: 'Released',
  COMPLETED: 'Completed',
  STAGED: 'Staged',
  LOADING: 'Loading',
  SHIPPED: 'Shipped',
  EXCEPTION: 'Exception',
};
const ukrainianStatusKeys: Record<string, string> = {
  OPEN: 'Відкрито',
  ACTIVE: 'Активний',
  INACTIVE: 'Неактивний',
  MAINTENANCE: 'Обслуговування',
  ASSIGNED: 'Призначено',
  IN_PROGRESS: 'В роботі',
  BLOCKED: 'Заблоковано',
  DONE: 'Готово',
  FAILED: 'Помилка',
  CANCELLED: 'Скасовано',
  DRAFT: 'Чернетка',
  CREATED: 'Створено',
  ALLOCATED: 'Розподілено',
  PICKING: 'Відбір',
  PICKED: 'Відібрано',
  PACKING: 'Пакування',
  PACKED: 'Запаковано',
  PLANNED: 'Заплановано',
  RELEASED: 'Випущено',
  COMPLETED: 'Завершено',
  STAGED: 'Підготовлено',
  LOADING: 'Завантаження',
  SHIPPED: 'Відправлено',
  EXCEPTION: 'Виняток',
};
