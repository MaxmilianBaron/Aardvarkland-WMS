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
import { claimNextWarehouseTask, confirmPickTask, confirmWarehouseTask, listTasks, startWarehouseTask } from '../../core/api/wms';
import { mapWarehouseTasks } from '../../core/api/view-models';
import type { WarehouseTask } from '../../core/types/wms';

const emptyTasks: WarehouseTask[] = [];

function apiTaskType(type: WarehouseTask['type']) {
  const map: Record<WarehouseTask['type'], string> = { Pick: 'PICK', Putaway: 'PUTAWAY', Move: 'MOVE', Replenishment: 'REPLENISH', 'Cycle count': 'COUNT' };
  return map[type];
}

function taskIdFromResult(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const row = result as Record<string, unknown>;
  for (const key of ['externalReference', 'taskReference', 'id']) {
    const id = row[key];
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

function taskTypeLabel(type: WarehouseTask['type'], language: Language) {
  const czech: Record<WarehouseTask['type'], string> = { Pick: 'Vychystání', Putaway: 'Zaskladnění', Move: 'Přesun', Replenishment: 'Doplnění', 'Cycle count': 'Inventura' };
  const english: Record<WarehouseTask['type'], string> = { Pick: 'Pick', Putaway: 'Putaway', Move: 'Move', Replenishment: 'Replenishment', 'Cycle count': 'Cycle count' };
  const ukrainian: Record<WarehouseTask['type'], string> = { Pick: 'Відбір', Putaway: 'Розміщення', Move: 'Переміщення', Replenishment: 'Поповнення', 'Cycle count': 'Інвентаризація' };
  return (pickLanguage(language, { cs: czech, en: english, ua: ukrainian }))[type];
}

export function TasksPage() {
  const { warehouseId, language, currentUser } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const resource = useApiResource({ fallback: emptyTasks, productionFallback: emptyTasks, loader: () => listTasks<unknown[]>(warehouseId), map: mapWarehouseTasks, dependencies: [warehouseId] });
  const mutation = useApiMutation();
  const sourceRows = resource.data;
  const [filter, setFilter] = useState('open');
  const [selectedId, setSelectedId] = useState(sourceRows[0]?.id ?? '');
  const selected = sourceRows.find((task) => task.id === selectedId) ?? sourceRows[0];
  const actorReference = currentUser?.email ?? currentUser?.displayName ?? 'operator';

  const rows = useMemo(() => {
    if (filter === 'all') return sourceRows;
    if (filter === 'done') return sourceRows.filter((task) => task.status === 'Done');
    return sourceRows.filter((task) => task.status !== 'Done');
  }, [filter, sourceRows]);

  const columns: Column<WarehouseTask>[] = [
    { key: 'select', label: '', render: (row) => <input type="radio" name="task" data-e2e-row="task" data-e2e-value={row.id} checked={selected?.id === row.id} onChange={() => setSelectedId(row.id)} /> },
    { key: 'id', label: text.columns.task, render: (row) => <strong>{row.id}</strong> },
    { key: 'type', label: text.columns.type, render: (row) => <Badge>{taskTypeLabel(row.type, language)}</Badge> },
    { key: 'assignee', label: text.columns.worker, render: (row) => row.assignee || '-' },
    { key: 'route', label: text.columns.route, render: (row) => `${row.from} → ${row.to}` },
    { key: 'priority', label: text.columns.priority, align: 'right', render: (row) => row.priority },
    { key: 'status', label: text.columns.status, render: (row) => <StatusPill value={row.status} /> },
  ];
  const open = sourceRows.filter((task) => task.status !== 'Done').length;
  const exceptions = sourceRows.filter((task) => task.status === 'Exception').length;
  const highestPriority = sourceRows[0]?.priority ?? 0;
  const refreshOnSuccess = (result: unknown) => {
    const nextId = taskIdFromResult(result);
    if (nextId) setSelectedId(nextId);
    if (result) resource.refresh();
  };
  const claimNext = () => void mutation.run(text.actions.claim, () => claimNextWarehouseTask(warehouseId, { type: selected ? apiTaskType(selected.type) : 'PICK', assignedUserReference: actorReference, metadata: { source: 'storage-ui' } })).then(refreshOnSuccess);
  const startSelected = () => selected && void mutation.run(text.actions.start, () => startWarehouseTask(warehouseId, selected.id, { assignedUserReference: actorReference, metadata: { source: 'storage-ui' } })).then(refreshOnSuccess);
  const confirmSelected = () => selected && void mutation.run(text.actions.confirm, () => {
    const body = { quantity: Math.max(1, selected.quantity), metadata: { source: 'storage-ui' } };
    if (selected.type === 'Pick') return confirmPickTask(warehouseId, selected.id, body);
    return confirmWarehouseTask(warehouseId, selected.id, { ...body, fromLocationReference: selected.from, toLocationReference: selected.to });
  }).then(refreshOnSuccess);

  return (
    <div className="page-grid">
      <div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div>
      <Card
        title={text.tableTitle}
        eyebrow={text.tableEyebrow}
        className="span-8"
        action={<SegmentedControl value={filter} onChange={setFilter} options={[{ value: 'open', label: text.filters.open }, { value: 'all', label: text.filters.all }, { value: 'done', label: text.filters.done }]} />}
      >
        <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.emptyTitle} emptyText={text.emptyText} />
      </Card>
      <Card title={text.controlTitle} eyebrow={text.controlEyebrow} className="span-4">
        <div className="metric-stack">
          <article><span>{text.metrics.open}</span><strong>{open}</strong></article>
          <article><span>{text.metrics.exceptions}</span><strong>{exceptions}</strong></article>
          <article><span>{text.metrics.priority}</span><strong>{highestPriority}</strong><ProgressBar value={highestPriority} /></article>
        </div>
        <div className="action-panel">
          <Button tone="primary" data-e2e-action="task-claim-next" disabled={mutation.status === 'running'} onClick={claimNext}>{text.buttons.claim}</Button>
          <Button tone="secondary" data-e2e-action="task-start-selected" disabled={!selected || mutation.status === 'running'} onClick={startSelected}>{text.buttons.start}</Button>
          <Button tone="secondary" data-e2e-action="task-confirm-selected" disabled={!selected || mutation.status === 'running'} onClick={confirmSelected}>{text.buttons.confirm}</Button>
          <ActionStatus mutation={mutation} />
        </div>
      </Card>
    </div>
  );
}

const czech = {
  banner: 'API úkolů',
  tableTitle: 'Úkoly',
  tableEyebrow: 'živá fronta práce',
  controlTitle: 'Vybraný úkol',
  controlEyebrow: 'převzít · spustit · potvrdit',
  queueTitle: 'Fronta pro skener',
  queueEyebrow: 'úkoly pro pracovní tok',
  queueEmpty: 'Žádné úkoly neodpovídají filtru.',
  emptyTitle: 'Žádné úkoly',
  emptyText: 'Server zatím nevrátil žádné úkoly.',
  filters: { open: 'Otevřené', all: 'Vše', done: 'Hotové' },
  columns: { task: 'Úkol', type: 'Typ', worker: 'Pracovník', route: 'Trasa', priority: 'Priorita', status: 'Stav' },
  metrics: { open: 'Otevřené', exceptions: 'Výjimky', priority: 'Nejvyšší priorita' },
  buttons: { claim: 'Převzít další úkol', start: 'Spustit vybraný', confirm: 'Potvrdit hotovo' },
  actions: { claim: 'Převzít další úkol', start: 'Spustit úkol', confirm: 'Potvrdit úkol' },
};

const english = {
  banner: 'Tasks API',
  tableTitle: 'Tasks',
  tableEyebrow: 'live work queue',
  controlTitle: 'Selected task',
  controlEyebrow: 'claim · start · confirm',
  queueTitle: 'Scanner queue',
  queueEyebrow: 'workflow tasks',
  queueEmpty: 'No tasks match the current filter.',
  emptyTitle: 'No tasks',
  emptyText: 'The server has not returned any tasks yet.',
  filters: { open: 'Open', all: 'All', done: 'Done' },
  columns: { task: 'Task', type: 'Type', worker: 'Worker', route: 'Route', priority: 'Priority', status: 'Status' },
  metrics: { open: 'Open', exceptions: 'Exceptions', priority: 'Highest priority' },
  buttons: { claim: 'Claim next task', start: 'Start selected', confirm: 'Confirm done' },
  actions: { claim: 'Claim next task', start: 'Start task', confirm: 'Confirm task' },
};

const ukrainian = {
  banner: 'API завдань',
  tableTitle: 'Завдання',
  tableEyebrow: 'жива черга роботи',
  controlTitle: 'Вибране завдання',
  controlEyebrow: 'прийняти · почати · підтвердити',
  queueTitle: 'Черга для сканера',
  queueEyebrow: 'завдання для процесу',
  queueEmpty: 'Немає завдань для поточного фільтра.',
  emptyTitle: 'Немає завдань',
  emptyText: 'Сервер поки не повернув жодних завдань.',
  filters: { open: 'Відкриті', all: 'Усі', done: 'Готові' },
  columns: { task: 'Завдання', type: 'Тип', worker: 'Працівник', route: 'Маршрут', priority: 'Пріоритет', status: 'Стан' },
  metrics: { open: 'Відкриті', exceptions: 'Винятки', priority: 'Найвищий пріоритет' },
  buttons: { claim: 'Прийняти наступне', start: 'Почати вибране', confirm: 'Підтвердити готово' },
  actions: { claim: 'Прийняти наступне завдання', start: 'Почати завдання', confirm: 'Підтвердити завдання' },
};
