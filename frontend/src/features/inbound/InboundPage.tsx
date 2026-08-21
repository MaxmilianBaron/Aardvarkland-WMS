import { pickLanguage } from '../../core/i18n/i18n';
import { FormEvent, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Column, DataTable } from '../../components/ui/DataTable';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatusPill } from '../../components/ui/StatusPill';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { useWorkspace } from '../../core/workspace/workspace';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { createWmsIdempotencyKey, listInboundShipments, receiveInboundShipment } from '../../core/api/wms';
import { mapInboundShipments } from '../../core/api/view-models';
import type { Shipment } from '../../core/types/wms';

const emptyShipments: Shipment[] = [];

export function InboundPage() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: inboundCzech, en: inboundEnglish, ua: inboundUkrainian });
  const resource = useApiResource({ fallback: emptyShipments, productionFallback: emptyShipments, loader: () => listInboundShipments<unknown[]>(warehouseId), map: mapInboundShipments, dependencies: [warehouseId] });
  const mutation = useApiMutation();
  const sourceRows = resource.data;
  const [filter, setFilter] = useState('active');
  const [selectedId, setSelectedId] = useState(sourceRows[0]?.id ?? '');
  const [lineReference, setLineReference] = useState('1');
  const [quantity, setQuantity] = useState('1');
  const selected = sourceRows.find((row) => row.id === selectedId) ?? sourceRows[0];
  const rows = useMemo(() => filter === 'all' ? sourceRows : sourceRows.filter((shipment) => shipment.status !== 'Dokončeno'), [filter, sourceRows]);
  const columns: Column<Shipment>[] = [
    { key: 'select', label: '', render: (row) => <input type="radio" name="inbound" data-mcp-row="inbound" data-mcp-value={row.id} checked={selected?.id === row.id} onChange={() => setSelectedId(row.id)} /> },
    { key: 'id', label: 'ASN', render: (row) => <strong>{row.id}</strong> },
    { key: 'supplier', label: text.supplier, render: (row) => row.supplier },
    { key: 'dock', label: text.dock, render: (row) => <Badge>{row.dock}</Badge> },
    { key: 'eta', label: 'ETA', render: (row) => row.eta },
    { key: 'lines', label: text.lines, align: 'right', render: (row) => row.lines },
    { key: 'progress', label: text.progress, render: (row) => <ProgressBar value={row.progress} /> },
    { key: 'status', label: text.status, render: (row) => <StatusPill value={row.status} /> },
  ];
  const active = sourceRows.filter((item) => item.status !== 'Dokončeno').length;
  const avgProgress = sourceRows.length ? Math.round(sourceRows.reduce((sum, item) => sum + item.progress, 0) / sourceRows.length) : 0;
  const receive = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void mutation.run(text.receiveLine, () => receiveInboundShipment(warehouseId, selected.id, {
      lineReference,
      quantity: Math.max(0, Number.parseInt(quantity, 10) || 0),
      qualityStatus: 'PASSED',
      locationReference: selected.dock,
      idempotencyKey: createWmsIdempotencyKey(`storage-inbound-${selected.id}`),
      metadata: { source: 'storage-ui' },
    })).then((result) => { if (result) resource.refresh(); });
  };
  return <div className="page-grid"><div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div><Card title={text.title} className="span-8" action={<div className="segmented"><button className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')}>{text.active}</button><button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>{text.all}</button></div>}><DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.emptyTitle} emptyText={text.emptyText} /></Card><Card title={text.controlTitle} className="span-4"><div className="metric-stack"><article><span>{text.activeInbound}</span><strong>{active}</strong></article><article><span>{text.avgProgress}</span><strong>{avgProgress}%</strong><ProgressBar value={avgProgress} /></article></div><form className="action-panel" onSubmit={receive}><label>{text.selectedAsn}<input data-testid="inbound-selected-asn" value={selected?.id ?? '—'} readOnly /></label><label>{text.line}<input data-testid="inbound-line-reference" value={lineReference} onChange={(event) => setLineReference(event.target.value)} /></label><label>{text.quantity}<input data-testid="inbound-quantity" type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><Button tone="primary" type="submit" data-mcp-action="inbound-receive" disabled={!selected || mutation.status === 'running'}>{text.receiveLine}</Button><ActionStatus mutation={mutation} /></form></Card></div>;
}

const inboundCzech = {
  banner: 'API příjmu',
  title: 'Příjem',
  tableEyebrow: 'živý příjem',
  supplier: 'Dodavatel',
  dock: 'Rampa',
  lines: 'Řádků',
  progress: 'Průběh',
  status: 'Stav',
  emptyTitle: 'Žádné příjmy',
  emptyText: 'Server zatím nevrátil žádné příjmy zboží.',
  active: 'Aktivní',
  all: 'Vše',
  controlTitle: 'Přijmout řádek',
  controlEyebrow: 'živý příjem ASN',
  activeInbound: 'Aktivní příjmy',
  avgProgress: 'Průměrný průběh',
  selectedAsn: 'Vybrané ASN',
  line: 'Řádek',
  quantity: 'Množství',
  receiveLine: 'Přijmout řádek',
  checksTitle: 'Kontroly příjmu',
  checksEyebrow: 'živá mutace',
  checks: [
    ['Kontrola kvality', 'Příjem posílá stav kvality PASSED.'],
    ['Idempotence', 'Každý příjem má unikátní klíč pro bezpečné opakování.'],
    ['Rampa příjmu', 'Lokace příjmu se bere z vybrané rampy.'],
    ['Obnovení dat', 'Po úspěšné mutaci se tabulka znovu načte z API.'],
  ],
};

const inboundEnglish = {
  banner: 'Receiving API',
  title: 'Receiving',
  tableEyebrow: 'live receiving',
  supplier: 'Supplier',
  dock: 'Dock',
  lines: 'Lines',
  progress: 'Progress',
  status: 'Status',
  emptyTitle: 'No receiving',
  emptyText: 'The server has not returned any receiving shipments yet.',
  active: 'Active',
  all: 'All',
  controlTitle: 'Receive line',
  controlEyebrow: 'live ASN receiving',
  activeInbound: 'Active receiving',
  avgProgress: 'Average progress',
  selectedAsn: 'Selected ASN',
  line: 'Line',
  quantity: 'Quantity',
  receiveLine: 'Receive line',
  checksTitle: 'Receiving checks',
  checksEyebrow: 'live mutation',
  checks: [
    ['Quality check', 'Receiving sends the PASSED quality state.'],
    ['Idempotency', 'Each receipt has a unique key for safe retry.'],
    ['Receiving dock', 'The receiving location is taken from the selected dock.'],
    ['Data refresh', 'After a successful mutation, the table reloads from the API.'],
  ],
};

const inboundUkrainian = {
  banner: 'API приймання',
  title: 'Приймання',
  tableEyebrow: 'живе приймання',
  supplier: 'Постач.',
  dock: 'Рампа',
  lines: 'Рядків',
  progress: 'Прогрес',
  status: 'Стан',
  emptyTitle: 'Немає приймань',
  emptyText: 'Сервер поки не повернув жодного приймання товару.',
  active: 'Активні',
  all: 'Усі',
  controlTitle: 'Прийняти рядок',
  controlEyebrow: 'живе приймання ASN',
  activeInbound: 'Активні приймання',
  avgProgress: 'Середній прогрес',
  selectedAsn: 'Вибране ASN',
  line: 'Рядок',
  quantity: 'Кількість',
  receiveLine: 'Прийняти рядок',
  checksTitle: 'Контроль приймання',
  checksEyebrow: 'жива зміна',
  checks: [
    ['Контроль якості', 'Приймання надсилає стан якості PASSED.'],
    ['Ідемпотентність', 'Кожне приймання має унікальний ключ для безпечного повтору.'],
    ['Рампа приймання', 'Локація приймання береться з вибраної рампи.'],
    ['Оновлення даних', 'Після успішної зміни таблиця знову завантажується з API.'],
  ],
};
