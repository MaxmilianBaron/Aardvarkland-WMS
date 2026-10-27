import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { FormEvent, useMemo, useState } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { PermissionGate } from '../../components/ui/PermissionGate';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import {
  createPutawayTask,
  createWarehouseLocation,
  listWarehouseLocations,
  suggestPutaway,
  updateWarehouseLocation,
} from '../../core/api/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface LocationRow {
  id: string;
  code: string;
  name: string;
  type: string;
  zone: string | null;
  barcode: string | null;
  pickSequence: number;
  binStatus: string;
  capacityUnits: number | null;
  isActive: boolean;
}

interface PutawaySuggestion {
  suggestedLocation?: { code?: string; name?: string; zone?: string | null };
  reason?: string;
  strategy?: string;
  sourceQuant?: { id?: string; availableQuantity?: number };
}

const emptyLocations: LocationRow[] = [];
const locationTypes = ['RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'SHIPPING', 'BUFFER', 'QUARANTINE'];
const binStatuses = ['AVAILABLE', 'HOLD', 'RESERVED', 'BLOCKED', 'FULL', 'DAMAGED', 'MAINTENANCE', 'CLOSED'];

export function LocationsPage() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const mutation = useApiMutation();
  const resource = useApiResource<LocationRow[]>({
    fallback: emptyLocations,
    productionFallback: emptyLocations,
    loader: () => listWarehouseLocations<unknown[]>(warehouseId),
    map: mapLocations,
    dependencies: [warehouseId],
  });
  const [filter, setFilter] = useState({ query: '', type: '', status: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState({
    code: '',
    name: '',
    type: 'STORAGE',
    zone: '',
    barcode: '',
    aisle: '',
    bay: '',
    level: '',
    bin: '',
    pickSequence: '0',
    binStatus: 'AVAILABLE',
    capacityUnits: '',
  });
  const [putawayForm, setPutawayForm] = useState({ stockQuantReference: '', skuReference: '', fromLocationReference: '', quantity: '1' });
  const [suggestion, setSuggestion] = useState<PutawaySuggestion | null>(null);
  const rows = useMemo(() => {
    const query = filter.query.trim().toLowerCase();
    return resource.data.filter((location) => {
      const queryMatches = !query || `${location.code} ${location.name} ${location.zone ?? ''} ${location.barcode ?? ''}`.toLowerCase().includes(query);
      const typeMatches = !filter.type || location.type === filter.type;
      const statusMatches = !filter.status || location.binStatus === filter.status;
      return queryMatches && typeMatches && statusMatches;
    });
  }, [filter.query, filter.status, filter.type, resource.data]);
  const selected = resource.data.find((location) => location.id === selectedId) ?? rows[0];
  const columns: Column<LocationRow>[] = [
    { key: 'code', label: text.columns.code, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', label: text.columns.name, render: (row) => <span>{row.name}<small>{row.barcode ?? text.noBarcode}</small></span> },
    { key: 'type', label: text.columns.type, render: (row) => locationTypeLabel(row.type, language) },
    { key: 'zone', label: text.columns.zone, render: (row) => row.zone ?? text.notSet },
    { key: 'status', label: text.columns.status, render: (row) => <Badge tone={row.binStatus === 'AVAILABLE' ? 'good' : row.binStatus === 'BLOCKED' || row.binStatus === 'DAMAGED' ? 'warning' : 'neutral'}>{binStatusLabel(row.binStatus, language)}</Badge> },
    { key: 'capacity', label: text.columns.capacity, align: 'right', render: (row) => row.capacityUnits ?? text.notSet },
    { key: 'active', label: text.columns.active, render: (row) => row.isActive ? text.yes : text.no },
    { key: 'action', label: text.columns.action, align: 'right', render: (row) => <Button size="sm" type="button" onClick={() => setSelectedId(row.id)}>{text.select}</Button> },
  ];

  async function saveLocation(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run(text.actions.saveLocation, () => createWarehouseLocation(warehouseId, {
      code: locationForm.code,
      name: locationForm.name,
      type: locationForm.type,
      zone: locationForm.zone || undefined,
      barcode: locationForm.barcode || undefined,
      aisle: locationForm.aisle || undefined,
      bay: locationForm.bay || undefined,
      level: locationForm.level || undefined,
      bin: locationForm.bin || undefined,
      pickSequence: Number(locationForm.pickSequence) || 0,
      binStatus: locationForm.binStatus,
      capacityUnits: locationForm.capacityUnits ? Number(locationForm.capacityUnits) : undefined,
    }));
    if (result) {
      setLocationForm({ code: '', name: '', type: 'STORAGE', zone: '', barcode: '', aisle: '', bay: '', level: '', bin: '', pickSequence: '0', binStatus: 'AVAILABLE', capacityUnits: '' });
      resource.refresh();
    }
  }

  async function setSelectedStatus(status: string) {
    if (!selected) return;
    const result = await mutation.run(text.actions.updateLocation, () => updateWarehouseLocation(warehouseId, selected.id, { binStatus: status }));
    if (result) resource.refresh();
  }

  async function requestSuggestion(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run(text.actions.suggest, () => suggestPutaway<PutawaySuggestion>(warehouseId, {
      stockQuantReference: putawayForm.stockQuantReference || undefined,
      skuReference: putawayForm.skuReference || undefined,
      fromLocationReference: putawayForm.fromLocationReference || undefined,
      quantity: Number(putawayForm.quantity) || undefined,
    }));
    if (result) setSuggestion(result);
  }

  async function createTask() {
    if (!putawayForm.stockQuantReference.trim()) return;
    const result = await mutation.run(text.actions.createTask, () => createPutawayTask(warehouseId, {
      stockQuantReference: putawayForm.stockQuantReference,
      toLocationReference: suggestion?.suggestedLocation?.code,
      quantity: Number(putawayForm.quantity) || undefined,
      metadata: { source: 'locations-ui' },
    }));
    if (result) resource.refresh();
  }

  return (
    <div className="page-grid">
      <div className="span-12"><DataSourceBanner label={text.title} resource={resource} /></div>
      <section className="wms-page-intro span-12">
        <div><p className="eyebrow">{text.eyebrow}</p><h2>{text.title}</h2></div>
        <Button size="sm" type="button" onClick={resource.refresh}>{text.refresh}</Button>
      </section>

      <Card title={text.locations} className="span-8">
        <div className="filter-row">
          <label>{text.fields.search}<input value={filter.query} onChange={(event) => setFilter((value) => ({ ...value, query: event.target.value }))} /></label>
          <label>{text.fields.type}<select value={filter.type} onChange={(event) => setFilter((value) => ({ ...value, type: event.target.value }))}><option value="">{text.all}</option>{locationTypes.map((type) => <option key={type} value={type}>{locationTypeLabel(type, language)}</option>)}</select></label>
          <label>{text.fields.status}<select value={filter.status} onChange={(event) => setFilter((value) => ({ ...value, status: event.target.value }))}><option value="">{text.all}</option>{binStatuses.map((status) => <option key={status} value={status}>{binStatusLabel(status, language)}</option>)}</select></label>
        </div>
        <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.emptyTitle} emptyText={text.emptyText} />
      </Card>

      <Card title={text.selectedLocation} eyebrow={selected?.code ?? text.notSet} className="span-4">
        {selected ? (
          <div className="detail-list">
            <article><span>{text.columns.name}</span><strong>{selected.name}</strong></article>
            <article><span>{text.columns.zone}</span><strong>{selected.zone ?? text.notSet}</strong></article>
            <article><span>{text.columns.status}</span><strong>{binStatusLabel(selected.binStatus, language)}</strong></article>
            <PermissionGate permission="inventory.move">
              <div className="form-actions">
                {binStatuses.map((status) => <Button key={status} size="sm" type="button" onClick={() => setSelectedStatus(status)} disabled={mutation.status === 'running'}>{binStatusLabel(status, language)}</Button>)}
              </div>
            </PermissionGate>
          </div>
        ) : <p className="muted-copy">{text.emptySelection}</p>}
      </Card>

      <PermissionGate permission="inventory.move">
        <Card title={text.addLocation} className="span-6">
          <form className="stacked-form" onSubmit={saveLocation}>
            <label>{text.fields.code}<input value={locationForm.code} onChange={(event) => setLocationForm((form) => ({ ...form, code: event.target.value }))} required /></label>
            <label>{text.fields.name}<input value={locationForm.name} onChange={(event) => setLocationForm((form) => ({ ...form, name: event.target.value }))} required /></label>
            <label>{text.fields.type}<select value={locationForm.type} onChange={(event) => setLocationForm((form) => ({ ...form, type: event.target.value }))}>{locationTypes.map((type) => <option key={type} value={type}>{locationTypeLabel(type, language)}</option>)}</select></label>
            <label>{text.fields.zone}<input value={locationForm.zone} onChange={(event) => setLocationForm((form) => ({ ...form, zone: event.target.value }))} /></label>
            <label>{text.fields.barcode}<input value={locationForm.barcode} onChange={(event) => setLocationForm((form) => ({ ...form, barcode: event.target.value }))} /></label>
            <label>{text.fields.aisle}<input value={locationForm.aisle} onChange={(event) => setLocationForm((form) => ({ ...form, aisle: event.target.value }))} /></label>
            <label>{text.fields.bay}<input value={locationForm.bay} onChange={(event) => setLocationForm((form) => ({ ...form, bay: event.target.value }))} /></label>
            <label>{text.fields.level}<input value={locationForm.level} onChange={(event) => setLocationForm((form) => ({ ...form, level: event.target.value }))} /></label>
            <label>{text.fields.bin}<input value={locationForm.bin} onChange={(event) => setLocationForm((form) => ({ ...form, bin: event.target.value }))} /></label>
            <label>{text.fields.capacity}<input value={locationForm.capacityUnits} onChange={(event) => setLocationForm((form) => ({ ...form, capacityUnits: event.target.value }))} inputMode="numeric" /></label>
            <Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>
      </PermissionGate>

      <PermissionGate permission="inventory.move">
        <Card title={text.putaway} eyebrow={text.putawayEyebrow} className="span-6">
          <form className="stacked-form" onSubmit={requestSuggestion}>
            <label>{text.fields.stockQuant}<input value={putawayForm.stockQuantReference} onChange={(event) => setPutawayForm((form) => ({ ...form, stockQuantReference: event.target.value }))} /></label>
            <label>{text.fields.sku}<input value={putawayForm.skuReference} onChange={(event) => setPutawayForm((form) => ({ ...form, skuReference: event.target.value }))} /></label>
            <label>{text.fields.fromLocation}<input value={putawayForm.fromLocationReference} onChange={(event) => setPutawayForm((form) => ({ ...form, fromLocationReference: event.target.value }))} /></label>
            <label>{text.fields.quantity}<input value={putawayForm.quantity} onChange={(event) => setPutawayForm((form) => ({ ...form, quantity: event.target.value }))} inputMode="numeric" /></label>
            <div className="form-actions">
              <Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.suggest}</Button>
              <Button type="button" onClick={createTask} disabled={mutation.status === 'running' || !putawayForm.stockQuantReference.trim()}>{text.createTask}</Button>
            </div>
          </form>
          {suggestion && <div className="inline-banner"><span>{text.suggestion}: <strong>{suggestion.suggestedLocation?.code ?? text.notSet}</strong> · {suggestion.reason ?? suggestion.strategy}</span></div>}
          <ActionStatus mutation={mutation} />
        </Card>
      </PermissionGate>
    </div>
  );
}

function mapLocations(payload: unknown): LocationRow[] {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((value) => {
    const row = record(value);
    const capacity = record(row['capacity']);
    return {
      id: stringValue(row['id'], stringValue(row['code'], '')),
      code: stringValue(row['code'], ''),
      name: stringValue(row['name'], ''),
      type: stringValue(row['type'], ''),
      zone: nullableString(row['zone']),
      barcode: nullableString(row['barcode']),
      pickSequence: numberValue(row['pickSequence']) ?? 0,
      binStatus: stringValue(row['binStatus'], 'AVAILABLE'),
      capacityUnits: numberValue(capacity['units']),
      isActive: Boolean(row['isActive']),
    };
  }).filter((location) => location.code);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value : fallback; }
function nullableString(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

function locationTypeLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    RECEIVING: { cs: 'Příjem', en: 'Receiving', ua: 'Приймання' },
    STORAGE: { cs: 'Sklad', en: 'Storage', ua: 'Зберігання' },
    PICKING: { cs: 'Picking', en: 'Picking', ua: 'Відбір' },
    PACKING: { cs: 'Balení', en: 'Packing', ua: 'Пакування' },
    SHIPPING: { cs: 'Expedice', en: 'Shipping', ua: 'Відвантаження' },
    BUFFER: { cs: 'Buffer', en: 'Buffer', ua: 'Буфер' },
    QUARANTINE: { cs: 'Karanténa', en: 'Quarantine', ua: 'Карантин' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function binStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    AVAILABLE: { cs: 'Volná', en: 'Available', ua: 'Доступна' },
    HOLD: { cs: 'Hold', en: 'Hold', ua: 'Утримання' },
    RESERVED: { cs: 'Rezervovaná', en: 'Reserved', ua: 'Зарезервована' },
    BLOCKED: { cs: 'Blokovaná', en: 'Blocked', ua: 'Заблокована' },
    FULL: { cs: 'Plná', en: 'Full', ua: 'Повна' },
    DAMAGED: { cs: 'Poškozená', en: 'Damaged', ua: 'Пошкоджена' },
    MAINTENANCE: { cs: 'Servis', en: 'Maintenance', ua: 'Обслуговування' },
    CLOSED: { cs: 'Zavřená', en: 'Closed', ua: 'Закрита' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

const czech = {
  eyebrow: 'lokace · kapacita · zaskladnění',
  title: 'Lokace a zaskladnění',
  refresh: 'Obnovit',
  locations: 'Lokace',
  selectedLocation: 'Vybraná lokace',
  addLocation: 'Přidat lokaci',
  putaway: 'Zaskladnění',
  putawayEyebrow: 'návrh cílové lokace',
  save: 'Uložit',
  select: 'Vybrat',
  all: 'Vše',
  yes: 'Ano',
  no: 'Ne',
  notSet: 'Nenastaveno',
  noBarcode: 'Bez čárového kódu',
  emptyTitle: 'Žádné lokace',
  emptyText: 'Server nevrátil žádné lokace pro vybraný sklad.',
  emptySelection: 'Vyberte lokaci v tabulce.',
  suggest: 'Navrhnout lokaci',
  createTask: 'Vytvořit putaway úkol',
  suggestion: 'Doporučená lokace',
  columns: { code: 'Kód', name: 'Název', type: 'Typ', zone: 'Zóna', status: 'Stav', capacity: 'Kapacita ks', active: 'Aktivní', action: 'Akce' },
  fields: { search: 'Hledat', code: 'Kód', name: 'Název', type: 'Typ', zone: 'Zóna', barcode: 'Čárový kód', aisle: 'Ulička', bay: 'Pozice', level: 'Úroveň', bin: 'Bin', status: 'Stav', capacity: 'Kapacita ks', stockQuant: 'Stock quant', sku: 'SKU', fromLocation: 'Zdrojová lokace', quantity: 'Množství' },
  actions: { saveLocation: 'Uložit lokaci', updateLocation: 'Upravit lokaci', suggest: 'Navrhnout zaskladnění', createTask: 'Vytvořit putaway úkol' },
};

const english = {
  eyebrow: 'locations · capacity · putaway',
  title: 'Locations and putaway',
  refresh: 'Refresh',
  locations: 'Locations',
  selectedLocation: 'Selected location',
  addLocation: 'Add location',
  putaway: 'Putaway',
  putawayEyebrow: 'target location suggestion',
  save: 'Save',
  select: 'Select',
  all: 'All',
  yes: 'Yes',
  no: 'No',
  notSet: 'Not set',
  noBarcode: 'No barcode',
  emptyTitle: 'No locations',
  emptyText: 'The server returned no locations for the selected warehouse.',
  emptySelection: 'Select a location in the table.',
  suggest: 'Suggest location',
  createTask: 'Create putaway task',
  suggestion: 'Suggested location',
  columns: { code: 'Code', name: 'Name', type: 'Type', zone: 'Zone', status: 'Status', capacity: 'Unit capacity', active: 'Active', action: 'Action' },
  fields: { search: 'Search', code: 'Code', name: 'Name', type: 'Type', zone: 'Zone', barcode: 'Barcode', aisle: 'Aisle', bay: 'Bay', level: 'Level', bin: 'Bin', status: 'Status', capacity: 'Unit capacity', stockQuant: 'Stock quant', sku: 'SKU', fromLocation: 'Source location', quantity: 'Quantity' },
  actions: { saveLocation: 'Save location', updateLocation: 'Update location', suggest: 'Suggest putaway', createTask: 'Create putaway task' },
};

const ukrainian = {
  eyebrow: 'локації · місткість · розміщення',
  title: 'Локації та розміщення',
  refresh: 'Оновити',
  locations: 'Локації',
  selectedLocation: 'Вибрана локація',
  addLocation: 'Додати локацію',
  putaway: 'Розміщення',
  putawayEyebrow: 'рекомендація цільової локації',
  save: 'Зберегти',
  select: 'Обрати',
  all: 'Усі',
  yes: 'Так',
  no: 'Ні',
  notSet: 'Не налаштовано',
  noBarcode: 'Без штрихкоду',
  emptyTitle: 'Немає локацій',
  emptyText: 'Сервер не повернув локацій для вибраного складу.',
  emptySelection: 'Виберіть локацію в таблиці.',
  suggest: 'Запропонувати локацію',
  createTask: 'Створити завдання',
  suggestion: 'Рекомендована локація',
  columns: { code: 'Код', name: 'Назва', type: 'Тип', zone: 'Зона', status: 'Стан', capacity: 'Місткість шт.', active: 'Активна', action: 'Дія' },
  fields: { search: 'Пошук', code: 'Код', name: 'Назва', type: 'Тип', zone: 'Зона', barcode: 'Штрихкод', aisle: 'Ряд', bay: 'Позиція', level: 'Рівень', bin: 'Комірка', status: 'Стан', capacity: 'Місткість шт.', stockQuant: 'Stock quant', sku: 'SKU', fromLocation: 'Вихідна локація', quantity: 'Кількість' },
  actions: { saveLocation: 'Зберегти локацію', updateLocation: 'Оновити локацію', suggest: 'Запропонувати розміщення', createTask: 'Створити завдання' },
};
