import { pickLanguage } from '../../core/i18n/i18n';
import { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Column, DataTable } from '../../components/ui/DataTable';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { FlowStepper } from '../../components/ui/FlowStepper';
import { PermissionGate } from '../../components/ui/PermissionGate';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatusPill } from '../../components/ui/StatusPill';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { listPickWaves, releasePickWave } from '../../core/api/wms';
import { mapPickWaves } from '../../core/api/view-models';
import type { WavePlan } from '../../core/types/wms';
import { useWorkspace } from '../../core/workspace/workspace';

const emptyWavePlans: WavePlan[] = [];

export function WavesPage() {
  const { warehouseId, roleProfile, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const resource = useApiResource({
    fallback: emptyWavePlans,
    productionFallback: emptyWavePlans,
    loader: () => listPickWaves<unknown[]>(warehouseId),
    map: mapPickWaves,
    dependencies: [warehouseId],
  });
  const mutation = useApiMutation();
  const sourceRows = resource.data;
  const [selectedId, setSelectedId] = useState(sourceRows[0]?.id ?? '');
  const [released, setReleased] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selected = sourceRows.find((wave) => wave.id === selectedId) ?? sourceRows[0];
  const availablePickers = 0;

  const columns: Column<WavePlan>[] = [
    { key: 'select', label: '', render: (row) => <input type="radio" name="wave" data-e2e-row="wave" data-e2e-value={row.id} checked={selected?.id === row.id} onChange={() => setSelectedId(row.id)} /> },
    { key: 'id', label: text.columns.wave, render: (row) => <button className="link-button" type="button" onClick={() => { setSelectedId(row.id); setDrawerOpen(true); }}><strong>{row.id}</strong></button> },
    { key: 'status', label: text.columns.status, render: (row) => <StatusPill value={released.includes(row.id) ? 'Running' : row.status} /> },
    { key: 'cutoff', label: text.columns.deadline, render: (row) => row.cutoff },
    { key: 'orders', label: text.columns.orders, align: 'right', render: (row) => row.orders },
    { key: 'lines', label: text.columns.lines, align: 'right', render: (row) => row.lines },
    { key: 'progress', label: text.columns.progress, render: (row) => <ProgressBar value={released.includes(row.id) && row.progress === 0 ? 8 : row.progress} /> },
  ];

  const releaseSelected = () => {
    if (!selected) return;
    void mutation.run(text.actions.release, () => releasePickWave(warehouseId, selected.id, {
      createMissingPickTasks: true,
      metadata: { source: 'storage-ui', role: roleProfile.id },
    })).then((result) => {
      if (result) {
        setReleased((items) => [...new Set([...items, selected.id])]);
        resource.refresh();
      }
    });
  };

  const steps = [
    { id: 'review', label: text.steps.review, detail: selected ? `${selected.orders} ${text.ordersUnit}` : text.selectWave, state: selected ? 'done' : 'active' },
    { id: 'capacity', label: text.steps.capacity, detail: `${availablePickers} ${text.peopleUnit}`, state: availablePickers > 0 ? 'done' : 'blocked' },
    { id: 'release', label: text.steps.release, detail: text.steps.releaseDetail, state: selected && !released.includes(selected.id) ? 'active' : 'done' },
    { id: 'monitor', label: text.steps.monitor, detail: text.steps.monitorDetail, state: 'next' },
  ] as const;

  return (
    <>
      <div className="page-grid wave-cockpit">
        <div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div>

        <Card title={text.flowTitle} className="span-12">
          <FlowStepper steps={steps} />
        </Card>

        <Card
          title={text.tableTitle}
          className="span-8"
          action={(
            <PermissionGate permission="wave.manage" fallback={<Badge tone="warning">{text.readOnly}</Badge>}>
              <Button tone="primary" data-e2e-action="wave-release-selected" disabled={!selected || mutation.status === 'running'} onClick={releaseSelected}>{text.releaseSelected}</Button>
            </PermissionGate>
          )}
        >
          <DataTable rows={sourceRows} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.emptyTitle} emptyText={text.emptyText} />
        </Card>

        <Card title={selected ? `${text.plan} ${selected.id}` : text.plan} className="span-4">
          {selected && (
            <div className="wave-detail">
              <StatusPill value={released.includes(selected.id) ? 'Running' : selected.status} />
              <h2>{selected.orders} {text.ordersUnit}</h2>
              <div className="simulation-grid">
                <article><span>{text.pickZones}</span><strong>{selected.pickZones.join(' / ') || '-'}</strong></article>
                <article><span>{text.lines}</span><strong>{selected.lines}</strong></article>
                <article><span>{text.capacity}</span><strong>{availablePickers} {text.peopleUnit}</strong></article>
              </div>
              <ActionStatus mutation={mutation} />
              <PermissionGate permission="wave.manage">
                <Button tone="primary" data-e2e-action="wave-release-and-create" disabled={mutation.status === 'running'} onClick={releaseSelected}>{text.releaseAndCreate}</Button>
              </PermissionGate>
            </div>
          )}
        </Card>
      </div>

      <DetailDrawer open={drawerOpen && Boolean(selected)} onClose={() => setDrawerOpen(false)} title={selected?.id ?? text.wave} eyebrow={text.detail}>
        {selected && (
          <div className="drawer-stack">
            <StatusPill value={released.includes(selected.id) ? 'Running' : selected.status} />
            <div className="detail-grid">
              <article><span>{text.orders}</span><strong>{selected.orders}</strong></article>
              <article><span>{text.lines}</span><strong>{selected.lines}</strong></article>
              <article><span>{text.deadline}</span><strong>{selected.cutoff}</strong></article>
              <article><span>{text.zones}</span><strong>{selected.pickZones.join(', ') || '-'}</strong></article>
            </div>
            <ProgressBar value={selected.progress} />
          </div>
        )}
      </DetailDrawer>
    </>
  );
}

type WaveCopy = {
  banner: string;
  flowTitle: string;
  tableTitle: string;
  readOnly: string;
  releaseSelected: string;
  releaseAndCreate: string;
  emptyTitle: string;
  emptyText: string;
  plan: string;
  wave: string;
  detail: string;
  orders: string;
  ordersUnit: string;
  lines: string;
  pickZones: string;
  capacity: string;
  peopleUnit: string;
  deadline: string;
  zones: string;
  selectWave: string;
  columns: Record<'wave' | 'status' | 'deadline' | 'orders' | 'lines' | 'progress', string>;
  actions: { release: string };
  steps: Record<'review' | 'capacity' | 'release' | 'releaseDetail' | 'monitor' | 'monitorDetail', string>;
};

const czech: WaveCopy = {
  banner: 'API vln',
  flowTitle: 'Uvolnění vlny',
  tableTitle: 'Vlny',
  readOnly: 'Pouze čtení',
  releaseSelected: 'Uvolnit vybranou',
  releaseAndCreate: 'Uvolnit a vytvořit úkoly',
  emptyTitle: 'Žádné vlny',
  emptyText: 'Server zatím nevrátil žádné pickovací vlny.',
  plan: 'Plán',
  wave: 'Vlna',
  detail: 'Detail vlny',
  orders: 'Objednávky',
  ordersUnit: 'objednávek',
  lines: 'Řádky',
  pickZones: 'Zóny',
  capacity: 'Kapacita',
  peopleUnit: 'lidí',
  deadline: 'Termín',
  zones: 'Zóny',
  selectWave: 'Vyberte vlnu',
  columns: { wave: 'Vlna', status: 'Stav', deadline: 'Termín', orders: 'Obj.', lines: 'Řádků', progress: 'Průběh' },
  actions: { release: 'Uvolnit pickovací vlnu' },
  steps: {
    review: 'Kontrola',
    capacity: 'Kapacita',
    release: 'Uvolnění',
    releaseDetail: 'Vytvořit chybějící úkoly',
    monitor: 'RF',
    monitorDetail: 'Fronta úkolů',
  },
};

const english: WaveCopy = {
  banner: 'Waves API',
  flowTitle: 'Wave release',
  tableTitle: 'Waves',
  readOnly: 'Read only',
  releaseSelected: 'Release selected',
  releaseAndCreate: 'Release and create tasks',
  emptyTitle: 'No waves',
  emptyText: 'The server has not returned any pick waves yet.',
  plan: 'Plan',
  wave: 'Wave',
  detail: 'Wave detail',
  orders: 'Orders',
  ordersUnit: 'orders',
  lines: 'Lines',
  pickZones: 'Zones',
  capacity: 'Capacity',
  peopleUnit: 'people',
  deadline: 'Deadline',
  zones: 'Zones',
  selectWave: 'Select a wave',
  columns: { wave: 'Wave', status: 'Status', deadline: 'Deadline', orders: 'Ord.', lines: 'Lines', progress: 'Progress' },
  actions: { release: 'Release pick wave' },
  steps: {
    review: 'Review',
    capacity: 'Capacity',
    release: 'Release',
    releaseDetail: 'Create missing tasks',
    monitor: 'RF',
    monitorDetail: 'Task queue',
  },
};

const ukrainian: WaveCopy = {
  banner: 'API хвиль',
  flowTitle: 'Випуск хвилі',
  tableTitle: 'Хвилі',
  readOnly: 'Лише читання',
  releaseSelected: 'Випустити вибрану',
  releaseAndCreate: 'Випустити і створити завдання',
  emptyTitle: 'Немає хвиль',
  emptyText: 'Сервер поки не повернув жодних хвиль відбору.',
  plan: 'План',
  wave: 'Хвиля',
  detail: 'Деталь хвилі',
  orders: 'Замовлення',
  ordersUnit: 'замовлень',
  lines: 'Рядки',
  pickZones: 'Зони',
  capacity: 'Місткість',
  peopleUnit: 'людей',
  deadline: 'Термін',
  zones: 'Зони',
  selectWave: 'Виберіть хвилю',
  columns: { wave: 'Хвиля', status: 'Стан', deadline: 'Термін', orders: 'Зам.', lines: 'Рядків', progress: 'Прогрес' },
  actions: { release: 'Випустити хвилю відбору' },
  steps: {
    review: 'Перевірка',
    capacity: 'Місткість',
    release: 'Випуск',
    releaseDetail: 'Створити відсутні завдання',
    monitor: 'RF',
    monitorDetail: 'Черга завдань',
  },
};
