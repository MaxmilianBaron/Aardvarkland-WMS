import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { FormEvent, useMemo, useState } from 'react';
import { BarcodePreview } from '../../components/scanning/BarcodePreview';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { ResourceFreshness } from '../../components/ui/ResourceFreshness';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import {
  cancelRuntimePrintJob,
  createRuntimePrintJob,
  createScanner,
  getPrintStations,
  listScanners,
  reassignRuntimePrintJob,
  renderLabelPreview,
  reprintRuntimePrintJob,
  retryRuntimePrintJob,
  updateScanner,
  upsertPrintAgent,
  upsertPrinter,
} from '../../core/api/wms';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface PrinterRow {
  id: string;
  code: string;
  name: string;
  protocol: string;
  host: string | null;
  port: number | null;
  windowsPrinterName: string | null;
  dpi: number;
  labelWidthMm: number;
  labelHeightMm: number;
  status: string;
  defaultTemplateCode: string | null;
}

interface AgentRow {
  id: string;
  code: string;
  name: string;
  status: string;
  version: string | null;
  hostname: string | null;
  printerCodes: string[];
  lastSeenAt: string | null;
}

interface ScannerRow {
  id: string;
  code: string;
  name: string;
  status: string;
  assignedZone: string | null;
  lastSeenAt: string | null;
  lastActivityAt: string | null;
  batteryLevel: number | null;
  signalStrength: number | null;
  assignedWorkerId: string | null;
}

interface JobRow {
  id: string;
  printerCode: string | null;
  agentCode: string | null;
  templateCode: string | null;
  status: string;
  copies: number;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: string;
}

interface PrintConsole {
  printers: PrinterRow[];
  queue: JobRow[];
  agents: AgentRow[];
  templates: string[];
}

interface PreviewResult {
  zpl: string;
  warnings: string[];
}

const emptyPrintConsole: PrintConsole = { printers: [], queue: [], agents: [], templates: [] };
const emptyScanners: ScannerRow[] = [];

const defaultLayout = {
  widthMm: 100,
  heightMm: 150,
  dpi: 203,
  fields: [
    { type: 'text', x: 6, y: 7, width: 88, height: 10, binding: 'title', fontSize: 7 },
    { type: 'qr', x: 6, y: 23, width: 34, height: 34, binding: 'code', moduleSize: 6 },
    { type: 'code128', x: 6, y: 65, width: 88, height: 18, binding: 'code' },
    { type: 'text', x: 6, y: 88, width: 88, height: 8, binding: 'subtitle', fontSize: 5 },
  ],
};

export function PrintStationsPage() {
  const { warehouseId, language, roleProfile, can } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const mutation = useApiMutation();
  const resource = useApiResource<PrintConsole>({
    fallback: emptyPrintConsole,
    productionFallback: emptyPrintConsole,
    loader: () => getPrintStations<unknown>(warehouseId),
    map: mapPrintConsole,
    dependencies: [warehouseId],
    refreshIntervalMs: 20000,
    refreshOnRealtime: true,
    staleAfterMs: 60000,
  });
  const [printerForm, setPrinterForm] = useState({ code: '', name: '', protocol: 'TCP_9100', host: '', port: '9100', windowsPrinterName: '' });
  const [agentForm, setAgentForm] = useState({ code: '', name: '', token: '', printerCodes: '' });
  const [scannerForm, setScannerForm] = useState({ code: '', name: '', status: 'ACTIVE', assignedZone: '', assignedWorkerId: '', batteryLevel: '', signalStrength: '' });
  const [labelForm, setLabelForm] = useState({ templateReference: '', printerCode: '', code: '', title: '', subtitle: '' });
  const [queueFilter, setQueueFilter] = useState({ status: 'ACTIVE', printerCode: '' });
  const [jobActionForm, setJobActionForm] = useState({ printerCode: '', agentCode: '', copies: '1' });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const canAdministerPrint = roleProfile.id === 'WMS_ADMIN';
  const canViewPrintOperations = roleProfile.id !== 'WAREHOUSE_WORKER';
  const canOperatePrintJobs = can('label.queue.manage') && roleProfile.id !== 'WAREHOUSE_WORKER';
  const canViewScanners = can('scanner.read') && roleProfile.id !== 'WAREHOUSE_WORKER';
  const canAdministerScanners = can('scanner.manage') && roleProfile.id !== 'WAREHOUSE_WORKER';
  const scannerResource = useApiResource<ScannerRow[]>({
    fallback: emptyScanners,
    productionFallback: emptyScanners,
    enabled: canViewScanners,
    loader: () => listScanners<unknown[]>(warehouseId),
    map: mapScanners,
    dependencies: [warehouseId, canViewScanners],
    refreshIntervalMs: 20000,
    refreshOnRealtime: true,
    staleAfterMs: 60000,
  });

  const printerColumns: Column<PrinterRow>[] = [
    { key: 'code', label: text.columns.code, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', label: text.columns.name, render: (row) => row.name },
    { key: 'connection', label: text.columns.connection, render: (row) => formatConnection(row, text.notSet) },
    { key: 'label', label: text.columns.label, render: (row) => `${row.labelWidthMm} x ${row.labelHeightMm} mm / ${row.dpi} DPI` },
  ];
  const visibleQueue = useMemo(() => {
    const activeStatuses = new Set(['QUEUED', 'CLAIMED', 'PRINTING', 'FAILED']);
    return resource.data.queue.filter((job) => {
      const statusMatches = queueFilter.status === 'ALL'
        || (queueFilter.status === 'ACTIVE' ? activeStatuses.has(job.status) : job.status === queueFilter.status);
      const printerMatches = !queueFilter.printerCode || job.printerCode === queueFilter.printerCode;
      return statusMatches && printerMatches;
    });
  }, [queueFilter.printerCode, queueFilter.status, resource.data.queue]);
  const offlineAgents = resource.data.agents.filter((agent) => agent.status !== 'ONLINE').length;
  const failedJobs = resource.data.queue.filter((job) => job.status === 'FAILED').length;
  const lowBatteryScanners = scannerResource.data.filter((scanner) => typeof scanner.batteryLevel === 'number' && scanner.batteryLevel <= 20).length;
  const weakSignalScanners = scannerResource.data.filter((scanner) => typeof scanner.signalStrength === 'number' && scanner.signalStrength <= 30).length;
  const staleScanners = scannerResource.data.filter((scanner) => isStaleScanner(scanner.lastActivityAt ?? scanner.lastSeenAt)).length;
  const queueColumns: Column<JobRow>[] = [
    { key: 'created', label: text.columns.created, render: (row) => formatDate(row.createdAt) },
    { key: 'printer', label: text.columns.printer, render: (row) => row.printerCode || text.notSet },
    { key: 'status', label: text.columns.status, render: (row) => jobStatusLabel(row.status, language) },
    { key: 'attempts', label: text.columns.attempts, align: 'right', render: (row) => `${row.attempts}/${row.maxAttempts}` },
    { key: 'error', label: text.columns.error, render: (row) => row.errorMessage || text.none },
    {
      key: 'actions',
      label: text.columns.action,
      align: 'right',
      render: (row) => canOperatePrintJobs ? (
        <div className="inline-actions">
          <Button size="sm" type="button" onClick={() => retryJob(row)} disabled={mutation.status === 'running' || row.status === 'PRINTED'}>{text.actions.retryJob}</Button>
          <Button size="sm" type="button" onClick={() => reassignJob(row)} disabled={mutation.status === 'running' || row.status === 'PRINTED'}>{text.actions.reassignJob}</Button>
          <Button size="sm" type="button" onClick={() => reprintJob(row)} disabled={mutation.status === 'running'}>{text.actions.reprintJob}</Button>
          <Button size="sm" type="button" onClick={() => cancelJob(row)} disabled={mutation.status === 'running' || row.status === 'PRINTED' || row.status === 'CANCELLED'}>{text.actions.cancelJob}</Button>
        </div>
      ) : text.notSet,
    },
  ];
  const agentColumns: Column<AgentRow>[] = [
    { key: 'code', label: text.columns.code, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', label: text.columns.name, render: (row) => row.name },
    { key: 'agentPrinters', label: text.columns.agentPrinters, render: (row) => row.printerCodes.length ? row.printerCodes.join(', ') : text.allPrinters },
    { key: 'status', label: text.columns.status, render: (row) => agentStatusLabel(row.status, language) },
  ];
  const scannerColumns: Column<ScannerRow>[] = [
    { key: 'code', label: text.columns.code, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', label: text.columns.name, render: (row) => row.name },
    { key: 'status', label: text.columns.status, render: (row) => scannerStatusLabel(row.status, language) },
    { key: 'zone', label: text.columns.zone, render: (row) => row.assignedZone || text.notSet },
    { key: 'health', label: text.columns.health, render: (row) => `${formatPercent(row.batteryLevel, text.notSet)} / ${formatPercent(row.signalStrength, text.notSet)}` },
    { key: 'worker', label: text.columns.worker, render: (row) => row.assignedWorkerId || text.notSet },
    { key: 'lastSeen', label: text.columns.lastSeen, render: (row) => formatDate(row.lastActivityAt ?? row.lastSeenAt ?? '') || text.notSet },
    {
      key: 'action',
      label: text.columns.action,
      align: 'right',
      render: (row) => canAdministerScanners ? (
        <Button size="sm" type="button" onClick={() => setScannerStatus(row, row.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE')} disabled={mutation.status === 'running'}>
          {row.status === 'ACTIVE' ? text.actions.pauseScanner : text.actions.activateScanner}
        </Button>
      ) : text.notSet,
    },
  ];

  const payload = useMemo(() => ({
    code: labelForm.code.trim(),
    title: labelForm.title.trim(),
    subtitle: labelForm.subtitle.trim(),
  }), [labelForm.code, labelForm.title, labelForm.subtitle]);
  const hasPreviewInput = Boolean(payload.code || payload.title || payload.subtitle);
  const localPreview = useMemo(() => buildLocalPreview(payload), [payload]);
  const visiblePreview = preview ?? (hasPreviewInput ? localPreview : null);
  const canEnqueueLabel = can('label.print') && Boolean(labelForm.printerCode.trim() && payload.code);
  const updateLabelForm = (patch: Partial<typeof labelForm>) => {
    setPreview(null);
    setLabelForm((form) => ({ ...form, ...patch }));
  };

  const savePrinter = async (event: FormEvent) => {
    event.preventDefault();
    const result = await mutation.run(text.actions.savePrinter, () => upsertPrinter(warehouseId, {
      code: printerForm.code,
      name: printerForm.name,
      protocol: printerForm.protocol,
      host: printerForm.host || undefined,
      port: Number(printerForm.port) || 9100,
      windowsPrinterName: printerForm.windowsPrinterName || undefined,
    }));
    if (result) {
      const savedPrinterCode = printerForm.code.trim().toUpperCase();
      setPrinterForm({ code: '', name: '', protocol: 'TCP_9100', host: '', port: '9100', windowsPrinterName: '' });
      if (savedPrinterCode && !labelForm.printerCode.trim()) {
        setLabelForm((form) => ({ ...form, printerCode: savedPrinterCode }));
      }
      resource.refresh();
    }
  };

  const saveAgent = async (event: FormEvent) => {
    event.preventDefault();
    const result = await mutation.run(text.actions.saveAgent, () => upsertPrintAgent(warehouseId, {
      code: agentForm.code,
      name: agentForm.name,
      token: agentForm.token,
      printerCodes: parsePrinterCodes(agentForm.printerCodes),
    }));
    if (result) {
      setAgentForm({ code: '', name: '', token: '', printerCodes: '' });
      resource.refresh();
    }
  };

  const generateAgentToken = () => {
    setAgentForm((form) => ({ ...form, token: generateToken() }));
  };

  const saveScanner = async (event: FormEvent) => {
    event.preventDefault();
    const result = await mutation.run(text.actions.saveScanner, () => createScanner(warehouseId, {
      code: scannerForm.code,
      name: scannerForm.name,
      status: scannerForm.status,
      assignedZone: scannerForm.assignedZone || undefined,
      assignedWorkerId: scannerForm.assignedWorkerId || undefined,
      batteryLevel: parsePercentInput(scannerForm.batteryLevel),
      signalStrength: parsePercentInput(scannerForm.signalStrength),
      metadata: { source: 'storage-ui' },
    }));
    if (result) {
      setScannerForm({ code: '', name: '', status: 'ACTIVE', assignedZone: '', assignedWorkerId: '', batteryLevel: '', signalStrength: '' });
      scannerResource.refresh();
    }
  };

  async function setScannerStatus(scanner: ScannerRow, status: string) {
    const result = await mutation.run(text.actions.updateScanner, () => updateScanner(warehouseId, scanner.id || scanner.code, {
      status,
      assignedZone: scanner.assignedZone,
      assignedWorkerId: scanner.assignedWorkerId,
      batteryLevel: scanner.batteryLevel,
      signalStrength: scanner.signalStrength,
      metadata: { source: 'storage-ui' },
    }));
    if (result) {
      scannerResource.refresh();
    }
  }

  const buildPreview = async (event: FormEvent) => {
    event.preventDefault();
    setPreview(localPreview);
    const result = await mutation.run(text.actions.preview, () => renderLabelPreview<PreviewResult>(warehouseId, labelForm.templateReference || 'CUSTOM', {
      layout: defaultLayout,
      payload,
    }));
    if (result) {
      setPreview(result);
    } else {
      setPreview((current) => current ?? localPreview);
    }
  };

  const enqueueLabel = async () => {
    if (!canEnqueueLabel) return;
    const result = await mutation.run(text.actions.enqueue, () => createRuntimePrintJob(warehouseId, {
      printerCode: labelForm.printerCode || undefined,
      templateCode: labelForm.templateReference || undefined,
      layout: defaultLayout,
      payload,
    }));
    if (result) {
      resource.refresh();
    }
  };

  async function retryJob(job: JobRow) {
    const result = await mutation.run(text.actions.retryJob, () => retryRuntimePrintJob(warehouseId, job.id, buildJobActionPayload(job)));
    if (result) resource.refresh();
  }

  async function cancelJob(job: JobRow) {
    const result = await mutation.run(text.actions.cancelJob, () => cancelRuntimePrintJob(warehouseId, job.id, { metadata: { reason: 'Cancelled from print console' } }));
    if (result) resource.refresh();
  }

  async function reassignJob(job: JobRow) {
    const payload = buildJobActionPayload(job);
    const result = await mutation.run(text.actions.reassignJob, () => reassignRuntimePrintJob(warehouseId, job.id, payload));
    if (result) resource.refresh();
  }

  async function reprintJob(job: JobRow) {
    const result = await mutation.run(text.actions.reprintJob, () => reprintRuntimePrintJob(warehouseId, job.id, buildJobActionPayload(job)));
    if (result) resource.refresh();
  }

  function buildJobActionPayload(job: JobRow) {
    const copies = Number(jobActionForm.copies) || job.copies || 1;
    return {
      printerCode: jobActionForm.printerCode || job.printerCode || undefined,
      agentCode: jobActionForm.agentCode || undefined,
      copies,
      metadata: { source: 'print-console', previousPrinterCode: job.printerCode },
    };
  }

  return (
    <div className="page-grid print-console-page">
      <section className="wms-page-intro span-12">
        <div>
          <h2>{text.title}</h2>
        </div>
        <div className="button-row">
          <ResourceFreshness status={resource.status} refreshedAt={resource.refreshedAt} ageSeconds={resource.ageSeconds} stale={resource.stale} />
          <Button size="sm" type="button" data-e2e-action="print-refresh" onClick={resource.refresh} disabled={resource.status === 'loading'}>{text.refresh}</Button>
        </div>
      </section>

      {resource.status === 'error' && (
        <div className="inline-banner inline-banner--warning span-12" role="alert">
          <span>{text.loadError}</span>
        </div>
      )}

      {mutation.status === 'error' && mutation.message && (
        <div className="inline-banner inline-banner--warning span-12" role="alert">
          <span>{mutation.message}</span>
        </div>
      )}

      {canViewPrintOperations && (
        <Card title={text.healthTitle} className="span-12">
          <div className="metric-stack metric-stack--inline">
            <article><span>{text.metrics.printers}</span><strong>{resource.data.printers.length}</strong></article>
            <article><span>{text.metrics.agents}</span><strong>{resource.data.agents.length}</strong></article>
            <article><span>{text.metrics.offlineAgents}</span><strong>{offlineAgents}</strong></article>
            <article><span>{text.metrics.failedJobs}</span><strong>{failedJobs}</strong></article>
          </div>
        </Card>
      )}

      {canViewPrintOperations && (
        <Card title={text.printers} className="span-12">
          <DataTable rows={resource.data.printers} columns={printerColumns} getRowKey={(row) => row.id || row.code} emptyTitle={text.emptyPrintersTitle} emptyText={text.emptyPrintersText} />
        </Card>
      )}

      {canViewPrintOperations && (
        <Card
          title={text.queue}
          className="span-12"
          action={(
            <div className="button-row">
              <ResourceFreshness status={resource.status} refreshedAt={resource.refreshedAt} ageSeconds={resource.ageSeconds} stale={resource.stale} />
              <span className="muted-copy">{visibleQueue.length} / {resource.data.queue.length}</span>
            </div>
          )}
        >
          <div className="filter-row">
            <label>{text.fields.status}
              <select value={queueFilter.status} onChange={(event) => setQueueFilter((filter) => ({ ...filter, status: event.target.value }))}>
                <option value="ACTIVE">{text.filters.active}</option>
                <option value="ALL">{text.filters.all}</option>
                <option value="QUEUED">{jobStatusLabel('QUEUED', language)}</option>
                <option value="CLAIMED">{jobStatusLabel('CLAIMED', language)}</option>
                <option value="PRINTING">{jobStatusLabel('PRINTING', language)}</option>
                <option value="FAILED">{jobStatusLabel('FAILED', language)}</option>
                <option value="PRINTED">{jobStatusLabel('PRINTED', language)}</option>
                <option value="CANCELLED">{jobStatusLabel('CANCELLED', language)}</option>
              </select>
            </label>
            <label>{text.fields.printer}
              <select value={queueFilter.printerCode} onChange={(event) => setQueueFilter((filter) => ({ ...filter, printerCode: event.target.value }))}>
                <option value="">{text.filters.allPrinters}</option>
                {resource.data.printers.map((printer) => <option key={printer.id || printer.code} value={printer.code}>{printer.code}</option>)}
              </select>
            </label>
            {canOperatePrintJobs && (
              <>
                <label>{text.fields.targetPrinter}
                  <select value={jobActionForm.printerCode} onChange={(event) => setJobActionForm((form) => ({ ...form, printerCode: event.target.value }))}>
                    <option value="">{text.fields.keepPrinter}</option>
                    {resource.data.printers.map((printer) => <option key={printer.id || printer.code} value={printer.code}>{printer.code}</option>)}
                  </select>
                </label>
                <label>{text.fields.targetAgent}<input value={jobActionForm.agentCode} onChange={(event) => setJobActionForm((form) => ({ ...form, agentCode: event.target.value }))} autoComplete="off" /></label>
                <label>{text.fields.copies}<input value={jobActionForm.copies} onChange={(event) => setJobActionForm((form) => ({ ...form, copies: event.target.value }))} inputMode="numeric" /></label>
              </>
            )}
          </div>
          <DataTable rows={visibleQueue} columns={queueColumns} getRowKey={(row) => row.id} emptyTitle={text.emptyQueueTitle} emptyText={text.emptyQueueText} />
        </Card>
      )}

      {canAdministerPrint && (
        <Card title={text.agents} className="span-6">
          <DataTable rows={resource.data.agents} columns={agentColumns} getRowKey={(row) => row.id || row.code} emptyTitle={text.emptyAgentsTitle} emptyText={text.emptyAgentsText} />
        </Card>
      )}

      {canAdministerPrint && (
        <Card title={text.templates} className="span-6">
          <div className="template-list">
            {resource.data.templates.length ? resource.data.templates.map((template) => <span key={template}>{templateLabel(template, language)}</span>) : <p>{text.emptyTemplatesText}</p>}
          </div>
        </Card>
      )}

      {canViewScanners && (
        <Card
          title={text.scannerHealthTitle}
          className="span-12"
          action={<ResourceFreshness status={scannerResource.status} refreshedAt={scannerResource.refreshedAt} ageSeconds={scannerResource.ageSeconds} stale={scannerResource.stale} />}
        >
          <div className="metric-stack metric-stack--inline">
            <article><span>{text.metrics.scanners}</span><strong>{scannerResource.data.length}</strong></article>
            <article><span>{text.metrics.lowBattery}</span><strong>{lowBatteryScanners}</strong></article>
            <article><span>{text.metrics.weakSignal}</span><strong>{weakSignalScanners}</strong></article>
            <article><span>{text.metrics.staleScanners}</span><strong>{staleScanners}</strong></article>
          </div>
        </Card>
      )}

      {canViewScanners && (
        <Card
          title={text.scanners}
          className="span-12"
          action={<ResourceFreshness status={scannerResource.status} refreshedAt={scannerResource.refreshedAt} ageSeconds={scannerResource.ageSeconds} stale={scannerResource.stale} />}
        >
          <DataTable rows={scannerResource.data} columns={scannerColumns} getRowKey={(row) => row.id || row.code} emptyTitle={text.emptyScannersTitle} emptyText={text.emptyScannersText} />
        </Card>
      )}

      {canAdministerPrint && (
        <Card title={text.addPrinter} className="span-6">
          <form className="stacked-form" onSubmit={savePrinter}>
            <label>{text.fields.code}<input data-testid="print-printer-code" value={printerForm.code} onChange={(event) => setPrinterForm((form) => ({ ...form, code: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.name}<input data-testid="print-printer-name" value={printerForm.name} onChange={(event) => setPrinterForm((form) => ({ ...form, name: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.protocol}
              <select data-testid="print-printer-protocol" value={printerForm.protocol} onChange={(event) => setPrinterForm((form) => ({ ...form, protocol: event.target.value }))}>
                <option value="TCP_9100">TCP 9100</option>
                <option value="WINDOWS_RAW">Windows RAW</option>
              </select>
            </label>
            <label>{text.fields.host}<input data-testid="print-printer-host" value={printerForm.host} onChange={(event) => setPrinterForm((form) => ({ ...form, host: event.target.value }))} autoComplete="off" /></label>
            <label>{text.fields.port}<input data-testid="print-printer-port" value={printerForm.port} onChange={(event) => setPrinterForm((form) => ({ ...form, port: event.target.value }))} inputMode="numeric" /></label>
            <label>{text.fields.windowsName}<input data-testid="print-printer-windows-name" value={printerForm.windowsPrinterName} onChange={(event) => setPrinterForm((form) => ({ ...form, windowsPrinterName: event.target.value }))} autoComplete="off" /></label>
            <Button tone="primary" type="submit" data-e2e-action="print-save-printer" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>
      )}

      {canAdministerPrint && (
        <Card title={text.addAgent} className="span-6">
          <form className="stacked-form" onSubmit={saveAgent}>
            <label>{text.fields.code}<input data-testid="print-agent-code" value={agentForm.code} onChange={(event) => setAgentForm((form) => ({ ...form, code: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.name}<input data-testid="print-agent-name" value={agentForm.name} onChange={(event) => setAgentForm((form) => ({ ...form, name: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.token}<input data-testid="print-agent-token" type="password" value={agentForm.token} onChange={(event) => setAgentForm((form) => ({ ...form, token: event.target.value }))} autoComplete="new-password" minLength={32} required /></label>
            <label>{text.fields.agentPrinters}<input data-testid="print-agent-printers" value={agentForm.printerCodes} onChange={(event) => setAgentForm((form) => ({ ...form, printerCodes: event.target.value }))} autoComplete="off" placeholder="PACK-01, SHIP-01" /></label>
            <div className="form-actions">
              <Button type="button" data-e2e-action="print-generate-agent-token" onClick={generateAgentToken}>{text.generateToken}</Button>
              <Button tone="primary" type="submit" data-e2e-action="print-save-agent" disabled={mutation.status === 'running' || agentForm.token.length < 32}>{text.save}</Button>
            </div>
          </form>
        </Card>
      )}

      {canAdministerScanners && (
        <Card title={text.addScanner} className="span-6">
          <form className="stacked-form" onSubmit={saveScanner}>
            <label>{text.fields.code}<input data-testid="scanner-code" value={scannerForm.code} onChange={(event) => setScannerForm((form) => ({ ...form, code: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.name}<input data-testid="scanner-name" value={scannerForm.name} onChange={(event) => setScannerForm((form) => ({ ...form, name: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.status}
              <select data-testid="scanner-status" value={scannerForm.status} onChange={(event) => setScannerForm((form) => ({ ...form, status: event.target.value }))}>
                <option value="ACTIVE">{scannerStatusLabel('ACTIVE', language)}</option>
                <option value="INACTIVE">{scannerStatusLabel('INACTIVE', language)}</option>
                <option value="MAINTENANCE">{scannerStatusLabel('MAINTENANCE', language)}</option>
              </select>
            </label>
            <label>{text.fields.zone}<input data-testid="scanner-zone" value={scannerForm.assignedZone} onChange={(event) => setScannerForm((form) => ({ ...form, assignedZone: event.target.value }))} autoComplete="off" /></label>
            <label>{text.fields.worker}<input data-testid="scanner-worker" value={scannerForm.assignedWorkerId} onChange={(event) => setScannerForm((form) => ({ ...form, assignedWorkerId: event.target.value }))} autoComplete="off" /></label>
            <label>{text.fields.battery}<input data-testid="scanner-battery" value={scannerForm.batteryLevel} onChange={(event) => setScannerForm((form) => ({ ...form, batteryLevel: event.target.value.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" /></label>
            <label>{text.fields.signal}<input data-testid="scanner-signal" value={scannerForm.signalStrength} onChange={(event) => setScannerForm((form) => ({ ...form, signalStrength: event.target.value.replace(/\D/g, '').slice(0, 3) }))} inputMode="numeric" /></label>
            <Button tone="primary" type="submit" data-e2e-action="scanner-save" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>
      )}

      <Card title={canAdministerPrint ? text.editor : text.operationalLabel} className="span-6">
        <form className="stacked-form" onSubmit={buildPreview}>
          {canAdministerPrint && <label>{text.fields.template}<input data-testid="print-label-template" value={labelForm.templateReference} onChange={(event) => updateLabelForm({ templateReference: event.target.value })} autoComplete="off" /></label>}
          <label>{text.fields.printer}
            <select data-testid="print-label-printer" value={labelForm.printerCode} onChange={(event) => updateLabelForm({ printerCode: event.target.value })}>
              <option value="">{resource.data.printers.length ? text.fields.selectPrinter : text.fields.noPrinter}</option>
              {resource.data.printers.map((printer) => (
                <option key={printer.id || printer.code} value={printer.code}>{printer.name ? `${printer.code} - ${printer.name}` : printer.code}</option>
              ))}
            </select>
          </label>
          <label>{text.fields.labelCode}<input data-testid="print-label-code" value={labelForm.code} onChange={(event) => updateLabelForm({ code: event.target.value })} autoComplete="off" /></label>
          <label>{text.fields.title}<input data-testid="print-label-title" value={labelForm.title} onChange={(event) => updateLabelForm({ title: event.target.value })} autoComplete="off" /></label>
          <label>{text.fields.subtitle}<input data-testid="print-label-subtitle" value={labelForm.subtitle} onChange={(event) => updateLabelForm({ subtitle: event.target.value })} autoComplete="off" /></label>
          <div className="form-actions">
            <Button tone="primary" type="submit" data-e2e-action="print-label-preview" disabled={mutation.status === 'running'}>{text.preview}</Button>
            <Button type="button" data-e2e-action="print-label-enqueue" onClick={enqueueLabel} disabled={mutation.status === 'running' || !canEnqueueLabel}>{text.enqueue}</Button>
          </div>
        </form>
      </Card>

      <Card title={text.previewTitle} className="span-6">
        {visiblePreview ? (
          <div className="print-label-preview">
            <div className="barcode-preview-grid">
              <BarcodePreview type="qr" value={payload.code} label="QR" emptyText={text.emptyBarcode} errorText={text.barcodeError} />
              <BarcodePreview type="code128" value={payload.code} label="Code 128" emptyText={text.emptyBarcode} errorText={text.barcodeError} />
              <BarcodePreview type="datamatrix" value={payload.code} label="DataMatrix" emptyText={text.emptyBarcode} errorText={text.barcodeError} />
            </div>
          </div>
        ) : <p className="muted-copy">{text.emptyPreview}</p>}
      </Card>
    </div>
  );
}

function mapPrintConsole(payload: unknown): PrintConsole {
  const row = record(payload);
  return {
    printers: array(row['printers'] ?? row['stations']).map(mapPrinter).filter((printer) => printer.code),
    queue: array(row['queue']).map(mapJob).filter((job) => job.id),
    agents: array(row['agents']).map(mapAgent).filter((agent) => agent.code),
    templates: array(row['templates']).map((value) => stringValue(value, '')).filter(Boolean),
  };
}

function mapScanners(payload: unknown): ScannerRow[] {
  const rows = Array.isArray(payload) ? payload : array(record(payload)['data']);
  return rows.map((value) => {
    const row = record(value);
    const metadata = record(row['metadata']);
    return {
      id: stringValue(row['id'], stringValue(row['code'], '')),
      code: stringValue(row['code'], ''),
      name: stringValue(row['name'], ''),
      status: stringValue(row['status'], 'INACTIVE'),
      assignedZone: nullableString(row['assignedZone']),
      lastSeenAt: nullableString(row['lastSeenAt']),
      lastActivityAt: nullableString(row['lastActivityAt'] ?? metadata['lastActivityAt']),
      batteryLevel: numberValue(row['batteryLevel'] ?? metadata['batteryLevel']),
      signalStrength: numberValue(row['signalStrength'] ?? metadata['signalStrength']),
      assignedWorkerId: nullableString(row['assignedWorkerId'] ?? metadata['assignedWorkerId']),
    };
  }).filter((scanner) => scanner.code);
}

function mapPrinter(value: unknown): PrinterRow {
  const row = record(value);
  return {
    id: stringValue(row['id'], stringValue(row['code'], '')),
    code: stringValue(row['code'], ''),
    name: stringValue(row['name'], ''),
    protocol: stringValue(row['protocol'] ?? row['mode'], ''),
    host: nullableString(row['host']),
    port: numberValue(row['port']),
    windowsPrinterName: nullableString(row['windowsPrinterName']),
    dpi: numberValue(row['dpi']) ?? 203,
    labelWidthMm: numberValue(row['labelWidthMm']) ?? 100,
    labelHeightMm: numberValue(row['labelHeightMm']) ?? 150,
    status: stringValue(row['status'], ''),
    defaultTemplateCode: nullableString(row['defaultTemplateCode'] ?? row['defaultTemplate']),
  };
}

function mapAgent(value: unknown): AgentRow {
  const row = record(value);
  return {
    id: stringValue(row['id'], stringValue(row['code'], '')),
    code: stringValue(row['code'], ''),
    name: stringValue(row['name'], ''),
    status: stringValue(row['status'], ''),
    version: nullableString(row['version']),
    hostname: nullableString(row['hostname']),
    printerCodes: readPrinterCodes(row),
    lastSeenAt: nullableString(row['lastSeenAt']),
  };
}

function mapJob(value: unknown): JobRow {
  const row = record(value);
  return {
    id: stringValue(row['id'], ''),
    printerCode: nullableString(row['printerCode']),
    agentCode: nullableString(row['agentCode']),
    templateCode: nullableString(row['templateCode']),
    status: stringValue(row['status'], ''),
    copies: numberValue(row['copies']) ?? 1,
    attempts: numberValue(row['attempts']) ?? 0,
    maxAttempts: numberValue(row['maxAttempts']) ?? 0,
    errorMessage: nullableString(row['errorMessage']),
    createdAt: stringValue(row['createdAt'], ''),
  };
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

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPrinterCodes(row: Record<string, unknown>): string[] {
  const direct = array(row['printerCodes']);
  const metadataCodes = array(record(row['metadata'])['printerCodes']);
  return [...direct, ...metadataCodes]
    .map((value) => typeof value === 'string' ? value.trim().toUpperCase() : '')
    .filter(Boolean)
    .filter((code, index, values) => values.indexOf(code) === index);
}

function parsePrinterCodes(value: string): string[] {
  return value.split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
    .filter((code, index, values) => values.indexOf(code) === index);
}

function formatConnection(row: PrinterRow, fallback: string): string {
  if (row.protocol === 'WINDOWS_RAW') {
    return row.windowsPrinterName || fallback;
  }
  if (row.host) {
    return `${row.host}:${row.port ?? 9100}`;
  }
  return fallback;
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatPercent(value: number | null, fallback: string): string {
  return typeof value === 'number' ? `${value}%` : fallback;
}

function parsePercentInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, parsed));
}

function isStaleScanner(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > 30 * 60 * 1000;
}

function jobStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    QUEUED: { cs: 'Ve frontě', en: 'Queued', ua: 'У черзі' },
    CLAIMED: { cs: 'Převzato agentem', en: 'Claimed', ua: 'Прийнято агентом' },
    PRINTING: { cs: 'Tiskne se', en: 'Printing', ua: 'Друкується' },
    PRINTED: { cs: 'Vytištěno', en: 'Printed', ua: 'Надруковано' },
    FAILED: { cs: 'Chyba tisku', en: 'Failed', ua: 'Помилка друку' },
    CANCELLED: { cs: 'Zrušeno', en: 'Cancelled', ua: 'Скасовано' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function agentStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    ONLINE: { cs: 'Připojený', en: 'Online', ua: 'Онлайн' },
    OFFLINE: { cs: 'Odpojený', en: 'Offline', ua: 'Офлайн' },
    ERROR: { cs: 'Chyba', en: 'Error', ua: 'Помилка' },
    DISABLED: { cs: 'Vypnutý', en: 'Disabled', ua: 'Вимкнено' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function scannerStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    ACTIVE: { cs: 'Aktivní', en: 'Active', ua: 'Активний' },
    INACTIVE: { cs: 'Neaktivní', en: 'Inactive', ua: 'Неактивний' },
    MAINTENANCE: { cs: 'Servis', en: 'Maintenance', ua: 'Обслуговування' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function templateLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    CUSTOM: { cs: 'Vlastní', en: 'Custom', ua: 'Власний' },
    'PARCEL-ZPL-DEFAULT': { cs: 'Výchozí balíkový štítek', en: 'Default parcel label', ua: 'Типова етикетка посилки' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function buildLocalPreview(payload: { code: string; title: string; subtitle: string }): PreviewResult {
  const code = payload.code || 'AARD1:SKU:MAIN:TEST';
  const title = payload.title || code;
  const subtitle = payload.subtitle || '';

  return {
    warnings: [],
    zpl: [
      '^XA',
      '^CI28',
      '^PW799',
      '^LL1199',
      '^PON',
      `^FO48,56^A0N,56,56^FD${zplText(title)}^FS`,
      `^FO48,184^BQN,2,6^FDLA,${zplText(code)}^FS`,
      `^FO48,520^BCN,144,Y,N,N^FD${zplText(code)}^FS`,
      `^FO48,704^A0N,40,40^FD${zplText(subtitle)}^FS`,
      '^XZ',
    ].join('\n'),
  };
}

function zplText(value: string): string {
  return value.replace(/\^|~/g, ' ').replace(/\r?\n/g, ' ');
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const czech = {
  title: 'Tiskárny',
  refresh: 'Obnovit',
  loadError: 'Tiskárny se nepodařilo načíst.',
  healthTitle: 'Provozní stav tisku',
  printers: 'Tiskárny',
  queue: 'Tisková fronta',
  agents: 'Tiskoví agenti',
  scanners: 'Skenery',
  scannerHealthTitle: 'Stav skenerů',
  templates: 'Šablony',
  addPrinter: 'Přidat tiskárnu',
  addAgent: 'Přidat tiskového agenta',
  addScanner: 'Přidat skener',
  editor: 'Editor štítku',
  operationalLabel: 'Tisk provozního štítku',
  previewTitle: 'Náhled štítku',
  preview: 'Vytvořit náhled',
  enqueue: 'Zařadit do fronty',
  generateToken: 'Vygenerovat token',
  save: 'Uložit',
  notSet: 'Nenastaveno',
  none: 'Bez chyby',
  allPrinters: 'Všechny tiskárny',
  emptyPrintersTitle: 'Žádné tiskárny',
  emptyPrintersText: 'Nejsou nastavené žádné skutečné tiskárny.',
  emptyQueueTitle: 'Prázdná fronta',
  emptyQueueText: 'Nečeká žádný tiskový úkol.',
  emptyAgentsTitle: 'Žádní tiskoví agenti',
  emptyAgentsText: 'Není připojený žádný lokální tiskový agent.',
  emptyScannersTitle: 'Žádné skenery',
  emptyScannersText: 'Nejsou nastavené žádné skladové skenery.',
  emptyTemplatesText: 'Žádné aktivní šablony.',
  emptyPreview: 'Vyplňte údaje štítku a vytvořte náhled.',
  emptyBarcode: 'Zadejte kód pro náhled.',
  barcodeError: 'Náhled kódu se nepodařilo vytvořit.',
  metrics: { printers: 'Tiskárny', agents: 'Agenti', offlineAgents: 'Offline agenti', failedJobs: 'Chybné joby', scanners: 'Skenery', lowBattery: 'Nízká baterie', weakSignal: 'Slabý signál', staleScanners: 'Bez aktivity' },
  filters: { active: 'Aktivní', all: 'Vše', allPrinters: 'Všechny tiskárny' },
  columns: {
    code: 'Kód',
    name: 'Název',
    protocol: 'Protokol',
    connection: 'Připojení',
    label: 'Štítek',
    created: 'Vytvořeno',
    printer: 'Tiskárna',
    template: 'Šablona',
    status: 'Stav',
    attempts: 'Pokusy',
    error: 'Chyba',
    host: 'Počítač',
    agentPrinters: 'Tiskárny agenta',
    zone: 'Zóna',
    health: 'Baterie / signál',
    worker: 'Pracovník',
    lastSeen: 'Poslední kontakt',
    action: 'Akce',
  },
  fields: {
    code: 'Kód',
    name: 'Název',
    protocol: 'Protokol',
    host: 'IP adresa',
    port: 'Port',
    windowsName: 'Název tiskárny ve Windows',
    token: 'Token',
    agentPrinters: 'Tiskárny agenta',
    status: 'Stav',
    zone: 'Zóna',
    worker: 'Pracovník',
    battery: 'Baterie %',
    signal: 'Signál %',
    template: 'Šablona',
    printer: 'Tiskárna',
    selectPrinter: 'Vyberte tiskárnu',
    noPrinter: 'Nejdřív přidejte tiskárnu',
    targetPrinter: 'Cílová tiskárna',
    targetAgent: 'Cílový agent',
    keepPrinter: 'Ponechat tiskárnu',
    copies: 'Kopie',
    labelCode: 'Kód na štítku',
    title: 'Nadpis',
    subtitle: 'Doplňkový text',
  },
  actions: {
    savePrinter: 'Uložit tiskárnu',
    saveAgent: 'Uložit tiskového agenta',
    saveScanner: 'Uložit skener',
    updateScanner: 'Upravit skener',
    pauseScanner: 'Servis',
    activateScanner: 'Aktivovat',
    retryJob: 'Retry',
    cancelJob: 'Zrušit',
    reassignJob: 'Přesměrovat',
    reprintJob: 'Dotisk',
    preview: 'Vytvořit náhled štítku',
    enqueue: 'Zařadit tiskový úkol',
  },
};

const english = {
  title: 'Printers',
  refresh: 'Refresh',
  loadError: 'Printers could not be loaded.',
  healthTitle: 'Print operations health',
  printers: 'Printers',
  queue: 'Print queue',
  agents: 'Print agents',
  scanners: 'Scanners',
  scannerHealthTitle: 'Scanner health',
  templates: 'Templates',
  addPrinter: 'Add printer',
  addAgent: 'Add print agent',
  addScanner: 'Add scanner',
  editor: 'Label editor',
  operationalLabel: 'Operational label print',
  previewTitle: 'Label preview',
  preview: 'Create preview',
  enqueue: 'Queue print job',
  generateToken: 'Generate token',
  save: 'Save',
  notSet: 'Not set',
  none: 'No error',
  allPrinters: 'All printers',
  emptyPrintersTitle: 'No printers',
  emptyPrintersText: 'No real printers have been configured.',
  emptyQueueTitle: 'Empty queue',
  emptyQueueText: 'No print job is waiting.',
  emptyAgentsTitle: 'No print agents',
  emptyAgentsText: 'No local print agent is connected.',
  emptyScannersTitle: 'No scanners',
  emptyScannersText: 'No warehouse scanners have been configured.',
  emptyTemplatesText: 'No active templates.',
  emptyPreview: 'Fill in label data and create a preview.',
  emptyBarcode: 'Enter a code to preview.',
  barcodeError: 'Code preview could not be created.',
  metrics: { printers: 'Printers', agents: 'Agents', offlineAgents: 'Offline agents', failedJobs: 'Failed jobs', scanners: 'Scanners', lowBattery: 'Low battery', weakSignal: 'Weak signal', staleScanners: 'No activity' },
  filters: { active: 'Active', all: 'All', allPrinters: 'All printers' },
  columns: {
    code: 'Code',
    name: 'Name',
    protocol: 'Protocol',
    connection: 'Connection',
    label: 'Label',
    created: 'Created',
    printer: 'Printer',
    template: 'Template',
    status: 'Status',
    attempts: 'Attempts',
    error: 'Error',
    host: 'Computer',
    agentPrinters: 'Agent printers',
    zone: 'Zone',
    health: 'Battery / signal',
    worker: 'Worker',
    lastSeen: 'Last contact',
    action: 'Action',
  },
  fields: {
    code: 'Code',
    name: 'Name',
    protocol: 'Protocol',
    host: 'IP address',
    port: 'Port',
    windowsName: 'Windows printer name',
    token: 'Token',
    agentPrinters: 'Agent printers',
    status: 'Status',
    zone: 'Zone',
    worker: 'Worker',
    battery: 'Battery %',
    signal: 'Signal %',
    template: 'Template',
    printer: 'Printer',
    selectPrinter: 'Select printer',
    noPrinter: 'Add a printer first',
    targetPrinter: 'Target printer',
    targetAgent: 'Target agent',
    keepPrinter: 'Keep printer',
    copies: 'Copies',
    labelCode: 'Label code',
    title: 'Title',
    subtitle: 'Additional text',
  },
  actions: {
    savePrinter: 'Save printer',
    saveAgent: 'Save print agent',
    saveScanner: 'Save scanner',
    updateScanner: 'Update scanner',
    pauseScanner: 'Service',
    activateScanner: 'Activate',
    retryJob: 'Retry',
    cancelJob: 'Cancel',
    reassignJob: 'Reassign',
    reprintJob: 'Reprint',
    preview: 'Create label preview',
    enqueue: 'Queue print job',
  },
};

const ukrainian = {
  title: 'Принтери',
  refresh: 'Оновити',
  loadError: 'Не вдалося завантажити принтери.',
  healthTitle: 'Стан операцій друку',
  printers: 'Принтери',
  queue: 'Черга друку',
  agents: 'Агенти друку',
  scanners: 'Сканери',
  scannerHealthTitle: 'Стан сканерів',
  templates: 'Шаблони',
  addPrinter: 'Додати принтер',
  addAgent: 'Додати агента друку',
  addScanner: 'Додати сканер',
  editor: 'Редактор етикетки',
  operationalLabel: 'Друк робочої етикетки',
  previewTitle: 'Перегляд етикетки',
  preview: 'Створити перегляд',
  enqueue: 'Додати до черги',
  generateToken: 'Згенерувати токен',
  save: 'Зберегти',
  notSet: 'Не налаштовано',
  none: 'Без помилки',
  allPrinters: 'Усі принтери',
  emptyPrintersTitle: 'Немає принтерів',
  emptyPrintersText: 'Не налаштовано жодного реального принтера.',
  emptyQueueTitle: 'Порожня черга',
  emptyQueueText: 'Немає завдань друку в очікуванні.',
  emptyAgentsTitle: 'Немає агентів друку',
  emptyAgentsText: 'Не підключено жодного локального агента друку.',
  emptyScannersTitle: 'Немає сканерів',
  emptyScannersText: 'Не налаштовано жодного складського сканера.',
  emptyTemplatesText: 'Немає активних шаблонів.',
  emptyPreview: 'Заповніть дані етикетки та створіть перегляд.',
  emptyBarcode: 'Введіть код для перегляду.',
  barcodeError: 'Не вдалося створити перегляд коду.',
  metrics: { printers: 'Принтери', agents: 'Агенти', offlineAgents: 'Офлайн агенти', failedJobs: 'Помилки друку', scanners: 'Сканери', lowBattery: 'Низька батарея', weakSignal: 'Слабкий сигнал', staleScanners: 'Без активності' },
  filters: { active: 'Активні', all: 'Усі', allPrinters: 'Усі принтери' },
  columns: {
    code: 'Код',
    name: 'Назва',
    protocol: 'Протокол',
    connection: 'Підключення',
    label: 'Етикетка',
    created: 'Створено',
    printer: 'Принтер',
    template: 'Шаблон',
    status: 'Стан',
    attempts: 'Спроби',
    error: 'Помилка',
    host: 'Комп’ютер',
    agentPrinters: 'Принтери агента',
    zone: 'Зона',
    health: 'Батарея / сигнал',
    worker: 'Працівник',
    lastSeen: 'Останній контакт',
    action: 'Дія',
  },
  fields: {
    code: 'Код',
    name: 'Назва',
    protocol: 'Протокол',
    host: 'IP адреса',
    port: 'Порт',
    windowsName: 'Назва принтера у Windows',
    token: 'Токен',
    agentPrinters: 'Принтери агента',
    status: 'Стан',
    zone: 'Зона',
    worker: 'Працівник',
    battery: 'Батарея %',
    signal: 'Сигнал %',
    template: 'Шаблон',
    printer: 'Принтер',
    selectPrinter: 'Виберіть принтер',
    noPrinter: 'Спочатку додайте принтер',
    targetPrinter: 'Цільовий принтер',
    targetAgent: 'Цільовий агент',
    keepPrinter: 'Залишити принтер',
    copies: 'Копії',
    labelCode: 'Код на етикетці',
    title: 'Заголовок',
    subtitle: 'Додатковий текст',
  },
  actions: {
    savePrinter: 'Зберегти принтер',
    saveAgent: 'Зберегти агента друку',
    saveScanner: 'Зберегти сканер',
    updateScanner: 'Оновити сканер',
    pauseScanner: 'Сервіс',
    activateScanner: 'Активувати',
    retryJob: 'Повторити',
    cancelJob: 'Скасувати',
    reassignJob: 'Перенаправити',
    reprintJob: 'Повторний друк',
    preview: 'Створити перегляд етикетки',
    enqueue: 'Додати завдання друку',
  },
};
