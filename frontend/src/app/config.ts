interface RuntimeConfig {
  apiBaseUrl: string;
  apiRequestTimeoutMs: number | string;
  enableMocks: boolean | string;
  defaultWarehouseId: string;
  appVersion?: string;
  releaseSha?: string;
}

declare global {
  interface Window {
    __AARDVARKLAND_STORAGE_SYSTEM_CONFIG__?: Partial<RuntimeConfig>;
  }
}

function readBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return fallback;
}

function readPositiveInt(value: number | string | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  const safe = trimmed || 'http://localhost:4001/api';
  return safe.endsWith('/api') || safe.endsWith('/api/v1') ? safe : `${safe}/api`;
}

const runtime = typeof window !== 'undefined' ? window.__AARDVARKLAND_STORAGE_SYSTEM_CONFIG__ ?? {} : {};
const viteEnableMocks = String(import.meta.env.VITE_ENABLE_MOCKS ?? 'false').toLowerCase() === 'true';
const defaultApiBaseUrl = runtime.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4001/api';
const defaultTimeoutMs = Number.parseInt(String(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS ?? '12000'), 10);

export const config = {
  apiBaseUrl: normalizeApiBaseUrl(defaultApiBaseUrl),
  apiRequestTimeoutMs: readPositiveInt(runtime.apiRequestTimeoutMs, Number.isFinite(defaultTimeoutMs) ? defaultTimeoutMs : 12_000),
  enableMocks: readBoolean(runtime.enableMocks, viteEnableMocks),
  defaultWarehouseId: runtime.defaultWarehouseId ?? import.meta.env.VITE_DEFAULT_WAREHOUSE_ID ?? 'MAIN',
  appVersion: runtime.appVersion ?? import.meta.env.VITE_APP_VERSION ?? 'local',
  releaseSha: runtime.releaseSha ?? import.meta.env.VITE_RELEASE_SHA ?? '',
};
