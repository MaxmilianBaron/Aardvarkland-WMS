import { languageLocale, pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { RfScannerInput } from '../../components/scanning/RfScannerInput';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PermissionGate } from '../../components/ui/PermissionGate';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatusPill } from '../../components/ui/StatusPill';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { getRfQueue, listScanners, reportRfTaskException, resolveScan, scanRfSession, startRfTask, syncRfOfflineQueue, updateScannerTelemetry } from '../../core/api/wms';
import { config } from '../../app/config';
import {
  loadRfOfflineQueue,
  saveRfOfflineQueue,
  type StoredRfOfflineScan,
} from '../../core/scanning/rfOfflineQueue';
import { cx } from '../../core/utils/format';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

type ExpectedType = 'LOCATION' | 'SKU' | 'HANDLING_UNIT' | 'QUANTITY' | 'NONE';
type RfExceptionCode = 'SHORT_PICK' | 'WRONG_ITEM' | 'WRONG_LOCATION' | 'DAMAGED_STOCK' | 'MISSING_HU' | 'BARCODE_NOT_RECOGNIZED';
interface RfQueueTask {
  id: string;
  type: string;
  status: string;
  quantity: number | null;
  skuCode: string | null;
  fromLocationCode: string | null;
  toLocationCode: string | null;
  handlingUnitCode: string | null;
  priority: number;
  dueAt: string | Date | null;
  externalReference: string | null;
  assignedUserId: string | null;
  workflow: string;
  suggestedAction: 'START' | 'RESUME' | 'WAIT';
}
interface RfQueueResponse {
  warehouseId: string;
  generatedAt: string | Date;
  tasks: RfQueueTask[];
  offlineQueue: { queued: number; failed: number; syncedToday: number };
}
interface RfInstruction {
  sessionId: string;
  status: string;
  workflow: string;
  task: RfQueueTask | null;
  step: {
    key: string | null;
    sequence: number | null;
    instruction: string;
    expected: { type: ExpectedType; value: string | null; alternatives?: string[] };
    errorCode: string | null;
  };
  nextActions: string[];
  metadata: unknown;
}
type PendingOfflineScan = StoredRfOfflineScan;
interface OfflineSyncResponse {
  synced: number;
  failed: number;
  duplicates: number;
  queued: number;
  items: Array<{ idempotencyKey: string; status: 'QUEUED' | 'SYNCED' | 'FAILED' | 'DUPLICATE'; errorMessage: string | null }>;
}
interface ScanResolveResponse {
  parsed: { kind?: string };
  resolved: {
    found: boolean;
    objectType: string | null;
    code: string | null;
    displayName: string | null;
  };
}
interface RfExceptionReportResponse {
  exceptionId: string;
  taskStatus: string | null;
  releasedReservedQuantity: number;
}
interface ScannerRow {
  id: string;
  code: string;
  name: string;
  status: string;
  assignedZone: string | null;
  batteryLevel: number | null;
  signalStrength: number | null;
  lastActivityAt: string | null;
}
interface RfExceptionAction {
  code: RfExceptionCode;
  label: string;
  description: string;
  taskStatus?: 'BLOCKED' | 'FAILED';
  releaseReservation?: boolean;
}
type RfExceptionCopyKey = 'shortPick' | 'wrongItem' | 'wrongLocation' | 'damaged' | 'missingHu' | 'barcode';
interface RfExceptionCopy {
  exceptionActions: Record<RfExceptionCopyKey, string>;
  exceptionDescriptions: Record<RfExceptionCopyKey, string>;
}

const emptyScanners: ScannerRow[] = [];

const scannerStorageKey = 'wms-rf-scanner-device-reference';

const fallbackQueue: RfQueueResponse = {
  warehouseId: 'MAIN',
  generatedAt: new Date().toISOString(),
  offlineQueue: { queued: 0, failed: 0, syncedToday: 0 },
  tasks: [],
};

function identity<T>(payload: unknown): T { return payload as T; }
function defaultScannerReference(warehouseId: string): string {
  return `RF-${warehouseId}`;
}
function readScannerReference(warehouseId: string): string {
  const fallback = defaultScannerReference(warehouseId);
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(`${scannerStorageKey}:${warehouseId}`) || fallback;
  } catch {
    return fallback;
  }
}
function writeScannerReference(warehouseId: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${scannerStorageKey}:${warehouseId}`, value);
  } catch {}
}
function rfWorkflowLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    PICK: { cs: 'Vychystání', en: 'Picking', ua: 'Відбір' },
    PUTAWAY: { cs: 'Zaskladnění', en: 'Putaway', ua: 'Розміщення' },
    MOVE: { cs: 'Přesun', en: 'Move', ua: 'Переміщення' },
    REPLENISH: { cs: 'Doplnění', en: 'Replenishment', ua: 'Поповнення' },
    COUNT: { cs: 'Inventura', en: 'Cycle count', ua: 'Інвентаризація' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}
function rfStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    OPEN: { cs: 'Otevřeno', en: 'Open', ua: 'Відкрито' },
    WAITING: { cs: 'Čeká', en: 'Waiting', ua: 'Очікує' },
    READY: { cs: 'Připraveno', en: 'Ready', ua: 'Готово' },
    IN_PROGRESS: { cs: 'Probíhá', en: 'In progress', ua: 'Виконується' },
    DONE: { cs: 'Hotovo', en: 'Done', ua: 'Готово' },
    COMPLETED: { cs: 'Dokončeno', en: 'Completed', ua: 'Завершено' },
    BLOCKED: { cs: 'Blokováno', en: 'Blocked', ua: 'Заблоковано' },
    FAILED: { cs: 'Chyba', en: 'Failed', ua: 'Помилка' },
    QUEUED: { cs: 'Ve frontě', en: 'Queued', ua: 'У черзі' },
    SYNCED: { cs: 'Odesláno', en: 'Synced', ua: 'Синхронізовано' },
    DUPLICATE: { cs: 'Duplicita', en: 'Duplicate', ua: 'Дублікат' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}
function scanObjectTypeLabel(value: string | null, language: Language) {
  if (!value) return '';
  const labels: Record<string, BaseTranslations<string>> = {
    SKU: { cs: 'Produkt', en: 'Product', ua: 'Продукт' },
    LOCATION: { cs: 'Lokace', en: 'Location', ua: 'Локація' },
    HANDLING_UNIT: { cs: 'Manipulační jednotka', en: 'Handling unit', ua: 'Вантажна одиниця' },
    PARCEL: { cs: 'Balík', en: 'Parcel', ua: 'Посилка' },
    TASK: { cs: 'Úkol', en: 'Task', ua: 'Завдання' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}
type ExpectedStep = { key: string; label: string; instruction: string; expectedCode: string; helper: string };
function toExpectedSteps(task: RfQueueTask | undefined, language: Language): ExpectedStep[] {
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  if (!task) return [{ key: 'wait', label: text.step.task, instruction: text.noLiveTask, expectedCode: '', helper: text.queueEmpty }];
  return [
    { key: 'task', label: text.step.task, instruction: text.stepInstruction.task, expectedCode: task.id, helper: `${rfWorkflowLabel(task.workflow, language)} · ${rfStatusLabel(task.status, language)}` },
    { key: 'source', label: text.step.source, instruction: text.stepInstruction.source, expectedCode: task.fromLocationCode ?? 'SOURCE', helper: task.fromLocationCode ?? text.sourceMissing },
    { key: 'sku', label: 'SKU', instruction: text.stepInstruction.sku, expectedCode: task.skuCode ?? 'SKU', helper: `${text.quantity} ${task.quantity ?? 1}` },
    { key: 'qty', label: text.step.quantity, instruction: text.stepInstruction.quantity, expectedCode: String(task.quantity ?? 1), helper: text.quantityConfirm },
    { key: 'target', label: text.step.target, instruction: text.stepInstruction.target, expectedCode: task.toLocationCode ?? 'TARGET', helper: task.toLocationCode ?? text.targetMissing },
  ];
}
function getInstructionExpected(instruction: RfInstruction | null, task: RfQueueTask | undefined, stepIndex: number, language: Language): ExpectedStep {
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  if (instruction?.step?.expected?.value) {
      return {
        key: instruction.step.key ?? (instruction.step.expected.type === 'QUANTITY' ? 'qty' : 'scan'),
        label: instruction.step.expected.type === 'QUANTITY' ? text.step.quantity : instruction.step.expected.type,
        instruction: instruction.step.instruction,
        expectedCode: instruction.step.expected.value,
        helper: instruction.step.errorCode ? `${text.error}: ${instruction.step.errorCode}` : rfStatusLabel(instruction.status, language),
      };
  }
  return toExpectedSteps(task, language)[stepIndex] ?? toExpectedSteps(task, language)[0];
}
function badgeTone(value: string) {
  const upper = value.toUpperCase();
  if (upper.includes('DONE') || upper.includes('COMPLETE') || upper.includes('OPEN')) return 'good' as const;
  if (upper.includes('BLOCK') || upper.includes('EXCEPTION') || upper.includes('FAILED')) return 'warning' as const;
  return 'neutral' as const;
}

function mapScanners(payload: unknown): ScannerRow[] {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((value) => {
    const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const code = typeof row['code'] === 'string' ? row['code'] : '';
    return {
      id: typeof row['id'] === 'string' ? row['id'] : code,
      code,
      name: typeof row['name'] === 'string' ? row['name'] : code,
      status: typeof row['status'] === 'string' ? row['status'] : 'INACTIVE',
      assignedZone: typeof row['assignedZone'] === 'string' ? row['assignedZone'] : null,
      batteryLevel: numberValue(row['batteryLevel'] ?? record(row['metadata'])['batteryLevel']),
      signalStrength: numberValue(row['signalStrength'] ?? record(row['metadata'])['signalStrength']),
      lastActivityAt: nullableString(row['lastActivityAt'] ?? row['lastSeenAt']),
    };
  }).filter((scanner) => scanner.code);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function formatPercent(value: number | null, fallback: string): string {
  return typeof value === 'number' ? `${value}%` : fallback;
}

function formatShortDate(value: string | null, language: Language): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(languageLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function uniqueExceptionActions(actions: RfExceptionAction[]) {
  const seen = new Set<RfExceptionCode>();
  return actions.filter((action) => {
    if (seen.has(action.code)) return false;
    seen.add(action.code);
    return true;
  });
}

function getExceptionActions(current: ExpectedStep, selectedTask: RfQueueTask | undefined, text: RfExceptionCopy): RfExceptionAction[] {
  const key = current.key.toUpperCase();
  const label = current.label.toUpperCase();
  const actionText = text.exceptionActions;
  const descriptionText = text.exceptionDescriptions;
  const actions: RfExceptionAction[] = [];
  const isQuantityStep = isQuantityKey(current.key);
  const isLocationStep = key.includes('LOCATION') || key.includes('SOURCE') || key.includes('DESTINATION') || key.includes('TARGET');
  const isItemStep = key.includes('ITEM') || key.includes('SKU') || label.includes('SKU');
  const isHandlingUnitStep = key.includes('HANDLING') || key.includes('HU');

  if (isQuantityStep || selectedTask?.workflow === 'PICK') {
    actions.push({ code: 'SHORT_PICK', label: actionText.shortPick, description: descriptionText.shortPick, taskStatus: 'FAILED', releaseReservation: true });
  }
  if (isLocationStep) {
    actions.push({ code: 'WRONG_LOCATION', label: actionText.wrongLocation, description: descriptionText.wrongLocation, taskStatus: 'BLOCKED' });
  }
  if (isItemStep) {
    actions.push({ code: 'WRONG_ITEM', label: actionText.wrongItem, description: descriptionText.wrongItem, taskStatus: 'BLOCKED' });
  }
  if (isHandlingUnitStep) {
    actions.push({ code: 'MISSING_HU', label: actionText.missingHu, description: descriptionText.missingHu, taskStatus: 'BLOCKED' });
  }
  actions.push(
    { code: 'BARCODE_NOT_RECOGNIZED', label: actionText.barcode, description: descriptionText.barcode, taskStatus: 'BLOCKED' },
    { code: 'DAMAGED_STOCK', label: actionText.damaged, description: descriptionText.damaged, taskStatus: 'BLOCKED' },
  );

  return uniqueExceptionActions(actions).slice(0, 4);
}

function parseQuantityCandidate(value: string, fallback: string, taskQuantity?: number | null) {
  const parsed = Number.parseInt(value.trim() || fallback, 10);
  if (Number.isFinite(parsed)) return parsed;
  return taskQuantity ?? 0;
}

function isQuantityKey(key: string) {
  const upper = key.toUpperCase();
  return upper.includes('QTY') || upper.includes('QUANTITY');
}

export function RfPage() {
  const { warehouseId, roleProfile, language, can, workContext, saveWorkContext, workContextStatus } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const queueResource = useApiResource({
    fallback: fallbackQueue,
    productionFallback: fallbackQueue,
    loader: () => getRfQueue<RfQueueResponse>(warehouseId, { limit: 20 }),
    map: identity<RfQueueResponse>,
    dependencies: [warehouseId],
    refreshOnRealtime: true,
  });
  const scannerResource = useApiResource<ScannerRow[]>({
    fallback: emptyScanners,
    productionFallback: emptyScanners,
    enabled: can('scanner.read'),
    loader: () => listScanners<unknown[]>(warehouseId),
    map: mapScanners,
    dependencies: [warehouseId],
  });
  const mutation = useApiMutation();
  const scanForm = useRef<HTMLFormElement | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [session, setSession] = useState<RfInstruction | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [offline, setOffline] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scannerDeviceReference, setScannerDeviceReference] = useState(() => readScannerReference(warehouseId));
  const [pending, setPending] = useState<PendingOfflineScan[]>([]);
  const [queueLoadedWarehouse, setQueueLoadedWarehouse] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const tasksQueue = queueResource.data.tasks;
  const selectedTask = tasksQueue.find((task) => task.id === selectedTaskId) ?? tasksQueue[0];
  const expectedSteps = useMemo(() => toExpectedSteps(selectedTask, language), [selectedTask, language]);
  const current = getInstructionExpected(session, selectedTask, stepIndex, language);
  const progress = Math.round(((stepIndex + 1) / expectedSteps.length) * 100);
  const offlineStatus = queueResource.data.offlineQueue ?? fallbackQueue.offlineQueue;
  const exceptionActions = useMemo(() => getExceptionActions(current, selectedTask, text), [current, selectedTask, text]);
  const isQuantityStep = isQuantityKey(current.key);
  const quantityCandidate = parseQuantityCandidate(scanValue, current.expectedCode, selectedTask?.quantity);
  const showTestAssist = import.meta.env.DEV || config.enableMocks;
  const activeScanner = scannerResource.data.find((scanner) => scanner.code === scannerDeviceReference);
  const rfDisplayMode = workContext?.rfMode ?? 'DESKTOP';

  useEffect(() => {
    let active = true;
    setQueueLoadedWarehouse(null);
    loadRfOfflineQueue(warehouseId).then((scans) => {
      if (!active) return;
      setPending(scans);
      setQueueLoadedWarehouse(warehouseId);
    });
    return () => {
      active = false;
    };
  }, [warehouseId]);

  useEffect(() => {
    if (queueLoadedWarehouse !== warehouseId) return;
    void saveRfOfflineQueue(warehouseId, pending);
  }, [pending, queueLoadedWarehouse, warehouseId]);

  useEffect(() => {
    setScannerDeviceReference(readScannerReference(warehouseId));
  }, [warehouseId]);

  useEffect(() => {
    const activeScanner = scannerResource.data.find((scanner) => scanner.status === 'ACTIVE');
    const currentReference = scannerDeviceReference.trim();
    if (!activeScanner || (currentReference && currentReference !== defaultScannerReference(warehouseId))) return;
    setScannerDeviceReference(activeScanner.code);
    writeScannerReference(warehouseId, activeScanner.code);
  }, [scannerDeviceReference, scannerResource.data, warehouseId]);

  useEffect(() => {
    if (!workContext?.scannerDeviceReference) return;
    setScannerDeviceReference(workContext.scannerDeviceReference);
    writeScannerReference(warehouseId, workContext.scannerDeviceReference);
  }, [warehouseId, workContext?.scannerDeviceReference]);

  const appendLog = (message: string) => setLog((items) => [`${new Date().toLocaleTimeString()} · ${message}`, ...items].slice(0, 12));
  const updateScannerReference = (value: string) => {
    const next = value.trim().toUpperCase();
    setScannerDeviceReference(next);
    writeScannerReference(warehouseId, next);
  };
  const setRfDisplayMode = async (rfMode: 'DESKTOP' | 'MOBILE' | 'TERMINAL') => {
    await saveWorkContext({
      warehouseId,
      zone: workContext?.zone ?? null,
      shiftCode: workContext?.shiftCode ?? null,
      rfMode,
      scannerDeviceReference: scannerDeviceReference || (workContext?.scannerDeviceReference ?? null),
      metadata: { source: 'rf-page' },
    });
    if (scannerDeviceReference) {
      await updateScannerTelemetry(warehouseId, scannerDeviceReference, {
        deviceMode: rfMode,
        metadata: { source: 'rf-page' },
      }).catch(() => undefined);
      scannerResource.refresh();
    }
  };
  const setQuantityScan = (quantity: number) => {
    setScanValue(String(Math.max(0, Math.round(quantity))));
  };
  const adjustQuantityScan = (delta: number) => {
    setQuantityScan(quantityCandidate + delta);
  };
  const startSession = async () => {
    if (!selectedTask) return undefined;
    const result = await mutation.run(text.actions.startSession, () => startRfTask<RfInstruction>(warehouseId, selectedTask.id, {
      scannerDeviceReference,
      taskReference: selectedTask.id,
      workflow: selectedTask.workflow,
      metadata: { source: 'rf-scanner-ui', role: roleProfile.id, scannerDeviceReference },
    }));
    if (result?.sessionId) {
      setSession(result);
      appendLog(`${text.log.session} ${result.sessionId} · ${selectedTask.id}`);
    }
    return result;
  };
  const submitScan = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTask) return;
    const value = scanValue.trim();
    if (!value) return;
    const expected = current.expectedCode;
    const matched = value.toLowerCase() === String(expected).toLowerCase();
    const resolvedScan = !offline ? await resolveScan<ScanResolveResponse>(warehouseId, {
      scannedValue: value,
      metadata: { source: 'rf-ui', stepKey: current.key, taskReference: selectedTask.id },
    }).catch(() => undefined) : undefined;
    if (resolvedScan?.resolved.found) {
      appendLog(`${text.log.resolved}: ${scanObjectTypeLabel(resolvedScan.resolved.objectType, language)} ${resolvedScan.resolved.code ?? ''}`.trim());
    }

    if (offline) {
      const queued: PendingOfflineScan = {
        idempotencyKey: `rf-${selectedTask.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        warehouseId: warehouseId.trim().toUpperCase(),
        sessionReference: session?.sessionId,
        taskReference: selectedTask.id,
        stepKey: current.key,
        scannedValue: value,
        quantity: isQuantityKey(current.key) ? Number(value) || undefined : undefined,
        recordedAt: new Date().toISOString(),
        metadata: { expected, matched, role: roleProfile.id, offlineUi: true },
      };
      setPending((items) => [queued, ...items].slice(0, 500));
      appendLog(`${current.label}: ${text.log.offlineSaved} · ${value}`);
      if (matched) setStepIndex((index) => Math.min(index + 1, expectedSteps.length - 1));
      setScanValue('');
      return;
    }

    const baseSession = session ?? await startSession();
    if (!baseSession?.sessionId) return;
    const result = await mutation.run(text.actions.confirmScan, () => scanRfSession<RfInstruction>(warehouseId, baseSession.sessionId, {
      scannedValue: value,
      quantity: isQuantityKey(current.key) ? Number(value) || undefined : undefined,
      metadata: { stepKey: current.key, expected, uiMatched: matched, role: roleProfile.id },
    }));
    if (result) {
      setSession(result);
      appendLog(`${current.label}: ${result.step.errorCode ? text.log.mismatch : 'OK'} · ${value}`);
      if (!result.step.errorCode || matched) setStepIndex((index) => Math.min(index + 1, expectedSteps.length - 1));
      setScanValue('');
    }
  };
  const syncPending = async () => {
    if (!pending.length) return;
    const result = await mutation.run(text.actions.syncQueue, () => syncRfOfflineQueue<OfflineSyncResponse>(warehouseId, {
      scannerDeviceReference,
      scans: pending,
      metadata: { source: 'rf-ui', scannerDeviceReference },
    }));
    if (!result) return;
    const keep = new Set(result.items.filter((item) => item.status === 'FAILED' || item.status === 'QUEUED').map((item) => item.idempotencyKey));
    setPending((items) => items.filter((item) => keep.has(item.idempotencyKey)));
    appendLog(`${text.log.sync}: ${result.synced} ${text.log.synced} · ${result.failed} ${text.log.failed} · ${result.duplicates} ${text.log.duplicates}`);
    queueResource.refresh();
  };
  const reportProblem = async (action: RfExceptionAction) => {
    if (!selectedTask) return;
    const shortQuantity = action.code === 'SHORT_PICK' ? Number.parseInt(scanValue.trim(), 10) : NaN;
    const result = await mutation.run(action.label, () => reportRfTaskException<RfExceptionReportResponse>(warehouseId, selectedTask.id, {
      code: action.code,
      title: action.label,
      description: `${action.description} ${text.problemInStep} ${current.key}.`,
      shortQuantity: Number.isFinite(shortQuantity) ? shortQuantity : undefined,
      releaseReservation: action.releaseReservation || undefined,
      taskStatus: action.taskStatus,
      metadata: {
        currentExpected: current.expectedCode,
        scannedValue: scanValue.trim() || null,
        sessionId: session?.sessionId ?? null,
        stepKey: current.key,
        source: 'rf-scanner-ui',
      },
    }));
    if (result) {
      appendLog(`${text.log.exception} ${selectedTask.id} · ${action.label}`);
      queueResource.refresh();
    }
  };

  return (
    <div className="page-grid rf-production-page">
      <div className="span-12"><DataSourceBanner label={text.banner} resource={queueResource} /></div>

      <section className="rf-command-header span-12">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
        </div>
        <div className="rf-command-actions">
          <div className="rf-mode-switch" aria-label={text.rfMode}>
            <Button size="sm" type="button" tone={rfDisplayMode === 'DESKTOP' ? 'primary' : 'secondary'} onClick={() => { void setRfDisplayMode('DESKTOP'); }} disabled={workContextStatus === 'loading'}>{text.rfModes.DESKTOP}</Button>
            <Button size="sm" type="button" tone={rfDisplayMode === 'MOBILE' ? 'primary' : 'secondary'} onClick={() => { void setRfDisplayMode('MOBILE'); }} disabled={workContextStatus === 'loading'}>{text.rfModes.MOBILE}</Button>
            <Button size="sm" type="button" tone={rfDisplayMode === 'TERMINAL' ? 'primary' : 'secondary'} onClick={() => { void setRfDisplayMode('TERMINAL'); }} disabled={workContextStatus === 'loading'}>{text.rfModes.TERMINAL}</Button>
          </div>
          <Button data-e2e-action="rf-toggle-offline" onClick={() => setOffline((value) => !value)} tone={offline ? 'primary' : 'secondary'}>{offline ? text.offlineOn : text.goOffline}</Button>
          <Button data-e2e-action="rf-sync-offline" onClick={syncPending} disabled={!pending.length || mutation.status === 'running'}>{text.sendQueue} ({pending.length})</Button>
        </div>
      </section>

      <Card title={text.scanner} eyebrow={selectedTask ? `${selectedTask.id} · ${rfWorkflowLabel(selectedTask.workflow, language)}` : text.noTask} className="span-7 scanner-card">
        <div className={cx('scanner-terminal', offline && 'is-offline', rfDisplayMode !== 'DESKTOP' && 'is-mobile-mode')}>
          <div className="scanner-terminal__top">
            <Badge tone={offline ? 'warning' : session ? 'good' : 'neutral'}>{offline ? text.offlineQueue : session?.sessionId ?? text.ready}</Badge>
            <span>{selectedTask?.fromLocationCode ?? '—'} → {selectedTask?.toLocationCode ?? '—'}</span>
          </div>
          {activeScanner && (
            <div className="rf-device-health" aria-label={text.deviceHealth}>
              <article><span>{text.battery}</span><strong>{formatPercent(activeScanner.batteryLevel, text.notSet)}</strong></article>
              <article><span>{text.signal}</span><strong>{formatPercent(activeScanner.signalStrength, text.notSet)}</strong></article>
              <article><span>{text.lastActivity}</span><strong>{formatShortDate(activeScanner.lastActivityAt, language) || text.notSet}</strong></article>
            </div>
          )}
          <div className="rf-offline-status" aria-live="polite">
            <article><span>{text.offlineStats.local}</span><strong>{pending.length}</strong></article>
            <article><span>{text.offlineStats.server}</span><strong>{offlineStatus.queued}</strong></article>
            <article><span>{text.offlineStats.failed}</span><strong>{offlineStatus.failed}</strong></article>
            <article><span>{text.offlineStats.syncedToday}</span><strong>{offlineStatus.syncedToday}</strong></article>
          </div>
          <div className="scanner-device-row">
            <label>{text.scannerDevice}
              <input
                list="rf-scanner-devices"
                value={scannerDeviceReference}
                onChange={(event) => updateScannerReference(event.target.value)}
                autoComplete="off"
                data-testid="rf-scanner-device-reference"
              />
            </label>
            <datalist id="rf-scanner-devices">
              {scannerResource.data.map((scanner) => <option key={scanner.id || scanner.code} value={scanner.code}>{scanner.name}</option>)}
            </datalist>
          </div>
          <div className="scanner-terminal__screen">
            <span>{current.label}</span>
            <h2>{current.instruction}</h2>
            <div className="scanner-target">
              <small>{text.expectedScan}</small>
              <strong data-testid="rf-expected-scan">{current.expectedCode}</strong>
              <em>{current.helper}</em>
            </div>
            {isQuantityStep && (
              <div className="rf-quantity-controls" aria-label={text.quantityControls}>
                <Button size="lg" type="button" onClick={() => adjustQuantityScan(-1)} disabled={!selectedTask || quantityCandidate <= 0}>-1</Button>
                <div className="rf-quantity-controls__value"><span>{text.quantityNow}</span><strong>{quantityCandidate}</strong></div>
                <Button size="lg" type="button" onClick={() => adjustQuantityScan(1)} disabled={!selectedTask}>+1</Button>
                <Button size="lg" type="button" onClick={() => setQuantityScan(parseQuantityCandidate('', current.expectedCode, selectedTask?.quantity))} disabled={!selectedTask}>{text.useExpected}</Button>
              </div>
            )}
            <ProgressBar value={progress} />
          </div>
          <form ref={scanForm} className="scanner-form" onSubmit={submitScan}>
            <RfScannerInput
              label={text.scan}
              value={scanValue}
              onValueChange={setScanValue}
              onSubmitValue={() => scanForm.current?.requestSubmit()}
              placeholder={current.expectedCode}
              inputMode={current.key === 'qty' ? 'numeric' : 'text'}
              disabled={!selectedTask || !scannerDeviceReference.trim()}
              data-testid="rf-scan-input"
            />
            <PermissionGate permission="rf.manage"><Button tone="primary" type="submit" data-e2e-action="rf-confirm-scan" disabled={!selectedTask || !scannerDeviceReference.trim() || mutation.status === 'running'}>{text.confirmScan}</Button></PermissionGate>
          </form>
          <div className="scanner-fast-actions">
            {showTestAssist && <Button size="sm" data-e2e-action="rf-fill-expected" onClick={() => setScanValue(current.expectedCode)} disabled={!selectedTask}>{text.fillExpected}</Button>}
            <Button size="sm" data-e2e-action="rf-reset-flow" onClick={() => { setStepIndex(0); setSession(null); }}>{text.resetFlow}</Button>
            <Button size="sm" data-e2e-action="rf-start-resume" onClick={() => { void startSession(); }} disabled={!scannerDeviceReference.trim() || mutation.status === 'running'}>{text.startOrResume}</Button>
          </div>
          <div className="scanner-exception-actions" aria-label={text.exceptionTitle}>
            <span>{text.exceptionHint}</span>
            <div>
              {exceptionActions.map((action, index) => (
                <Button
                  key={action.code}
                  size="sm"
                  type="button"
                  tone={action.code === 'SHORT_PICK' ? 'danger' : 'secondary'}
                  data-e2e-action={index === 0 ? 'rf-report-problem' : `rf-report-${action.code.toLowerCase().replaceAll('_', '-')}`}
                  onClick={() => { void reportProblem(action); }}
                  disabled={!selectedTask || mutation.status === 'running'}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
          <ActionStatus mutation={mutation} />
        </div>
      </Card>

      <Card title={text.taskQueue} eyebrow={text.guidedWork} className="span-5">
        <div className="rf-task-queue">
          {tasksQueue.length ? tasksQueue.slice(0, 8).map((task) => (
            <button key={task.id} data-e2e-row="rf-task" data-e2e-value={task.id} className={cx('rf-task-row', selectedTask?.id === task.id && 'is-active')} onClick={() => { setSelectedTaskId(task.id); setSession(null); setStepIndex(0); }}>
              <span><strong>{task.id}</strong><small>{task.fromLocationCode ?? '—'} → {task.toLocationCode ?? '—'}</small></span>
              <span><StatusPill value={task.status} /><small>{text.priority} {task.priority}</small></span>
            </button>
          )) : <p>{text.noRfTasks}</p>}
        </div>
      </Card>

      <Card title={text.offlineQueueTitle} eyebrow={text.safeRetry} className="span-6" action={<Badge tone={pending.length || offlineStatus.failed ? 'warning' : 'neutral'}>{pending.length} {text.waiting}</Badge>}>
        <div className="offline-queue">
          <div className="rf-offline-status rf-offline-status--card">
            <article><span>{text.offlineStats.local}</span><strong>{pending.length}</strong></article>
            <article><span>{text.offlineStats.server}</span><strong>{offlineStatus.queued}</strong></article>
            <article><span>{text.offlineStats.failed}</span><strong>{offlineStatus.failed}</strong></article>
            <article><span>{text.offlineStats.syncedToday}</span><strong>{offlineStatus.syncedToday}</strong></article>
          </div>
          {pending.length
            ? pending.slice(0, 8).map((item) => <article key={item.idempotencyKey}><span>{new Date(item.recordedAt).toLocaleTimeString()} · {item.stepKey}</span><strong>{item.scannedValue}</strong><small>{item.taskReference ?? text.noTask} · {item.idempotencyKey}</small></article>)
            : <p className="muted-copy">{text.noOfflineScans}</p>}
        </div>
      </Card>

      {log.length > 0 && (
        <Card title={text.operationLog} eyebrow={text.operatorFeedback} className="span-6">
          <div className="event-list">
            {log.map((entry, index) => <article className="event" key={`${index}-${entry}`}><Badge tone={badgeTone(entry)}>{entry.includes('OK') ? 'OK' : entry.includes('offline') ? 'Q' : text.record}</Badge><div><strong>{entry}</strong></div></article>)}
          </div>
        </Card>
      )}
    </div>
  );
}

const czech = {
  banner: 'API RF fronty a offline synchronizace',
  eyebrow: 'práce ve skladu přes sken',
  title: 'RF skener',
  subtitle: '',
  offlineOn: 'Offline zapnuto',
  goOffline: 'Přejít offline',
  sendQueue: 'Odeslat frontu',
  scanner: 'Skener',
  scannerDevice: 'Skener / pracoviště',
  rfMode: 'RF režim',
  rfModes: { DESKTOP: 'Desktop', MOBILE: 'Telefon', TERMINAL: 'Terminál' },
  deviceHealth: 'Stav zařízení',
  battery: 'Baterie',
  signal: 'Signál',
  lastActivity: 'Aktivita',
  notSet: 'Není',
  noTask: 'Žádný úkol',
  offlineQueue: 'Offline fronta',
  ready: 'PŘIPRAVENO',
  expectedScan: 'Očekávaný sken',
  scan: 'Sken',
  confirmScan: 'Potvrdit sken',
  fillExpected: 'Vyplnit očekávané',
  resetFlow: 'Reset toku',
  startOrResume: 'Spustit / pokračovat',
  problem: 'Problém',
  taskQueue: 'Fronta úkolů',
  guidedWork: 'řízená práce',
  priority: 'priorita',
  noRfTasks: 'Žádné RF úkoly.',
  offlineQueueTitle: 'Offline fronta',
  safeRetry: 'bezpečné opakování',
  waiting: 'čeká',
  noOfflineScans: 'Žádné offline skeny.',
  offlineStats: { local: 'V zařízení', server: 'Na serveru', failed: 'Chyby', syncedToday: 'Dnes odesláno' },
  operationLog: 'Provozní záznam',
  operatorFeedback: 'zpětná vazba operátora',
  record: 'Záznam',
  logHint: '',
  noLog: 'Zatím žádný sken.',
  noLiveTask: 'Čeká se na úkol ze serveru.',
  queueEmpty: 'Fronta RF je prázdná.',
  sourceMissing: 'Zdroj není nastavený',
  targetMissing: 'Cíl není nastavený',
  quantity: 'Množství',
  quantityConfirm: 'Potvrzení množství',
  quantityControls: 'Ovládání množství',
  quantityNow: 'Zadané množství',
  useExpected: 'Použít očekávané',
  error: 'Chyba',
  problemInStep: 'Problém zachycen v kroku',
  exceptionTitle: 'Rychlé výjimky',
  exceptionHint: 'Výjimka',
  exceptionActions: {
    shortPick: 'Chybí kusy',
    wrongItem: 'Jiná položka',
    wrongLocation: 'Jiná lokace',
    damaged: 'Poškozeno',
    missingHu: 'Chybí HU',
    barcode: 'Nečitelný kód',
  },
  exceptionDescriptions: {
    shortPick: 'Operátor hlásí kratší množství.',
    wrongItem: 'Operátor našel jinou položku než očekávanou.',
    wrongLocation: 'Operátor je u jiné lokace než očekávané.',
    damaged: 'Operátor našel poškozené zboží.',
    missingHu: 'Operátor nenašel očekávanou manipulační jednotku.',
    barcode: 'Operátor nemůže načíst nebo rozpoznat kód.',
  },
  step: { task: 'Úkol', source: 'Zdroj', quantity: 'Množství', target: 'Cíl' },
  stepInstruction: {
    task: 'Naskenujte čárový kód úkolu.',
    source: 'Potvrďte zdrojovou lokaci.',
    sku: 'Naskenujte SKU nebo EAN.',
    quantity: 'Zadejte množství.',
    target: 'Potvrďte cílovou lokaci nebo drop zónu.',
  },
  actions: {
    startSession: 'Spustit RF relaci',
    confirmScan: 'Potvrdit RF sken',
    syncQueue: 'Synchronizovat offline RF frontu',
    reportProblem: 'Nahlásit RF výjimku',
  },
  log: {
    session: 'Relace spuštěna',
    offlineSaved: 'uloženo offline',
    mismatch: 'Neshoda',
    sync: 'Offline sync',
    synced: 'odesláno',
    failed: 'chyb',
    duplicates: 'duplicit',
    exception: 'Výjimka zachycena pro',
    resolved: 'Rozpoznáno',
  },
};

const english = {
  banner: 'RF queue and offline sync API',
  eyebrow: 'warehouse work by scan',
  title: 'RF scanner',
  subtitle: '',
  offlineOn: 'Offline on',
  goOffline: 'Go offline',
  sendQueue: 'Send queue',
  scanner: 'Scanner',
  scannerDevice: 'Scanner / workstation',
  rfMode: 'RF mode',
  rfModes: { DESKTOP: 'Desktop', MOBILE: 'Phone', TERMINAL: 'Terminal' },
  deviceHealth: 'Device health',
  battery: 'Battery',
  signal: 'Signal',
  lastActivity: 'Activity',
  notSet: 'Not set',
  noTask: 'No task',
  offlineQueue: 'Offline queue',
  ready: 'READY',
  expectedScan: 'Expected scan',
  scan: 'Scan',
  confirmScan: 'Confirm scan',
  fillExpected: 'Fill expected',
  resetFlow: 'Reset flow',
  startOrResume: 'Start / resume',
  problem: 'Problem',
  taskQueue: 'Task queue',
  guidedWork: 'guided work',
  priority: 'priority',
  noRfTasks: 'No RF tasks.',
  offlineQueueTitle: 'Offline queue',
  safeRetry: 'safe retry',
  waiting: 'waiting',
  noOfflineScans: 'No offline scans.',
  offlineStats: { local: 'On device', server: 'On server', failed: 'Failed', syncedToday: 'Sent today' },
  operationLog: 'Operation log',
  operatorFeedback: 'operator feedback',
  record: 'RECORD',
  logHint: '',
  noLog: 'No scans yet.',
  noLiveTask: 'Waiting for a task from the server.',
  queueEmpty: 'The RF queue is empty.',
  sourceMissing: 'Source is not set',
  targetMissing: 'Target is not set',
  quantity: 'Quantity',
  quantityConfirm: 'Quantity confirmation',
  quantityControls: 'Quantity controls',
  quantityNow: 'Entered quantity',
  useExpected: 'Use expected',
  error: 'Error',
  problemInStep: 'Problem captured in step',
  exceptionTitle: 'Quick exceptions',
  exceptionHint: 'Exception',
  exceptionActions: {
    shortPick: 'Short pick',
    wrongItem: 'Wrong item',
    wrongLocation: 'Wrong location',
    damaged: 'Damaged',
    missingHu: 'Missing HU',
    barcode: 'Unreadable code',
  },
  exceptionDescriptions: {
    shortPick: 'The operator reports a short quantity.',
    wrongItem: 'The operator found a different item than expected.',
    wrongLocation: 'The operator is at a different location than expected.',
    damaged: 'The operator found damaged stock.',
    missingHu: 'The operator cannot find the expected handling unit.',
    barcode: 'The operator cannot scan or resolve the code.',
  },
  step: { task: 'Task', source: 'Source', quantity: 'Quantity', target: 'Target' },
  stepInstruction: {
    task: 'Scan the task barcode.',
    source: 'Confirm the source location.',
    sku: 'Scan SKU or EAN.',
    quantity: 'Enter quantity.',
    target: 'Confirm the target location or drop zone.',
  },
  actions: {
    startSession: 'Start RF session',
    confirmScan: 'Confirm RF scan',
    syncQueue: 'Sync offline RF queue',
    reportProblem: 'Report RF exception',
  },
  log: {
    session: 'Session started',
    offlineSaved: 'saved offline',
    mismatch: 'Mismatch',
    sync: 'Offline sync',
    synced: 'sent',
    failed: 'failed',
    duplicates: 'duplicates',
    exception: 'Exception captured for',
    resolved: 'Resolved',
  },
};

const ukrainian = {
  banner: 'API RF черги та офлайн синхронізації',
  eyebrow: 'робота на складі через скан',
  title: 'RF сканер',
  subtitle: '',
  offlineOn: 'Офлайн увімкнено',
  goOffline: 'Перейти офлайн',
  sendQueue: 'Надіслати чергу',
  scanner: 'Сканер',
  scannerDevice: 'Сканер / станція',
  rfMode: 'RF режим',
  rfModes: { DESKTOP: 'Desktop', MOBILE: 'Телефон', TERMINAL: 'Термінал' },
  deviceHealth: 'Стан пристрою',
  battery: 'Батарея',
  signal: 'Сигнал',
  lastActivity: 'Активність',
  notSet: 'Немає',
  noTask: 'Немає завдання',
  offlineQueue: 'Офлайн черга',
  ready: 'ГОТОВО',
  expectedScan: 'Очікуваний скан',
  scan: 'Скан',
  confirmScan: 'Підтвердити скан',
  fillExpected: 'Заповнити очікуване',
  resetFlow: 'Скинути процес',
  startOrResume: 'Почати / продовжити',
  problem: 'Проблема',
  taskQueue: 'Черга завдань',
  guidedWork: 'керована робота',
  priority: 'пріоритет',
  noRfTasks: 'Немає RF завдань.',
  offlineQueueTitle: 'Офлайн черга',
  safeRetry: 'безпечна повторна спроба',
  waiting: 'очікує',
  noOfflineScans: 'Немає офлайн сканів.',
  offlineStats: { local: 'На пристрої', server: 'На сервері', failed: 'Помилки', syncedToday: 'Надіслано сьогодні' },
  operationLog: 'Операційний журнал',
  operatorFeedback: 'зворотний зв’язок оператора',
  record: 'Запис',
  logHint: '',
  noLog: 'Поки немає сканів.',
  noLiveTask: 'Очікується завдання із сервера.',
  queueEmpty: 'RF черга порожня.',
  sourceMissing: 'Джерело не задано',
  targetMissing: 'Ціль не задано',
  quantity: 'Кількість',
  quantityConfirm: 'Підтвердження кількості',
  quantityControls: 'Керування кількістю',
  quantityNow: 'Введена кількість',
  useExpected: 'Взяти очікуване',
  error: 'Помилка',
  problemInStep: 'Проблему зафіксовано на кроці',
  exceptionTitle: 'Швидкі винятки',
  exceptionHint: 'Виняток',
  exceptionActions: {
    shortPick: 'Нестача',
    wrongItem: 'Інша позиція',
    wrongLocation: 'Інша локація',
    damaged: 'Пошкоджено',
    missingHu: 'Немає HU',
    barcode: 'Код не читається',
  },
  exceptionDescriptions: {
    shortPick: 'Оператор повідомляє про нестачу кількості.',
    wrongItem: 'Оператор знайшов іншу позицію, ніж очікувалось.',
    wrongLocation: 'Оператор перебуває в іншій локації, ніж очікувалось.',
    damaged: 'Оператор знайшов пошкоджений запас.',
    missingHu: 'Оператор не знайшов очікувану вантажну одиницю.',
    barcode: 'Оператор не може сканувати або розпізнати код.',
  },
  step: { task: 'Завдання', source: 'Джерело', quantity: 'Кількість', target: 'Ціль' },
  stepInstruction: {
    task: 'Відскануйте штрихкод завдання.',
    source: 'Підтвердьте вихідну локацію.',
    sku: 'Відскануйте SKU або EAN.',
    quantity: 'Введіть кількість.',
    target: 'Підтвердьте цільову локацію або drop-зону.',
  },
  actions: {
    startSession: 'Почати RF сесію',
    confirmScan: 'Підтвердити RF скан',
    syncQueue: 'Синхронізувати офлайн RF чергу',
    reportProblem: 'Повідомити RF виняток',
  },
  log: {
    session: 'Сесію розпочато',
    offlineSaved: 'збережено офлайн',
    mismatch: 'Невідповідність',
    sync: 'Офлайн синхронізація',
    synced: 'надіслано',
    failed: 'помилок',
    duplicates: 'дублікатів',
    exception: 'Виняток зафіксовано для',
    resolved: 'Розпізнано',
  },
};
