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
  completeQualityInspection,
  createQualityInspection,
  createReturn,
  inspectReturnLine,
  listQualityInspections,
  listReturns,
  receiveReturnLine,
  releaseQualityQuarantine,
} from '../../core/api/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface ReturnLine {
  id: string;
  lineNumber: string;
  expectedQuantity: number;
  receivedQuantity: number;
  inspectedQuantity: number;
  disposition: string | null;
  status: string;
}

interface ReturnOrder {
  id: string;
  rmaNumber: string;
  status: string;
  customerReference: string | null;
  reasonCode: string | null;
  lines: ReturnLine[];
  createdAt: string;
}

interface QualityInspection {
  id: string;
  inspectionNumber: string;
  status: string;
  result: string | null;
  sampleQuantity: number;
  reasonCode: string | null;
  stockQuantId: string | null;
  completedAt: string | null;
}

const emptyReturns: ReturnOrder[] = [];
const emptyInspections: QualityInspection[] = [];
const dispositions = ['RESTOCK', 'QUARANTINE', 'DAMAGED', 'SCRAP', 'SUPPLIER_RETURN'];
const inspectionResults = ['PASS', 'FAIL', 'HOLD', 'QUARANTINE', 'RELEASE'];

export function QualityPage() {
  const { warehouseId, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const mutation = useApiMutation();
  const returnsResource = useApiResource<ReturnOrder[]>({
    fallback: emptyReturns,
    productionFallback: emptyReturns,
    loader: () => listReturns<unknown[]>(warehouseId),
    map: mapReturns,
    dependencies: [warehouseId],
  });
  const inspectionsResource = useApiResource<QualityInspection[]>({
    fallback: emptyInspections,
    productionFallback: emptyInspections,
    loader: () => listQualityInspections<unknown[]>(warehouseId),
    map: mapInspections,
    dependencies: [warehouseId],
  });
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [returnForm, setReturnForm] = useState({ rmaNumber: '', skuReference: '', quantity: '1', reasonCode: '', customerReference: '' });
  const [lineForm, setLineForm] = useState({ returnId: '', lineId: '', quantity: '1', disposition: 'RESTOCK', acceptedQuantity: '1', rejectedQuantity: '0', locationReference: '', notes: '' });
  const [inspectionForm, setInspectionForm] = useState({ inspectionNumber: '', skuReference: '', stockQuantId: '', sampleQuantity: '1', reasonCode: '' });
  const [completeForm, setCompleteForm] = useState({ result: 'PASS', notes: '', quarantineQuantId: '' });
  const selectedReturn = returnsResource.data.find((item) => item.id === selectedReturnId) ?? returnsResource.data[0];
  const selectedLine = selectedReturn?.lines[0];
  const selectedInspection = inspectionsResource.data.find((item) => item.id === selectedInspectionId) ?? inspectionsResource.data[0];
  const openReturns = returnsResource.data.filter((item) => item.status !== 'CLOSED' && item.status !== 'CANCELLED').length;
  const openInspections = inspectionsResource.data.filter((item) => item.status === 'OPEN' || item.status === 'QUARANTINED').length;
  const returnRows = useMemo(() => returnsResource.data, [returnsResource.data]);
  const returnColumns: Column<ReturnOrder>[] = [
    { key: 'rma', label: text.columns.rma, render: (row) => <strong>{row.rmaNumber}</strong> },
    { key: 'status', label: text.columns.status, render: (row) => <Badge tone={row.status === 'CLOSED' ? 'good' : row.status === 'CANCELLED' ? 'warning' : 'neutral'}>{returnStatusLabel(row.status, language)}</Badge> },
    { key: 'customer', label: text.columns.customer, render: (row) => row.customerReference ?? text.notSet },
    { key: 'lines', label: text.columns.lines, align: 'right', render: (row) => row.lines.length },
    { key: 'action', label: text.columns.action, align: 'right', render: (row) => <Button size="sm" type="button" onClick={() => { setSelectedReturnId(row.id); setLineForm((form) => ({ ...form, returnId: row.id, lineId: row.lines[0]?.id ?? '' })); }}>{text.select}</Button> },
  ];
  const inspectionColumns: Column<QualityInspection>[] = [
    { key: 'number', label: text.columns.inspection, render: (row) => <strong>{row.inspectionNumber}</strong> },
    { key: 'status', label: text.columns.status, render: (row) => <Badge tone={row.status === 'PASSED' || row.status === 'RELEASED' ? 'good' : row.status === 'FAILED' || row.status === 'QUARANTINED' ? 'warning' : 'neutral'}>{inspectionStatusLabel(row.status, language)}</Badge> },
    { key: 'sample', label: text.columns.sample, align: 'right', render: (row) => row.sampleQuantity },
    { key: 'reason', label: text.columns.reason, render: (row) => row.reasonCode ?? text.notSet },
    { key: 'action', label: text.columns.action, align: 'right', render: (row) => <Button size="sm" type="button" onClick={() => setSelectedInspectionId(row.id)}>{text.select}</Button> },
  ];

  async function createReturnOrder(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run(text.actions.createReturn, () => createReturn(warehouseId, {
      rmaNumber: returnForm.rmaNumber,
      customerReference: returnForm.customerReference || undefined,
      reasonCode: returnForm.reasonCode || undefined,
      lines: [{
        lineNumber: '1',
        skuReference: returnForm.skuReference,
        expectedQuantity: Number(returnForm.quantity) || 1,
      }],
      metadata: { source: 'quality-ui' },
    }));
    if (result) {
      setReturnForm({ rmaNumber: '', skuReference: '', quantity: '1', reasonCode: '', customerReference: '' });
      returnsResource.refresh();
    }
  }

  async function receiveLine(event: FormEvent) {
    event.preventDefault();
    const returnId = lineForm.returnId || selectedReturn?.id;
    const lineId = lineForm.lineId || selectedLine?.id;
    if (!returnId || !lineId) return;
    const result = await mutation.run(text.actions.receiveLine, () => receiveReturnLine(warehouseId, returnId, lineId, {
      quantity: Number(lineForm.quantity) || 1,
      metadata: { source: 'quality-ui' },
    }));
    if (result) returnsResource.refresh();
  }

  async function inspectLine(event: FormEvent) {
    event.preventDefault();
    const returnId = lineForm.returnId || selectedReturn?.id;
    const lineId = lineForm.lineId || selectedLine?.id;
    if (!returnId || !lineId) return;
    const result = await mutation.run(text.actions.inspectLine, () => inspectReturnLine(warehouseId, returnId, lineId, {
      disposition: lineForm.disposition,
      inspectedQuantity: Number(lineForm.quantity) || 1,
      acceptedQuantity: Number(lineForm.acceptedQuantity) || 0,
      rejectedQuantity: Number(lineForm.rejectedQuantity) || 0,
      locationReference: lineForm.locationReference || undefined,
      notes: lineForm.notes || undefined,
      metadata: { source: 'quality-ui' },
    }));
    if (result) returnsResource.refresh();
  }

  async function createInspection(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run(text.actions.createInspection, () => createQualityInspection(warehouseId, {
      inspectionNumber: inspectionForm.inspectionNumber,
      skuReference: inspectionForm.skuReference || undefined,
      stockQuantId: inspectionForm.stockQuantId || undefined,
      sampleQuantity: Number(inspectionForm.sampleQuantity) || 1,
      reasonCode: inspectionForm.reasonCode || undefined,
      metadata: { source: 'quality-ui' },
    }));
    if (result) {
      setInspectionForm({ inspectionNumber: '', skuReference: '', stockQuantId: '', sampleQuantity: '1', reasonCode: '' });
      inspectionsResource.refresh();
    }
  }

  async function completeInspection(event: FormEvent) {
    event.preventDefault();
    if (!selectedInspection) return;
    const result = await mutation.run(text.actions.completeInspection, () => completeQualityInspection(warehouseId, selectedInspection.id, {
      result: completeForm.result,
      notes: completeForm.notes || undefined,
      metadata: { source: 'quality-ui' },
    }));
    if (result) inspectionsResource.refresh();
  }

  async function releaseQuarantine() {
    if (!completeForm.quarantineQuantId.trim()) return;
    const result = await mutation.run(text.actions.releaseQuarantine, () => releaseQualityQuarantine(warehouseId, completeForm.quarantineQuantId));
    if (result) {
      setCompleteForm((form) => ({ ...form, quarantineQuantId: '' }));
      inspectionsResource.refresh();
    }
  }

  return (
    <div className="page-grid">
      <div className="span-12"><DataSourceBanner label={text.title} resource={returnsResource} /></div>
      <section className="wms-page-intro span-12">
        <div><p className="eyebrow">{text.eyebrow}</p><h2>{text.title}</h2></div>
        <Button size="sm" type="button" onClick={() => { returnsResource.refresh(); inspectionsResource.refresh(); }}>{text.refresh}</Button>
      </section>

      <Card title={text.health} className="span-12">
        <div className="metric-stack metric-stack--inline">
          <article><span>{text.metrics.openReturns}</span><strong>{openReturns}</strong></article>
          <article><span>{text.metrics.openInspections}</span><strong>{openInspections}</strong></article>
          <article><span>{text.metrics.returnLines}</span><strong>{returnsResource.data.reduce((sum, item) => sum + item.lines.length, 0)}</strong></article>
        </div>
      </Card>

      <Card title={text.returns} className="span-7">
        <DataTable rows={returnRows} columns={returnColumns} getRowKey={(row) => row.id} emptyTitle={text.emptyReturnsTitle} emptyText={text.emptyReturnsText} />
      </Card>

      <Card title={text.inspections} className="span-5">
        <DataTable rows={inspectionsResource.data} columns={inspectionColumns} getRowKey={(row) => row.id} emptyTitle={text.emptyInspectionsTitle} emptyText={text.emptyInspectionsText} />
      </Card>

      <PermissionGate permission="inventory.adjust">
        <Card title={text.createReturn} className="span-6">
          <form className="stacked-form" onSubmit={createReturnOrder}>
            <label>{text.fields.rma}<input value={returnForm.rmaNumber} onChange={(event) => setReturnForm((form) => ({ ...form, rmaNumber: event.target.value }))} required /></label>
            <label>{text.fields.sku}<input value={returnForm.skuReference} onChange={(event) => setReturnForm((form) => ({ ...form, skuReference: event.target.value }))} required /></label>
            <label>{text.fields.quantity}<input value={returnForm.quantity} onChange={(event) => setReturnForm((form) => ({ ...form, quantity: event.target.value }))} inputMode="numeric" /></label>
            <label>{text.fields.reason}<input value={returnForm.reasonCode} onChange={(event) => setReturnForm((form) => ({ ...form, reasonCode: event.target.value }))} /></label>
            <label>{text.fields.customer}<input value={returnForm.customerReference} onChange={(event) => setReturnForm((form) => ({ ...form, customerReference: event.target.value }))} /></label>
            <Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>

        <Card title={text.returnProcessing} eyebrow={selectedReturn?.rmaNumber ?? text.notSet} className="span-6">
          <form className="stacked-form" onSubmit={receiveLine}>
            <label>{text.fields.returnId}<input value={lineForm.returnId || selectedReturn?.id || ''} onChange={(event) => setLineForm((form) => ({ ...form, returnId: event.target.value }))} /></label>
            <label>{text.fields.lineId}<select value={lineForm.lineId || selectedLine?.id || ''} onChange={(event) => setLineForm((form) => ({ ...form, lineId: event.target.value }))}>{selectedReturn?.lines.map((line) => <option key={line.id} value={line.id}>{line.lineNumber} · {line.status}</option>)}</select></label>
            <label>{text.fields.quantity}<input value={lineForm.quantity} onChange={(event) => setLineForm((form) => ({ ...form, quantity: event.target.value }))} inputMode="numeric" /></label>
            <div className="form-actions"><Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.receive}</Button></div>
          </form>
          <form className="stacked-form" onSubmit={inspectLine}>
            <label>{text.fields.disposition}<select value={lineForm.disposition} onChange={(event) => setLineForm((form) => ({ ...form, disposition: event.target.value }))}>{dispositions.map((item) => <option key={item} value={item}>{dispositionLabel(item, language)}</option>)}</select></label>
            <label>{text.fields.accepted}<input value={lineForm.acceptedQuantity} onChange={(event) => setLineForm((form) => ({ ...form, acceptedQuantity: event.target.value }))} inputMode="numeric" /></label>
            <label>{text.fields.rejected}<input value={lineForm.rejectedQuantity} onChange={(event) => setLineForm((form) => ({ ...form, rejectedQuantity: event.target.value }))} inputMode="numeric" /></label>
            <label>{text.fields.location}<input value={lineForm.locationReference} onChange={(event) => setLineForm((form) => ({ ...form, locationReference: event.target.value }))} /></label>
            <label>{text.fields.notes}<textarea value={lineForm.notes} onChange={(event) => setLineForm((form) => ({ ...form, notes: event.target.value }))} rows={3} /></label>
            <Button type="submit" disabled={mutation.status === 'running'}>{text.inspect}</Button>
          </form>
          <ActionStatus mutation={mutation} />
        </Card>

        <Card title={text.createInspection} className="span-6">
          <form className="stacked-form" onSubmit={createInspection}>
            <label>{text.fields.inspection}<input value={inspectionForm.inspectionNumber} onChange={(event) => setInspectionForm((form) => ({ ...form, inspectionNumber: event.target.value }))} required /></label>
            <label>{text.fields.sku}<input value={inspectionForm.skuReference} onChange={(event) => setInspectionForm((form) => ({ ...form, skuReference: event.target.value }))} /></label>
            <label>{text.fields.stockQuant}<input value={inspectionForm.stockQuantId} onChange={(event) => setInspectionForm((form) => ({ ...form, stockQuantId: event.target.value }))} /></label>
            <label>{text.fields.sample}<input value={inspectionForm.sampleQuantity} onChange={(event) => setInspectionForm((form) => ({ ...form, sampleQuantity: event.target.value }))} inputMode="numeric" /></label>
            <label>{text.fields.reason}<input value={inspectionForm.reasonCode} onChange={(event) => setInspectionForm((form) => ({ ...form, reasonCode: event.target.value }))} /></label>
            <Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>

        <Card title={text.completeInspection} eyebrow={selectedInspection?.inspectionNumber ?? text.notSet} className="span-6">
          <form className="stacked-form" onSubmit={completeInspection}>
            <label>{text.fields.result}<select value={completeForm.result} onChange={(event) => setCompleteForm((form) => ({ ...form, result: event.target.value }))}>{inspectionResults.map((item) => <option key={item} value={item}>{inspectionResultLabel(item, language)}</option>)}</select></label>
            <label>{text.fields.notes}<textarea value={completeForm.notes} onChange={(event) => setCompleteForm((form) => ({ ...form, notes: event.target.value }))} rows={3} /></label>
            <Button tone="primary" type="submit" disabled={mutation.status === 'running' || !selectedInspection}>{text.complete}</Button>
          </form>
          <div className="stacked-form">
            <label>{text.fields.quarantineQuant}<input value={completeForm.quarantineQuantId} onChange={(event) => setCompleteForm((form) => ({ ...form, quarantineQuantId: event.target.value }))} /></label>
            <Button type="button" onClick={releaseQuarantine} disabled={mutation.status === 'running' || !completeForm.quarantineQuantId.trim()}>{text.release}</Button>
          </div>
        </Card>
      </PermissionGate>
    </div>
  );
}

function mapReturns(payload: unknown): ReturnOrder[] {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((value) => {
    const row = record(value);
    return {
      id: stringValue(row['id'], ''),
      rmaNumber: stringValue(row['rmaNumber'], ''),
      status: stringValue(row['status'], ''),
      customerReference: nullableString(row['customerReference']),
      reasonCode: nullableString(row['reasonCode']),
      lines: array(row['lines']).map(mapReturnLine),
      createdAt: stringValue(row['createdAt'], ''),
    };
  }).filter((row) => row.id);
}

function mapReturnLine(value: unknown): ReturnLine {
  const row = record(value);
  return {
    id: stringValue(row['id'], ''),
    lineNumber: stringValue(row['lineNumber'], ''),
    expectedQuantity: numberValue(row['expectedQuantity']),
    receivedQuantity: numberValue(row['receivedQuantity']),
    inspectedQuantity: numberValue(row['inspectedQuantity']),
    disposition: nullableString(row['disposition']),
    status: stringValue(row['status'], ''),
  };
}

function mapInspections(payload: unknown): QualityInspection[] {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((value) => {
    const row = record(value);
    return {
      id: stringValue(row['id'], ''),
      inspectionNumber: stringValue(row['inspectionNumber'], ''),
      status: stringValue(row['status'], ''),
      result: nullableString(row['result']),
      sampleQuantity: numberValue(row['sampleQuantity']),
      reasonCode: nullableString(row['reasonCode']),
      stockQuantId: nullableString(row['stockQuantId']),
      completedAt: nullableString(row['completedAt']),
    };
  }).filter((row) => row.id);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value : fallback; }
function nullableString(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }

function returnStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    CREATED: { cs: 'Vytvořeno', en: 'Created', ua: 'Створено' },
    RECEIVING: { cs: 'Příjem', en: 'Receiving', ua: 'Приймання' },
    INSPECTION: { cs: 'Kontrola', en: 'Inspection', ua: 'Контроль' },
    CLOSED: { cs: 'Uzavřeno', en: 'Closed', ua: 'Закрито' },
    CANCELLED: { cs: 'Zrušeno', en: 'Cancelled', ua: 'Скасовано' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function inspectionStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    OPEN: { cs: 'Otevřeno', en: 'Open', ua: 'Відкрито' },
    PASSED: { cs: 'Prošlo', en: 'Passed', ua: 'Пройдено' },
    FAILED: { cs: 'Neprošlo', en: 'Failed', ua: 'Не пройдено' },
    QUARANTINED: { cs: 'Karanténa', en: 'Quarantined', ua: 'Карантин' },
    RELEASED: { cs: 'Uvolněno', en: 'Released', ua: 'Випущено' },
    CANCELLED: { cs: 'Zrušeno', en: 'Cancelled', ua: 'Скасовано' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function dispositionLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    RESTOCK: { cs: 'Vrátit do zásob', en: 'Restock', ua: 'Повернути в запас' },
    QUARANTINE: { cs: 'Karanténa', en: 'Quarantine', ua: 'Карантин' },
    DAMAGED: { cs: 'Poškozené', en: 'Damaged', ua: 'Пошкоджено' },
    SCRAP: { cs: 'Likvidace', en: 'Scrap', ua: 'Списання' },
    SUPPLIER_RETURN: { cs: 'Vrátit dodavateli', en: 'Supplier return', ua: 'Повернення постачальнику' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function inspectionResultLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    PASS: { cs: 'Schválit', en: 'Pass', ua: 'Схвалити' },
    FAIL: { cs: 'Zamítnout', en: 'Fail', ua: 'Відхилити' },
    HOLD: { cs: 'Pozastavit', en: 'Hold', ua: 'Утримати' },
    QUARANTINE: { cs: 'Karanténa', en: 'Quarantine', ua: 'Карантин' },
    RELEASE: { cs: 'Uvolnit', en: 'Release', ua: 'Випустити' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

const czech = {
  eyebrow: 'vratky · kontrola · karanténa',
  title: 'Kvalita a vratky',
  refresh: 'Obnovit',
  health: 'Provozní stav',
  returns: 'Vratky',
  inspections: 'Kontroly kvality',
  createReturn: 'Založit vratku',
  returnProcessing: 'Příjem a kontrola vratky',
  createInspection: 'Založit kontrolu',
  completeInspection: 'Uzavřít kontrolu',
  save: 'Uložit',
  select: 'Vybrat',
  receive: 'Přijmout řádek',
  inspect: 'Zkontrolovat řádek',
  complete: 'Uzavřít',
  release: 'Uvolnit karanténu',
  notSet: 'Nenastaveno',
  emptyReturnsTitle: 'Žádné vratky',
  emptyReturnsText: 'Server nevrátil žádné vratky.',
  emptyInspectionsTitle: 'Žádné kontroly',
  emptyInspectionsText: 'Server nevrátil žádné kontroly kvality.',
  metrics: { openReturns: 'Otevřené vratky', openInspections: 'Otevřené kontroly', returnLines: 'Řádky vratek' },
  columns: { rma: 'RMA', status: 'Stav', customer: 'Zákazník', lines: 'Řádky', action: 'Akce', inspection: 'Kontrola', sample: 'Vzorek', reason: 'Důvod' },
  fields: { rma: 'RMA', sku: 'SKU', quantity: 'Množství', reason: 'Důvod', customer: 'Zákazník', returnId: 'Vratka', lineId: 'Řádek', disposition: 'Výsledek vratky', accepted: 'Přijato OK', rejected: 'Zamítnuto', location: 'Lokace', notes: 'Poznámka', inspection: 'Číslo kontroly', stockQuant: 'Stock quant', sample: 'Vzorek', result: 'Výsledek', quarantineQuant: 'Karanténní quant' },
  actions: { createReturn: 'Založit vratku', receiveLine: 'Přijmout řádek vratky', inspectLine: 'Zkontrolovat řádek vratky', createInspection: 'Založit kontrolu kvality', completeInspection: 'Uzavřít kontrolu kvality', releaseQuarantine: 'Uvolnit karanténu' },
};

const english = {
  eyebrow: 'returns · quality · quarantine',
  title: 'Quality and returns',
  refresh: 'Refresh',
  health: 'Operations health',
  returns: 'Returns',
  inspections: 'Quality inspections',
  createReturn: 'Create return',
  returnProcessing: 'Return receiving and inspection',
  createInspection: 'Create inspection',
  completeInspection: 'Complete inspection',
  save: 'Save',
  select: 'Select',
  receive: 'Receive line',
  inspect: 'Inspect line',
  complete: 'Complete',
  release: 'Release quarantine',
  notSet: 'Not set',
  emptyReturnsTitle: 'No returns',
  emptyReturnsText: 'The server returned no returns.',
  emptyInspectionsTitle: 'No inspections',
  emptyInspectionsText: 'The server returned no quality inspections.',
  metrics: { openReturns: 'Open returns', openInspections: 'Open inspections', returnLines: 'Return lines' },
  columns: { rma: 'RMA', status: 'Status', customer: 'Customer', lines: 'Lines', action: 'Action', inspection: 'Inspection', sample: 'Sample', reason: 'Reason' },
  fields: { rma: 'RMA', sku: 'SKU', quantity: 'Quantity', reason: 'Reason', customer: 'Customer', returnId: 'Return', lineId: 'Line', disposition: 'Return result', accepted: 'Accepted', rejected: 'Rejected', location: 'Location', notes: 'Notes', inspection: 'Inspection number', stockQuant: 'Stock quant', sample: 'Sample', result: 'Result', quarantineQuant: 'Quarantine quant' },
  actions: { createReturn: 'Create return', receiveLine: 'Receive return line', inspectLine: 'Inspect return line', createInspection: 'Create quality inspection', completeInspection: 'Complete quality inspection', releaseQuarantine: 'Release quarantine' },
};

const ukrainian = {
  eyebrow: 'повернення · якість · карантин',
  title: 'Якість і повернення',
  refresh: 'Оновити',
  health: 'Стан операцій',
  returns: 'Повернення',
  inspections: 'Контроль якості',
  createReturn: 'Створити повернення',
  returnProcessing: 'Приймання та контроль повернення',
  createInspection: 'Створити контроль',
  completeInspection: 'Завершити контроль',
  save: 'Зберегти',
  select: 'Вибрати',
  receive: 'Прийняти рядок',
  inspect: 'Перевірити рядок',
  complete: 'Завершити',
  release: 'Випустити з карантину',
  notSet: 'Не налаштовано',
  emptyReturnsTitle: 'Немає повернень',
  emptyReturnsText: 'Сервер не повернув повернень.',
  emptyInspectionsTitle: 'Немає контролів',
  emptyInspectionsText: 'Сервер не повернув контролів якості.',
  metrics: { openReturns: 'Відкриті повернення', openInspections: 'Відкриті контролі', returnLines: 'Рядки повернень' },
  columns: { rma: 'RMA', status: 'Стан', customer: 'Клієнт', lines: 'Рядки', action: 'Дія', inspection: 'Контроль', sample: 'Зразок', reason: 'Причина' },
  fields: { rma: 'RMA', sku: 'SKU', quantity: 'Кількість', reason: 'Причина', customer: 'Клієнт', returnId: 'Повернення', lineId: 'Рядок', disposition: 'Результат повернення', accepted: 'Прийнято', rejected: 'Відхилено', location: 'Локація', notes: 'Нотатки', inspection: 'Номер контролю', stockQuant: 'Stock quant', sample: 'Зразок', result: 'Результат', quarantineQuant: 'Карантинний quant' },
  actions: { createReturn: 'Створити повернення', receiveLine: 'Прийняти рядок повернення', inspectLine: 'Перевірити рядок повернення', createInspection: 'Створити контроль якості', completeInspection: 'Завершити контроль якості', releaseQuarantine: 'Випустити з карантину' },
};
