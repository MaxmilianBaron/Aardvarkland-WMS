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
import { adjustInventoryStock, createWmsIdempotencyKey, listStockQuants, moveInventoryStock, receiveInventoryStock } from '../../core/api/wms';
import { mapStockQuants } from '../../core/api/view-models';
import type { StockQuant } from '../../core/types/wms';
import { numberFormat } from '../../core/utils/format';

const emptyStockQuants: StockQuant[] = [];

export function InventoryPage() {
  const { warehouseId, warehouse, clientScope, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const resource = useApiResource({ fallback: emptyStockQuants, productionFallback: emptyStockQuants, loader: () => listStockQuants<unknown[]>(warehouseId), map: mapStockQuants, dependencies: [warehouseId] });
  const mutation = useApiMutation();
  const sourceRows = resource.data;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(sourceRows[0]?.id ?? '');
  const selected = sourceRows.find((row) => row.id === selectedId) ?? sourceRows[0];
  const [quantity, setQuantity] = useState('1');
  const [targetLocation, setTargetLocation] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceRows;
    return sourceRows.filter((quant) => `${quant.sku} ${quant.product} ${quant.location} ${quant.lot} ${quant.client}`.toLowerCase().includes(q));
  }, [query, sourceRows]);

  const columns: Column<StockQuant>[] = [
    { key: 'select', label: '', render: (row) => <input className="radio-input" type="radio" name="quant" data-mcp-row="quant" data-mcp-value={`${row.id} ${row.sku}`} checked={selected?.id === row.id} onChange={() => setSelectedId(row.id)} /> },
    { key: 'sku', label: 'SKU', render: (row) => <div><strong>{row.sku}</strong><small>{row.product}</small></div> },
    { key: 'location', label: text.columns.location, render: (row) => <Badge>{row.location}</Badge> },
    { key: 'lot', label: text.columns.lot, render: (row) => row.lot || '-' },
    { key: 'available', label: text.columns.available, align: 'right', render: (row) => numberFormat(row.available) },
    { key: 'reserved', label: text.columns.reserved, align: 'right', render: (row) => numberFormat(row.reserved) },
    { key: 'status', label: text.columns.status, render: (row) => <StatusPill value={row.status} /> },
    { key: 'client', label: text.columns.owner, render: (row) => row.client || '-' },
  ];

  const totalAvailable = sourceRows.reduce((sum, quant) => sum + quant.available, 0);
  const reserved = sourceRows.reduce((sum, quant) => sum + quant.reserved, 0);
  const blocked = sourceRows.filter((row) => row.status === 'Blocked' || row.status === 'Quarantine').length;
  const utilization = totalAvailable + reserved > 0 ? Math.round((reserved / (totalAvailable + reserved)) * 100) : 0;
  const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const normalizedTargetLocation = targetLocation.trim();
  const targetIsCurrentLocation = Boolean(selected && normalizedTargetLocation && normalizedTargetLocation.toLowerCase() === selected.location.toLowerCase());

  const afterMutation = async (label: string, action: () => Promise<unknown>) => {
    const result = await mutation.run(label, action);
    if (result) resource.refresh();
  };

  const receive = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void afterMutation(text.actions.receive, () => receiveInventoryStock(warehouseId, {
      skuReference: selected.sku,
      locationReference: selected.location,
      quantity: parsedQuantity,
      status: 'AVAILABLE',
      reference: createWmsIdempotencyKey('storage-ui-receive-ref'),
      idempotencyKey: createWmsIdempotencyKey('storage-receive'),
      metadata: { source: 'storage-ui' },
    }));
  };

  const move = () => {
    if (!selected || !normalizedTargetLocation || targetIsCurrentLocation) return;
    void afterMutation(text.actions.move, () => moveInventoryStock(warehouseId, {
      quantReference: selected.id,
      toLocationReference: normalizedTargetLocation,
      quantity: Math.min(parsedQuantity, Math.max(1, selected.available)),
      status: 'AVAILABLE',
      reason: text.reasons.move,
      idempotencyKey: createWmsIdempotencyKey('storage-move'),
      metadata: { source: 'storage-ui' },
    }));
  };

  const adjust = () => {
    if (!selected) return;
    void afterMutation(text.actions.adjust, () => adjustInventoryStock(warehouseId, {
      quantReference: selected.id,
      quantityDelta: parsedQuantity,
      reasonCode: 'MANUAL_CORRECTION',
      reason: text.reasons.adjust,
      reference: createWmsIdempotencyKey('storage-adjust-ref'),
      idempotencyKey: createWmsIdempotencyKey('storage-adjust'),
      metadata: { source: 'storage-ui' },
    }));
  };

  return (
    <div className="page-grid page-grid--tight inventory-minimal-page">
      <section className="wms-page-intro span-12">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <span>{warehouse.label} · {clientScope}</span>
        </div>
        <div className="wms-page-intro__actions">
          <Badge tone={blocked > 0 ? 'warning' : 'good'}>{blocked} {text.blocked}</Badge>
        </div>
      </section>

      <div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div>

      <Card
        title={text.tableTitle}
        eyebrow={text.tableEyebrow}
        className="span-8"
        action={<input className="search-input" data-testid="inventory-search" placeholder={text.searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} />}
      >
        <DataTable rows={rows} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.emptyTitle} emptyText={text.emptyText} />
      </Card>

      <Card title={text.detailTitle} eyebrow={text.detailEyebrow} className="span-4 detail-card">
        <div className="stock-detail">
          <div className="stock-detail__header">
            <div>
              <span>{text.currentSelection}</span>
              <strong>{selected?.sku ?? '-'}</strong>
              <small>{selected?.product ?? text.noSelection}</small>
            </div>
            {selected && <StatusPill value={selected.status} />}
          </div>

          <div className="metric-stack metric-stack--compact">
            <article><span>{text.metrics.available}</span><strong>{numberFormat(totalAvailable)}</strong></article>
            <article><span>{text.metrics.reserved}</span><strong>{numberFormat(reserved)}</strong></article>
            <article><span>{text.metrics.reservationLoad}</span><strong>{utilization}%</strong><ProgressBar value={utilization} /></article>
          </div>

          <form className="action-panel" onSubmit={receive}>
            <label>{text.fields.quantity}<input data-testid="inventory-quantity" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <label>{text.fields.targetLocation}<input data-testid="inventory-target-location" value={targetLocation} onChange={(event) => setTargetLocation(event.target.value)} placeholder={text.fields.targetPlaceholder} /></label>
            {targetIsCurrentLocation && <p className="form-hint">{text.sameLocationHint}</p>}
            <Button tone="primary" type="submit" data-mcp-action="inventory-receive" disabled={!selected || mutation.status === 'running'}>{text.buttons.receive}</Button>
            <div className="button-row">
              <Button type="button" tone="secondary" data-mcp-action="inventory-move" disabled={!selected || !normalizedTargetLocation || targetIsCurrentLocation || mutation.status === 'running'} onClick={move}>{text.buttons.move}</Button>
              <Button type="button" tone="secondary" data-mcp-action="inventory-adjust" disabled={!selected || mutation.status === 'running'} onClick={adjust}>{text.buttons.adjust}</Button>
            </div>
            <ActionStatus mutation={mutation} />
          </form>
        </div>
      </Card>

    </div>
  );
}

const czech = {
  eyebrow: 'zásoby',
  title: 'Zásoby',
  blocked: 'blokací',
  banner: 'API zásob',
  tableTitle: 'Položky',
  tableEyebrow: 'živé zásoby',
  searchPlaceholder: 'Hledat SKU, lokaci nebo šarži...',
  detailTitle: 'Vybraná položka',
  detailEyebrow: 'příjem · přesun · úprava',
  currentSelection: 'Aktuální výběr',
  noSelection: 'Není vybraná žádná zásoba',
  emptyTitle: 'Žádné zásoby',
  emptyText: 'Server zatím nevrátil žádné zásoby.',
  columns: { location: 'Lokace', lot: 'Šarže', available: 'Dostupné', reserved: 'Rezervované', status: 'Stav', owner: 'Vlastník' },
  metrics: { available: 'Dostupné', reserved: 'Rezervované', reservationLoad: 'Zatížení rezervací' },
  fields: { quantity: 'Množství', targetLocation: 'Cílová lokace', targetPlaceholder: 'Např. A-01-01' },
  sameLocationHint: 'Zadejte jinou cílovou lokaci.',
  buttons: { receive: 'Přijmout zásobu', move: 'Přesunout', adjust: 'Upravit +ks' },
  actions: { receive: 'Přijmout zásobu', move: 'Přesunout zásobu', adjust: 'Upravit zásobu' },
  reasons: { move: 'Přesun zásoby z jednoduchého UI', adjust: 'Ruční korekce z jednoduchého UI' },
};

const english = {
  eyebrow: 'inventory',
  title: 'Inventory',
  blocked: 'blocked',
  banner: 'Inventory API',
  tableTitle: 'Items',
  tableEyebrow: 'live stock',
  searchPlaceholder: 'Search SKU, location, or lot...',
  detailTitle: 'Selected item',
  detailEyebrow: 'receive · move · adjust',
  currentSelection: 'Current selection',
  noSelection: 'No stock is selected',
  emptyTitle: 'No inventory',
  emptyText: 'The server has not returned any inventory yet.',
  columns: { location: 'Location', lot: 'Lot', available: 'Available', reserved: 'Reserved', status: 'Status', owner: 'Owner' },
  metrics: { available: 'Available', reserved: 'Reserved', reservationLoad: 'Reservation load' },
  fields: { quantity: 'Quantity', targetLocation: 'Target location', targetPlaceholder: 'For example A-01-01' },
  sameLocationHint: 'Enter a different target location.',
  buttons: { receive: 'Receive stock', move: 'Move', adjust: 'Adjust +pcs' },
  actions: { receive: 'Receive stock', move: 'Move stock', adjust: 'Adjust stock' },
  reasons: { move: 'Stock movement from the simple UI', adjust: 'Manual correction from the simple UI' },
};

const ukrainian = {
  eyebrow: 'запаси',
  title: 'Запаси',
  blocked: 'блокувань',
  banner: 'API запасів',
  tableTitle: 'Позиції',
  tableEyebrow: 'живі запаси',
  searchPlaceholder: 'Шукати SKU, локацію або партію...',
  detailTitle: 'Вибрана позиція',
  detailEyebrow: 'приймання · переміщення · корекція',
  currentSelection: 'Поточний вибір',
  noSelection: 'Не вибрано жодного запасу',
  emptyTitle: 'Немає запасів',
  emptyText: 'Сервер поки не повернув жодних запасів.',
  columns: { location: 'Локація', lot: 'Партія', available: 'Доступно', reserved: 'Резерв', status: 'Стан', owner: 'Власник' },
  metrics: { available: 'Доступно', reserved: 'Зарезервовано', reservationLoad: 'Навантаження резервів' },
  fields: { quantity: 'Кількість', targetLocation: 'Цільова локація', targetPlaceholder: 'Напр. A-01-01' },
  sameLocationHint: 'Введіть іншу цільову локацію.',
  buttons: { receive: 'Прийняти запас', move: 'Перемістити', adjust: 'Корекція +шт' },
  actions: { receive: 'Прийняти запас', move: 'Перемістити запас', adjust: 'Коригувати запас' },
  reasons: { move: 'Переміщення запасу з простого UI', adjust: 'Ручна корекція з простого UI' },
};
