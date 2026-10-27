const DATABASE_NAME = 'aardvarkland-wms-rf';
const DATABASE_VERSION = 1;
const STORE_NAME = 'offline-scans';
const LEGACY_STORAGE_KEY = 'wms-rf-offline-queue-v2';
const FALLBACK_STORAGE_KEY = 'wms-rf-offline-queue-v3';

export interface StoredRfOfflineScan {
  idempotencyKey: string;
  warehouseId: string;
  sessionReference?: string;
  taskReference?: string;
  stepKey?: string;
  scannedValue: string;
  quantity?: number;
  recordedAt: string;
  metadata: Record<string, unknown>;
}

// Persist each user-acknowledged scan before indicating success in the scanner UI.
// A serialized per-warehouse queue prevents concurrent writes from clobbering each other.
const warehouseOperations = new Map<string, Promise<void>>();

function serializeWarehouse<T>(warehouseId: string, work: () => Promise<T>): Promise<T> {
  const previous = warehouseOperations.get(warehouseId) ?? Promise.resolve();
  const operation = previous.then(work, work);
  warehouseOperations.set(warehouseId, operation.then(() => undefined, () => undefined));
  return operation;
}

export async function loadRfOfflineQueue(warehouseId: string): Promise<StoredRfOfflineScan[]> {
  const normalizedWarehouse = normalizeWarehouse(warehouseId);
  // Read the fallback first. IndexedDB might recover after the fallback received
  // newer unacknowledged scans; never erase those scans merely because IDB opens.
  const fallback = loadFallbackQueue(normalizedWarehouse);
  try {
    const database = await openDatabase();
    try {
      await migrateLegacyQueue(database, normalizedWarehouse);
      const scans = (await readAll(database)).filter((scan) => scan.warehouseId === normalizedWarehouse);
      const merged = mergeScans(scans, fallback ?? []);
      if (fallback !== null) {
        await replaceWarehouseQueue(database, normalizedWarehouse, merged);
        removeFallbackQueue(normalizedWarehouse);
      }
      return merged;
    } finally {
      database.close();
    }
  } catch (error) {
    // Do not silently create an empty queue when an existing IDB queue might
    // only be temporarily inaccessible.
    if (fallback !== null) return fallback;
    throw error;
  }
}

export function saveRfOfflineQueue(warehouseId: string, scans: StoredRfOfflineScan[]): Promise<void> {
  const normalizedWarehouse = normalizeWarehouse(warehouseId);
  return serializeWarehouse(normalizedWarehouse, async () => {
    await persistWarehouseQueue(normalizedWarehouse, mergeScans(
      scans.map((scan) => ({ ...scan, warehouseId: normalizedWarehouse })),
    ));
  });
}

export function appendRfOfflineScan(
  warehouseId: string,
  scan: StoredRfOfflineScan,
): Promise<StoredRfOfflineScan[]> {
  const normalizedWarehouse = normalizeWarehouse(warehouseId);
  return serializeWarehouse(normalizedWarehouse, async () => {
    const stored = await loadRfOfflineQueue(normalizedWarehouse);
    const next = mergeScans(stored, [{ ...scan, warehouseId: normalizedWarehouse }]);
    await persistWarehouseQueue(normalizedWarehouse, next);
    return next;
  });
}

export function removeRfOfflineScans(
  warehouseId: string,
  confirmedIdempotencyKeys: string[],
): Promise<StoredRfOfflineScan[]> {
  const normalizedWarehouse = normalizeWarehouse(warehouseId);
  return serializeWarehouse(normalizedWarehouse, async () => {
    const stored = await loadRfOfflineQueue(normalizedWarehouse);
    const confirmed = new Set(confirmedIdempotencyKeys);
    const next = stored.filter((scan) => !confirmed.has(scan.idempotencyKey));
    await persistWarehouseQueue(normalizedWarehouse, next);
    return next;
  });
}

async function persistWarehouseQueue(warehouseId: string, scans: StoredRfOfflineScan[]): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    await replaceWarehouseQueue(database, warehouseId, scans);
    removeFallbackQueue(warehouseId);
  } catch {
    // If IndexedDB failed, fallback storage must also acknowledge its write.
    // Quota/permission errors must reach the UI, never be reported as saved.
    saveFallbackQueue(warehouseId, scans);
  } finally {
    database?.close();
  }
}

function mergeScans(...groups: StoredRfOfflineScan[][]): StoredRfOfflineScan[] {
  const merged = new Map<string, StoredRfOfflineScan>();
  for (const group of groups) for (const scan of group) merged.set(scan.idempotencyKey, scan);
  return sortAndLimit([...merged.values()]);
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
        store.createIndex('warehouseId', 'warehouseId', { unique: false });
        store.createIndex('recordedAt', 'recordedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
  });
}

function readAll(database: IDBDatabase): Promise<StoredRfOfflineScan[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const normalized = normalizeScans(request.result);
      if (normalized.length !== request.result.length) {
        reject(new Error('RF_OFFLINE_DATABASE_CORRUPT'));
        return;
      }
      resolve(normalized);
    };
    request.onerror = () => reject(request.error ?? new Error('Offline queue could not be read'));
  });
}

function replaceWarehouseQueue(
  database: IDBDatabase,
  warehouseId: string,
  scans: StoredRfOfflineScan[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('warehouseId');
    const cursor = index.openKeyCursor(IDBKeyRange.only(warehouseId));

    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) {
        for (const scan of scans) store.put(scan);
        return;
      }
      store.delete(current.primaryKey);
      current.continue();
    };
    cursor.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Offline queue could not be saved'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Offline queue save was aborted'));
  });
}

async function migrateLegacyQueue(database: IDBDatabase, warehouseId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  let legacy: unknown;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    legacy = JSON.parse(raw);
  } catch {
    return;
  }

  const scans = normalizeScans(legacy).map((scan) => ({ ...scan, warehouseId }));
  if (scans.length > 0) {
    const existing = await readAll(database);
    const merged = new Map(existing.map((scan) => [scan.idempotencyKey, scan]));
    for (const scan of scans) merged.set(scan.idempotencyKey, scan);
    await replaceWarehouseQueue(database, warehouseId, [...merged.values()].filter((scan) => scan.warehouseId === warehouseId));
  }

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // IndexedDB migration already succeeded; stale fallback cleanup is best effort.
  }
}

function loadFallbackQueue(warehouseId: string): StoredRfOfflineScan[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(fallbackKey(warehouseId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('RF_OFFLINE_FALLBACK_CORRUPT');
    const normalized = normalizeScans(parsed).map((scan) => ({ ...scan, warehouseId }));
    if (normalized.length !== parsed.length) throw new Error('RF_OFFLINE_FALLBACK_CORRUPT');
    return sortAndLimit(normalized);
  } catch {
    throw new Error('RF_OFFLINE_FALLBACK_UNREADABLE');
  }
}

function saveFallbackQueue(warehouseId: string, scans: StoredRfOfflineScan[]): void {
  if (typeof window === 'undefined') throw new Error('RF_OFFLINE_STORAGE_UNAVAILABLE');
  window.localStorage.setItem(fallbackKey(warehouseId), JSON.stringify(scans));
}

function removeFallbackQueue(warehouseId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(fallbackKey(warehouseId));
  } catch {
    // Primary is already durably written; retry removal at a later launch.
  }
}

function normalizeScans(value: unknown): StoredRfOfflineScan[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const scan = entry as Record<string, unknown>;
    const idempotencyKey = stringValue(scan['idempotencyKey']);
    const scannedValue = stringValue(scan['scannedValue']);
    const recordedAt = stringValue(scan['recordedAt']);
    if (!idempotencyKey || !scannedValue || !recordedAt) return [];

    return [{
      idempotencyKey,
      warehouseId: normalizeWarehouse(stringValue(scan['warehouseId']) || 'MAIN'),
      sessionReference: optionalString(scan['sessionReference']),
      taskReference: optionalString(scan['taskReference']),
      stepKey: optionalString(scan['stepKey']),
      scannedValue,
      quantity: numberValue(scan['quantity']),
      recordedAt,
      metadata: objectValue(scan['metadata']),
    }];
  });
}

function sortAndLimit(scans: StoredRfOfflineScan[]): StoredRfOfflineScan[] {
  // Never discard an unacknowledged operation. Storage failure is explicit.
  return [...scans].sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt));
}

function normalizeWarehouse(value: string): string {
  return value.trim().toUpperCase() || 'MAIN';
}

function fallbackKey(warehouseId: string): string {
  return `${FALLBACK_STORAGE_KEY}:${warehouseId}`;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | undefined {
  const normalized = stringValue(value);
  return normalized || undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
