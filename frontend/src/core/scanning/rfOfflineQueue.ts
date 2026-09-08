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

export async function loadRfOfflineQueue(warehouseId: string): Promise<StoredRfOfflineScan[]> {
  const normalizedWarehouse = normalizeWarehouse(warehouseId);

  try {
    const database = await openDatabase();
    await migrateLegacyQueue(database, normalizedWarehouse);
    const scans = await readAll(database);
    database.close();
    return sortAndLimit(scans.filter((scan) => scan.warehouseId === normalizedWarehouse));
  } catch {
    return loadFallbackQueue(normalizedWarehouse);
  }
}

export async function saveRfOfflineQueue(
  warehouseId: string,
  scans: StoredRfOfflineScan[],
): Promise<void> {
  const normalizedWarehouse = normalizeWarehouse(warehouseId);
  const normalizedScans = sortAndLimit(
    scans.map((scan) => ({ ...scan, warehouseId: normalizedWarehouse })),
  );

  try {
    const database = await openDatabase();
    await replaceWarehouseQueue(database, normalizedWarehouse, normalizedScans);
    database.close();
    removeFallbackQueue(normalizedWarehouse);
  } catch {
    saveFallbackQueue(normalizedWarehouse, normalizedScans);
  }
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
    request.onsuccess = () => resolve(normalizeScans(request.result));
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

function loadFallbackQueue(warehouseId: string): StoredRfOfflineScan[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(fallbackKey(warehouseId)) ?? '[]');
    return sortAndLimit(normalizeScans(parsed).map((scan) => ({ ...scan, warehouseId })));
  } catch {
    return [];
  }
}

function saveFallbackQueue(warehouseId: string, scans: StoredRfOfflineScan[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(fallbackKey(warehouseId), JSON.stringify(scans));
  } catch {
    // The active UI still keeps the queue in memory and will expose sync failure.
  }
}

function removeFallbackQueue(warehouseId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(fallbackKey(warehouseId));
  } catch {
    // Best effort cleanup only.
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
  return [...scans]
    .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))
    .slice(0, 500);
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
