"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lightweight stale-while-revalidate data hook.
 *
 * - A module-level client cache is shared across page navigations (Next.js client
 *   navigations do not reload the JS context), so boards/items are fetched once
 *   and reused by Overview, Client 360, Boards hub and Dashboard instead of being
 *   re-fetched on every navigation.
 * - Cached (stale) data is shown instantly; a background refresh updates it.
 * - A manual `refresh()` bypasses the cache (server `?refresh=1`) and backs the
 *   "Synced just now" button.
 * - Every fetch is timed and logged so the slowest API call is visible.
 */

interface ClientCacheEntry<T> {
  data: T;
  ts: number;
}

const clientCache = new Map<string, ClientCacheEntry<unknown>>();
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

export interface SharedDataState<T> {
  data: T | null;
  loading: boolean;   // true on the very first load (no cache yet)
  refreshing: boolean; // true during a background or manual refresh
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

function clientCacheEntry<T>(key: string): ClientCacheEntry<T> | null {
  const entry = clientCache.get(key);
  if (!entry) return null;
  return entry as ClientCacheEntry<T>;
}

function readCache<T>(key: string): T | null {
  return clientCacheEntry<T>(key)?.data ?? null;
}

function writeCache<T>(key: string, data: T, ttlMs: number): void {
  clientCache.set(key, { data, ts: Date.now() });
  setTimeout(() => {
    const entry = clientCache.get(key);
    if (entry && Date.now() - entry.ts > ttlMs) clientCache.delete(key);
  }, ttlMs);
}

function timeFetch<T>(label: string, fetcher: () => Promise<T>): Promise<T> {
  const start = Date.now();
  return fetcher().then(
    (data) => {
      console.log(`[perf][client] ${label} — ${Date.now() - start}ms`);
      return data;
    },
    (err) => {
      console.log(`[perf][client] ${label} — FAILED after ${Date.now() - start}ms`);
      throw err;
    },
  );
}

export function useSharedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number },
): SharedDataState<T> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const cached = readCache<T>(key);
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(!clientCache.has(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    clientCacheEntry(key) ? new Date(clientCacheEntry(key)!.ts) : null,
  );
  const refreshRequested = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshRequested.current) return;
    refreshRequested.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const result = await timeFetch(`refresh ${key}`, () => fetcher());
      writeCache(key, result, ttlMs);
      setData(result);
      setLoading(false);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
      refreshRequested.current = false;
    }
  }, [key, fetcher, ttlMs]);

  // Stale-while-revalidate: show cached data instantly, then refresh in the
  // background if stale or missing.
  useEffect(() => {
    const entry = clientCacheEntry(key);
    const stale = !entry || Date.now() - entry.ts > ttlMs;
    if (!stale) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await timeFetch(`load ${key}`, fetcher);
        if (cancelled) return;
        writeCache(key, result, ttlMs);
        setData(result);
        setLoading(false);
        setLastUpdated(new Date());
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load data");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic background revalidate so data stays fresh between navigations.
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => {
      const entry = clientCacheEntry(key);
      if (!entry || Date.now() - entry.ts > ttlMs) {
        void refresh();
      }
    }, ttlMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, key, ttlMs, refresh]);

  return { data, loading, refreshing, error, lastUpdated, refresh };
}
