import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FlowStep, FlowStepper } from '../../components/ui/FlowStepper';
import { PermissionGate } from '../../components/ui/PermissionGate';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatusPill } from '../../components/ui/StatusPill';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { addShipmentPackage, createShipment, generateShipmentLabel, listOutboundOrders, listPackingStations, listShipments, shipShipment, stageShipment } from '../../core/api/wms';
import { mapOutboundOrders, mapPackingLinesFromOrders } from '../../core/api/view-models';
import type { Order, PackingLine } from '../../core/types/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

const emptyOrders: Order[] = [];
const emptyPackingLines: PackingLine[] = [];
const emptyShipments: unknown[] = [];
const emptyPackingStations: unknown[] = [];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function referenceFrom(value: unknown): string | undefined {
  const row = record(value);

  for (const key of ['id', 'shipmentId', 'shipmentNumber', 'packageCode', 'trackingNumber']) {
    const v = row[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }

  const nested = record(row.shipment);
  if (typeof nested.id === 'string') return nested.id;
  if (typeof nested.shipmentNumber === 'string') return nested.shipmentNumber;
  return undefined;
}

function stationReferenceFrom(value: unknown): string | undefined {
  const row = record(value);
  if (typeof row.code === 'string' && row.code.length > 0) return row.code;
  if (typeof row.id === 'string' && row.id.length > 0) return row.id;
  return undefined;
}

function arrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const row = record(payload);
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.results)) return row.results;
  if (Array.isArray(row.data)) return row.data;
  return [];
}

function productLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    'Seed outbound SKU line': {
      cs: 'Položka objednávky',
      en: 'Outbound order item',
      ua: 'Позиція замовлення',
    },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

export function PackingPage() {
  const { warehouseId, roleProfile, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const orderResource = useApiResource({
    fallback: emptyOrders,
    productionFallback: emptyOrders,
    loader: () => listOutboundOrders<unknown[]>(warehouseId),
    map: mapOutboundOrders,
    dependencies: [warehouseId],
  });
  const lineResource = useApiResource({
    fallback: emptyPackingLines,
    productionFallback: emptyPackingLines,
    loader: () => listOutboundOrders<unknown[]>(warehouseId),
    map: mapPackingLinesFromOrders,
    dependencies: [warehouseId],
  });
  const shipmentResource = useApiResource({
    fallback: emptyShipments,
    productionFallback: emptyShipments,
    loader: () => listShipments<unknown[]>(warehouseId),
    map: arrayPayload,
    dependencies: [warehouseId],
  });
  const stationResource = useApiResource({
    fallback: emptyPackingStations,
    productionFallback: emptyPackingStations,
    loader: () => listPackingStations<unknown[]>(warehouseId),
    map: arrayPayload,
    dependencies: [warehouseId],
  });
  const mutation = useApiMutation();
  const liveLines = lineResource.data;
  const liveOrders = orderResource.data;
  const [scan, setScan] = useState('');
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [activeShipmentId, setActiveShipmentId] = useState<string | undefined>();
  const [packageReference, setPackageReference] = useState<string | undefined>();
  const [labelGenerated, setLabelGenerated] = useState(false);
  const [shipped, setShipped] = useState(false);

  const activeOrder = liveLines[0]?.orderId ?? liveOrders.find((order) => order.status !== 'Shipped')?.id;
  const activePackingStationReference = useMemo(
    () => stationResource.data.map(stationReferenceFrom).find(Boolean),
    [stationResource.data],
  );
  const enrichedLines = useMemo(
    () => liveLines.map((line) => ({ ...line, scanned: Math.min(line.expected, line.scanned + (scanned[line.sku] ?? 0)) })),
    [liveLines, scanned],
  );
  const readyForLabel = enrichedLines.length > 0 && enrichedLines.every((line) => line.scanned >= line.expected);
  const canGenerateLabel = Boolean(activeOrder) && (readyForLabel || Boolean(packageReference));
  const progress = enrichedLines.length
    ? Math.round((enrichedLines.reduce((sum, line) => sum + Math.min(line.scanned, line.expected), 0) / enrichedLines.reduce((sum, line) => sum + line.expected, 0)) * 100)
    : 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      orderResource.refresh();
      lineResource.refresh();
      shipmentResource.refresh();
    }, enrichedLines.length > 0 ? 15000 : 3000);
    return () => window.clearInterval(timer);
  }, [enrichedLines.length, orderResource.refresh, lineResource.refresh, shipmentResource.refresh]);

  const steps: FlowStep[] = [
    { id: 'scan', label: text.steps.scan, detail: `${progress}% ${text.steps.complete}`, state: readyForLabel ? 'done' : 'active' },
    { id: 'package', label: text.steps.package, detail: packageReference ?? text.steps.packageDetail, state: packageReference ? 'done' : readyForLabel ? 'active' : 'next' },
    { id: 'label', label: text.steps.label, detail: labelGenerated ? text.steps.labelReady : text.steps.labelWaiting, state: labelGenerated ? 'done' : packageReference ? 'active' : 'next' },
    { id: 'ship', label: text.steps.ship, detail: shipped ? text.steps.shipped : text.steps.shipWaiting, state: shipped ? 'done' : labelGenerated ? 'active' : 'next' },
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const line = enrichedLines.find((item) => item.sku.toLowerCase() === scan.trim().toLowerCase());
    if (line) setScanned((items) => ({ ...items, [line.sku]: (items[line.sku] ?? 0) + 1 }));
    setScan('');
  };

  const ensureShipment = async () => {
    if (activeShipmentId) return activeShipmentId;
    if (!activeOrder) throw new Error(text.noOrderError);
    const payload: Record<string, unknown> = {
      outboundOrderReference: activeOrder,
      carrier: 'EXPRESS_CARRIER',
      serviceLevel: 'STANDARD',
      metadata: { source: 'storage-ui', role: roleProfile.id },
    };
    if (activePackingStationReference) payload.packingStationReference = activePackingStationReference;
    const result = await createShipment(warehouseId, payload);
    const next = referenceFrom(result) ?? activeOrder;
    setActiveShipmentId(next);
    shipmentResource.refresh();
    return next;
  };

  const createPackage = () => {
    if (packageReference) return;
    void mutation.run(text.actions.createPackage, async () => {
      const shipment = await ensureShipment();
      const result = await addShipmentPackage(warehouseId, shipment, {
        packageCode: `STORAGE-PKG-${Date.now()}`,
        packageType: 'CARTON',
        weightGrams: 1200,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 20,
        contents: enrichedLines.map((line) => ({ sku: line.sku, quantity: Math.max(1, line.expected) })),
        metadata: { source: 'storage-ui' },
      });
      setPackageReference(referenceFrom(result));
      return result;
    });
  };

  const printLabel = () => {
    if (labelGenerated) return;
    void mutation.run(text.actions.generateLabel, async () => {
      const shipment = await ensureShipment();
      const result = await generateShipmentLabel(warehouseId, shipment, {
        packageReference,
        labelFormat: 'ZPL',
        payload: { dryRun: true, source: 'storage-ui' },
      });
      setLabelGenerated(true);
      return result;
    });
  };

  const ship = () => {
    if (shipped) return;
    void mutation.run(text.actions.shipShipment, async () => {
      const shipment = await ensureShipment();
      await stageShipment(warehouseId, shipment, {
        metadata: { source: 'storage-ui', stagedBy: roleProfile.id },
      });
      const result = await shipShipment(warehouseId, shipment, {
        allowShipWithoutLabel: true,
        shippedAt: new Date().toISOString(),
        trackingReference: `STORAGE-${Date.now()}`,
        metadata: { source: 'storage-ui' },
      });
      setShipped(true);
      shipmentResource.refresh();
      orderResource.refresh();
      lineResource.refresh();
      setScanned({});
      setActiveShipmentId(undefined);
      setPackageReference(undefined);
      setLabelGenerated(false);
      setShipped(false);
      return result;
    });
  };

  return (
    <div className="page-grid">
        <div className="span-12"><DataSourceBanner label={text.banner} resource={lineResource} /></div>
        <Card title={text.flowTitle} className="span-12">
          <FlowStepper steps={steps} />
        </Card>
        <Card title={`${text.packingTitle} ${activeOrder ?? '-'}`} className="span-8">
          <div className="packing-workbench packing-workbench--os">
            <div>
              <ProgressBar value={progress} />
              <div className="packing-lines">
                {enrichedLines.map((line) => (
                  <article key={line.sku}>
                    <div>
                      <strong>{line.sku}</strong>
                      <p>{productLabel(line.product, language)}{line.serialRequired ? ` · ${text.serialRequired}` : ''}</p>
                    </div>
                    <StatusPill value={line.scanned >= line.expected ? 'Packed' : 'Packing'} />
                    <strong>{line.scanned}/{line.expected}</strong>
                  </article>
                ))}
                {!enrichedLines.length && <p className="role-note">{text.noLines}</p>}
              </div>
            </div>
            <div className="action-panel">
              <form onSubmit={submit}>
                <label>{text.scanLabel}<input data-testid="packing-scan-input" value={scan} onChange={(event) => setScan(event.target.value)} autoFocus placeholder={text.scanPlaceholder} disabled={!enrichedLines.length} /></label>
                <Button tone="primary" type="submit" data-e2e-action="packing-confirm-scan" disabled={!enrichedLines.length}>{text.confirmScan}</Button>
              </form>
              <div className="rf-fast-actions">
                {import.meta.env.DEV && enrichedLines.map((line) => <Button key={line.sku} size="sm" data-e2e-action="packing-fill-sku" data-e2e-value={line.sku} onClick={() => setScan(line.sku)}>{line.sku}</Button>)}
              </div>
              <label>{text.shipment}<input data-testid="packing-shipment-id" value={activeShipmentId ?? text.shipmentWillBeCreated} readOnly /></label>
              <PermissionGate permission="shipment.manage">
                <Button tone="secondary" data-e2e-action="packing-create-package" disabled={!readyForLabel || !activeOrder || Boolean(packageReference) || mutation.status === 'running'} onClick={createPackage}>{text.createPackage}</Button>
                <Button tone="primary" data-e2e-action="packing-generate-label" disabled={!canGenerateLabel || labelGenerated || mutation.status === 'running'} onClick={printLabel}>{text.generateLabel}</Button>
                <Button tone="secondary" data-e2e-action="packing-ship-shipment" disabled={!labelGenerated || shipped || !activeOrder || mutation.status === 'running'} onClick={ship}>{text.shipShipment}</Button>
              </PermissionGate>
              <ActionStatus mutation={mutation} />
            </div>
          </div>
        </Card>
        <Card title={text.labelPreview} eyebrow={shipmentResource.status === 'live' ? text.liveShipments : text.waitingForLabel} className="span-4">
          <div className="label-preview label-preview--pro">
            <div className="barcode" />
            <strong>{text.carrier} · {activeOrder ?? '-'}</strong>
            <p>{packageReference ?? text.packageNotCreated}</p>
            <span>{labelGenerated ? text.labelReady : text.labelWaiting}</span>
            <div className="inline-banner">
              <Badge tone={shipped ? 'good' : labelGenerated ? 'good' : 'warning'}>{shipped ? text.shipped : labelGenerated ? text.ready : text.waiting}</Badge>
              <span>{labelGenerated ? text.labelReadyHint : text.scanFirstHint}</span>
            </div>
          </div>
        </Card>
      </div>
  );
}

const czech = {
  banner: 'API balení a dopravy',
  flowTitle: 'Balení',
  flowEyebrow: 'sken → balík → štítek → odeslání',
  packingTitle: 'Balení',
  packingEyebrow: 'pracoviště skeneru',
  openProgress: 'Otevřít průběh',
  serialRequired: 'vyžaduje sériové číslo',
  noLines: 'Server zatím nevrátil žádné položky k balení.',
  scanLabel: 'Sken položky',
  scanPlaceholder: 'SKU / EAN / sériové číslo',
  confirmScan: 'Potvrdit sken',
  shipment: 'Zásilka',
  shipmentWillBeCreated: 'bude vytvořena přes API',
  createPackage: 'Vytvořit balík',
  generateLabel: 'Vygenerovat štítek',
  shipShipment: 'Odeslat zásilku',
  labelPreview: 'Náhled štítku',
  liveShipments: 'živé zásilky načteny',
  waitingForLabel: 'čeká na štítek',
  carrier: 'Dopravce',
  packageNotCreated: 'Balík zatím není vytvořený.',
  labelReady: 'štítek připraven',
  labelWaiting: 'čeká na štítek',
  shipped: 'Odesláno',
  ready: 'Připraveno',
  waiting: 'Čeká',
  labelReadyHint: 'Připraveno k tisku.',
  scanFirstHint: 'Dokončete sken položek.',
  noOrder: 'Žádná objednávka',
  noOrderError: 'Není vybraná žádná objednávka k balení.',
  progressTitle: 'Průběh balení',
  notCreated: 'nevytvořeno',
  progress: 'Průběh',
  dataMode: 'Režim dat',
  liveApi: 'živé API',
  notLive: 'bez živých dat',
  scannedItems: 'položek naskenováno',
  scanDetail: 'Záznam SKU nebo sériového čísla.',
  packageWaiting: 'Čeká na balík',
  packageDetail: 'Rozměry kartonu a obsah zásilky.',
  labelReadyTitle: 'Štítek dopravce připraven',
  labelWaitingTitle: 'Čeká na štítek',
  labelDetail: 'Tok dopravního štítku ze serveru.',
  shippedTitle: 'Zásilka uzavřena',
  shipWaitingTitle: 'Připraveno pro manifest',
  shipDetail: 'Finální odeslání a tracking reference.',
  actions: {
    createPackage: 'Vytvořit balík zásilky',
    generateLabel: 'Vygenerovat štítek dopravce',
    shipShipment: 'Odeslat zásilku',
  },
  steps: {
    scan: 'Sken položek',
    complete: 'kompletace',
    package: 'Balík',
    packageDetail: 'karton a obsah',
    label: 'Štítek dopravce',
    labelReady: 'štítek připraven',
    labelWaiting: 'čeká na balík',
    ship: 'Odeslání',
    shipped: 'uzavřeno',
    shipWaiting: 'předání do manifestu',
  },
};

const english = {
  banner: 'Packing and shipping API',
  flowTitle: 'Packing',
  flowEyebrow: 'scan → package → label → ship',
  packingTitle: 'Packing',
  packingEyebrow: 'scanner workstation',
  openProgress: 'Open progress',
  serialRequired: 'serial number required',
  noLines: 'The server has not returned any packing lines yet.',
  scanLabel: 'Item scan',
  scanPlaceholder: 'SKU / EAN / serial number',
  confirmScan: 'Confirm scan',
  shipment: 'Shipment',
  shipmentWillBeCreated: 'will be created through API',
  createPackage: 'Create package',
  generateLabel: 'Generate label',
  shipShipment: 'Ship shipment',
  labelPreview: 'Label preview',
  liveShipments: 'live shipments loaded',
  waitingForLabel: 'waiting for label',
  carrier: 'Carrier',
  packageNotCreated: 'Package has not been created yet.',
  labelReady: 'label ready',
  labelWaiting: 'waiting for label',
  shipped: 'Shipped',
  ready: 'Ready',
  waiting: 'Waiting',
  labelReadyHint: 'Ready to print.',
  scanFirstHint: 'Finish item scans.',
  noOrder: 'No order',
  noOrderError: 'No order is selected for packing.',
  progressTitle: 'Packing progress',
  notCreated: 'not created',
  progress: 'Progress',
  dataMode: 'Data mode',
  liveApi: 'live API',
  notLive: 'no live data',
  scannedItems: 'items scanned',
  scanDetail: 'SKU or serial number record.',
  packageWaiting: 'Waiting for package',
  packageDetail: 'Carton dimensions and shipment contents.',
  labelReadyTitle: 'Carrier label ready',
  labelWaitingTitle: 'Waiting for label',
  labelDetail: 'Carrier label flow from the server.',
  shippedTitle: 'Shipment closed',
  shipWaitingTitle: 'Ready for manifest',
  shipDetail: 'Final shipping and tracking reference.',
  actions: {
    createPackage: 'Create shipment package',
    generateLabel: 'Generate carrier label',
    shipShipment: 'Ship shipment',
  },
  steps: {
    scan: 'Item scan',
    complete: 'complete',
    package: 'Package',
    packageDetail: 'carton and contents',
    label: 'Carrier label',
    labelReady: 'label ready',
    labelWaiting: 'waiting for package',
    ship: 'Shipping',
    shipped: 'closed',
    shipWaiting: 'handover to manifest',
  },
};

const ukrainian = {
  banner: 'API пакування та доставки',
  flowTitle: 'Пакування',
  flowEyebrow: 'скан → посилка → етикетка → відправка',
  packingTitle: 'Пакування',
  packingEyebrow: 'робоче місце сканера',
  openProgress: 'Відкрити прогрес',
  serialRequired: 'потрібен серійний номер',
  noLines: 'Сервер поки не повернув жодних позицій для пакування.',
  scanLabel: 'Скан позиції',
  scanPlaceholder: 'SKU / EAN / серійний номер',
  confirmScan: 'Підтвердити скан',
  shipment: 'Відправлення',
  shipmentWillBeCreated: 'буде створено через API',
  createPackage: 'Створити посилку',
  generateLabel: 'Згенерувати етикетку',
  shipShipment: 'Відправити',
  labelPreview: 'Перегляд етикетки',
  liveShipments: 'живі відправлення завантажено',
  waitingForLabel: 'очікує етикетку',
  carrier: 'Перевізник',
  packageNotCreated: 'Посилку ще не створено.',
  labelReady: 'етикетка готова',
  labelWaiting: 'очікує етикетку',
  shipped: 'Відправлено',
  ready: 'Готово',
  waiting: 'Очікує',
  labelReadyHint: 'Готово до друку.',
  scanFirstHint: 'Завершіть скан позицій.',
  noOrder: 'Немає замовлення',
  noOrderError: 'Не вибрано замовлення для пакування.',
  progressTitle: 'Прогрес пакування',
  notCreated: 'не створено',
  progress: 'Прогрес',
  dataMode: 'Режим даних',
  liveApi: 'живе API',
  notLive: 'без живих даних',
  scannedItems: 'позицій відскановано',
  scanDetail: 'Запис SKU або серійного номера.',
  packageWaiting: 'Очікує посилку',
  packageDetail: 'Розміри коробки та вміст відправлення.',
  labelReadyTitle: 'Етикетка перевізника готова',
  labelWaitingTitle: 'Очікує етикетку',
  labelDetail: 'Потік етикетки перевізника із сервера.',
  shippedTitle: 'Відправлення закрито',
  shipWaitingTitle: 'Готово до маніфесту',
  shipDetail: 'Фінальна відправка та tracking reference.',
  actions: {
    createPackage: 'Створити посилку відправлення',
    generateLabel: 'Згенерувати етикетку перевізника',
    shipShipment: 'Відправити відправлення',
  },
  steps: {
    scan: 'Скан позицій',
    complete: 'комплектація',
    package: 'Посилка',
    packageDetail: 'коробка та вміст',
    label: 'Етикетка перевізника',
    labelReady: 'етикетка готова',
    labelWaiting: 'очікує посилку',
    ship: 'Відправка',
    shipped: 'закрито',
    shipWaiting: 'передача до маніфесту',
  },
};
