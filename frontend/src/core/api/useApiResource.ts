import { useCallback, useEffect, useMemo, useState } from 'react';
import { config } from '../../app/config';
import { WMS_REALTIME_EVENT } from './realtime';

export type ApiResourceStatus = 'disabled' | 'loading' | 'live' | 'error';

export interface ApiResourceState<T> {
  data: T;
  status: ApiResourceStatus;
  error?: string;
  refreshedAt?: string;
  refreshedAtIso?: string;
  ageSeconds: number | null;
  stale: boolean;
  refresh: () => void;
}

export interface ApiResourceOptions<T> {
  fallback: T;
  productionFallback?: T;
  loader: () => Promise<unknown>;
  map: (payload: unknown) => T;
  enabled?: boolean;
  dependencies?: unknown[];
  refreshIntervalMs?: number;
  staleAfterMs?: number;
  refreshOnRealtime?: boolean;
}

function defaultProductionFallback<T>(fallback: T): T {
  return emptyLike(fallback) as T;
}

function emptyLike(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number') return 0;
    if (typeof value === 'boolean') return false;
    if (typeof value === 'string') return '';
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, emptyLike(entry)]),
  );
}

export function useApiResource<T>({
  fallback,
  productionFallback,
  loader,
  map,
  enabled = !config.enableMocks,
  dependencies = [],
  refreshIntervalMs = 0,
  staleAfterMs = 0,
  refreshOnRealtime = false,
}: ApiResourceOptions<T>): ApiResourceState<T> {
  const emptyData = useMemo(() => productionFallback ?? defaultProductionFallback(fallback), [fallback, productionFallback]);
  const [data, setData] = useState<T>(emptyData);
  const [status, setStatus] = useState<ApiResourceStatus>(enabled ? 'loading' : 'disabled');
  const [error, setError] = useState<string | undefined>();
  const [refreshedAt, setRefreshedAt] = useState<string | undefined>();
  const [refreshedAtIso, setRefreshedAtIso] = useState<string | undefined>();
  const [ageTick, setAgeTick] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || refreshIntervalMs <= 0) return undefined;
    const interval = window.setInterval(refresh, refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [enabled, refresh, refreshIntervalMs]);

  useEffect(() => {
    if (!enabled || staleAfterMs <= 0) return undefined;
    const interval = window.setInterval(() => setAgeTick((value) => value + 1), Math.min(30000, Math.max(5000, Math.floor(staleAfterMs / 2))));
    return () => window.clearInterval(interval);
  }, [enabled, staleAfterMs]);

  useEffect(() => {
    if (!enabled || !refreshOnRealtime) return undefined;
    const handler = () => refresh();
    window.addEventListener(WMS_REALTIME_EVENT, handler);
    return () => window.removeEventListener(WMS_REALTIME_EVENT, handler);
  }, [enabled, refresh, refreshOnRealtime]);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      setData(emptyData);
      setStatus('disabled');
      setError(undefined);
      return () => { active = false; };
    }

    setStatus((current) => (current === 'live' ? 'live' : 'loading'));
    setError(undefined);
    loader()
      .then((payload) => {
        if (!active) return;
        const mapped = map(payload);
        const refreshed = new Date();
        setData(mapped);
        setStatus('live');
        setRefreshedAt(refreshed.toLocaleTimeString());
        setRefreshedAtIso(refreshed.toISOString());
        setAgeTick((value) => value + 1);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'API request failed');
      });

    return () => { active = false; };
  }, [enabled, refreshTick, fallback, emptyData, ...dependencies]);

  const now = Date.now() + ageTick * 0;
  const ageSeconds = refreshedAtIso ? Math.max(0, Math.floor((now - new Date(refreshedAtIso).getTime()) / 1000)) : null;
  const stale = Boolean(staleAfterMs > 0 && ageSeconds !== null && ageSeconds * 1000 > staleAfterMs);

  return { data, status, error, refreshedAt, refreshedAtIso, ageSeconds, stale, refresh };
}
