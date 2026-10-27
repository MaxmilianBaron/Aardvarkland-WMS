import { pickLanguage } from '../../core/i18n/i18n';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Column, DataTable } from '../../components/ui/DataTable';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatusPill } from '../../components/ui/StatusPill';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useWorkspace, type Language } from '../../core/workspace/workspace';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { allocateOutboundOrder, listOutboundOrders, releasePicking } from '../../core/api/wms';
import { mapOutboundOrders } from '../../core/api/view-models';
import type { Order } from '../../core/types/wms';

const emptyOrders: Order[] = [];

function priorityLabel(priority: Order['priority'], language: Language): string {
  if (language === 'fr' || language === 'de' || language === 'es') {
    return pickLanguage(language, {
      cs: priorityLabel(priority, 'cs'),
      en: priorityLabel(priority, 'en'),
      ua: priorityLabel(priority, 'ua'),
    });
  }
  if (language === 'en') return priority;
  if (language === 'ua') {
    if (priority === 'Rush') return 'Терміново';
    if (priority === 'High') return 'Високий';
    if (priority === 'Low') return 'Низький';
    return 'Норма';
  }
  if (priority === 'Rush') return 'Urgentní';
  if (priority === 'High') return 'Vysoká';
  if (priority === 'Low') return 'Nízká';
  return 'Normální';
}

export function OutboundPage() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const resource = useApiResource({ fallback: emptyOrders, productionFallback: emptyOrders, loader: () => listOutboundOrders<unknown[]>(warehouseId), map: mapOutboundOrders, dependencies: [warehouseId] });
  const mutation = useApiMutation();
  const sourceRows = resource.data;
  const [filter, setFilter] = useState('active');
  const [selectedId, setSelectedId] = useState(sourceRows[0]?.id ?? '');
  const selected = sourceRows.find((order) => order.id === selectedId) ?? sourceRows[0];
  const rows = useMemo(() => {
    if (filter === 'all') return sourceRows;
    if (filter === 'shipped') return sourceRows.filter((order) => order.status === 'Shipped');
    return sourceRows.filter((order) => order.status !== 'Shipped');
  }, [filter, sourceRows]);
  const columns: Column<Order>[] = [
    { key: 'select', label: '', render: (row) => <input type="radio" name="order" data-e2e-row="order" data-e2e-value={row.id} checked={selected?.id === row.id} onChange={() => setSelectedId(row.id)} /> },
    { key: 'id', label: text.columns.order, render: (row) => <strong>{row.id}</strong> },
    { key: 'channel', label: text.columns.channel, render: (row) => row.channel || '-' },
    { key: 'priority', label: text.columns.priority, render: (row) => <Badge tone={row.priority === 'Rush' ? 'critical' : row.priority === 'High' ? 'warning' : 'neutral'}>{priorityLabel(row.priority, language)}</Badge> },
    { key: 'status', label: text.columns.status, render: (row) => <StatusPill value={row.status} /> },
    { key: 'lines', label: text.columns.lines, align: 'right', render: (row) => row.lines },
    { key: 'wave', label: text.columns.wave, render: (row) => row.wave || '-' },
    { key: 'cutoff', label: text.columns.deadline, render: (row) => row.cutoff || '-' },
  ];
  const allocated = sourceRows.filter((order) => ['Allocated', 'Picking', 'Packed'].includes(order.status)).length;
  const progress = sourceRows.length ? Math.round((sourceRows.filter((order) => order.status === 'Shipped').length / sourceRows.length) * 100) : 0;
  const allocate = () => {
    if (!selected) return;
    void mutation.run(text.allocateAction, () => allocateOutboundOrder(warehouseId, selected.id, { allocationStrategy: 'FEFO', metadata: { source: 'storage-ui' } })).then((result) => { if (result) resource.refresh(); });
  };
  const release = () => {
    if (!selected) return;
    void mutation.run(text.releaseAction, () => releasePicking(warehouseId, selected.id, { metadata: { source: 'storage-ui' } })).then((result) => { if (result) resource.refresh(); });
  };

  return (
    <div className="page-grid">
      <div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div>
      <Card
        title={text.tableTitle}
        eyebrow={text.tableEyebrow}
        className="span-8"
        action={<SegmentedControl value={filter} onChange={setFilter} options={[{ value: 'active', label: text.filters.active }, { value: 'all', label: text.filters.all }, { value: 'shipped', label: text.filters.shipped }]} />}
      >
        <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.emptyTitle} emptyText={text.emptyText} />
      </Card>
      <Card title={text.allocationTitle} eyebrow={text.allocationEyebrow} className="span-4">
        <div className="metric-stack">
          <article><span>{text.selectedOrder}</span><strong>{selected?.id ?? '-'}</strong></article>
          <article><span>{text.allocated}</span><strong>{allocated}</strong></article>
          <article><span>{text.shippingProgress}</span><strong>{progress}%</strong><ProgressBar value={progress} /></article>
        </div>
        <div className="action-panel">
          <Button tone="primary" data-e2e-action="outbound-allocate-selected" disabled={!selected || mutation.status === 'running'} onClick={allocate}>{text.allocateButton}</Button>
          <Button tone="secondary" data-e2e-action="outbound-release-picking" disabled={!selected || mutation.status === 'running'} onClick={release}>{text.releaseButton}</Button>
          <Button tone="secondary" data-e2e-action="outbound-open-packing" onClick={() => { window.location.hash = '/packing'; }}>{text.openPacking}</Button>
          <ActionStatus mutation={mutation} />
        </div>
      </Card>
    </div>
  );
}

const czech = {
  banner: 'API expedice',
  tableTitle: 'Objednávky',
  tableEyebrow: 'živý výdej a expedice',
  allocationTitle: 'Alokace',
  allocationEyebrow: 'rezervace · balení · expedice',
  selectedOrder: 'Vybraná objednávka',
  allocated: 'Alokováno / pickuje se',
  shippingProgress: 'Průběh odeslání',
  allocateButton: 'Alokovat vybranou',
  allocateAction: 'Alokovat objednávku',
  releaseButton: 'Uvolnit picking',
  releaseAction: 'Uvolnit picking',
  openPacking: 'Otevřít balení',
  deadlineTitle: 'Fronta termínů',
  deadlineEyebrow: 'řazeno podle termínu',
  lineCount: 'řádků',
  waveLabel: 'vlna',
  timelineEmpty: 'Žádné expediční objednávky nejsou načtené.',
  emptyTitle: 'Žádné objednávky',
  emptyText: 'Server zatím nevrátil žádné objednávky.',
  filters: { active: 'Aktivní', all: 'Vše', shipped: 'Odeslané' },
  columns: { order: 'Objednávka', channel: 'Kanál', priority: 'Priorita', status: 'Stav', lines: 'Řádků', wave: 'Vlna', deadline: 'Termín' },
};

const english = {
  banner: 'Shipping API',
  tableTitle: 'Orders',
  tableEyebrow: 'live outbound and shipping',
  allocationTitle: 'Allocation',
  allocationEyebrow: 'reservation · packing · shipping',
  selectedOrder: 'Selected order',
  allocated: 'Allocated / picking',
  shippingProgress: 'Shipping progress',
  allocateButton: 'Allocate selected',
  allocateAction: 'Allocate order',
  releaseButton: 'Release picking',
  releaseAction: 'Release picking',
  openPacking: 'Open packing',
  deadlineTitle: 'Deadline queue',
  deadlineEyebrow: 'sorted by deadline',
  lineCount: 'lines',
  waveLabel: 'wave',
  timelineEmpty: 'No outbound orders are loaded.',
  emptyTitle: 'No orders',
  emptyText: 'The server has not returned any orders yet.',
  filters: { active: 'Active', all: 'All', shipped: 'Shipped' },
  columns: { order: 'Order', channel: 'Channel', priority: 'Priority', status: 'Status', lines: 'Lines', wave: 'Wave', deadline: 'Deadline' },
};

const ukrainian = {
  banner: 'API експедиції',
  tableTitle: 'Замовлення',
  tableEyebrow: 'жива видача та доставка',
  allocationTitle: 'Алокація',
  allocationEyebrow: 'резерв · пакування · доставка',
  selectedOrder: 'Вибране замовлення',
  allocated: 'Алоковано / відбір',
  shippingProgress: 'Прогрес відправки',
  allocateButton: 'Алокувати вибране',
  allocateAction: 'Алокувати замовлення',
  releaseButton: 'Відкрити відбір',
  releaseAction: 'Відкрити відбір',
  openPacking: 'Відкрити пакування',
  deadlineTitle: 'Черга термінів',
  deadlineEyebrow: 'сортування за терміном',
  lineCount: 'рядків',
  waveLabel: 'хвиля',
  timelineEmpty: 'Немає завантажених замовлень на відправку.',
  emptyTitle: 'Немає замовлень',
  emptyText: 'Сервер поки не повернув жодних замовлень.',
  filters: { active: 'Активні', all: 'Усі', shipped: 'Відправлені' },
  columns: { order: 'Замовлення', channel: 'Канал', priority: 'Пріоритет', status: 'Стан', lines: 'Рядків', wave: 'Хвиля', deadline: 'Термін' },
};
