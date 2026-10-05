/**
 * useBootIdSync
 *
 * React hook wrapper around `@/lib/boot-sync`. On mount it reconciles the local
 * persisted "row item" data with the running server's boot ID:
 * - if the server restarted (boot ID mismatch), stale localStorage data is wiped.
 * - otherwise existing persisted data is preserved.
 *
 * Returns `ready` (true once the reconciliation attempt has completed) so that
 * consumers — e.g. `WorkspaceProvider` — can defer reading persisted state from
 * localStorage until after a potential wipe, avoiding a flash of stale data.
 *
 * Safe to call from any client component. The underlying fetch is a no-op-safe,
 * catch-everything operation: a failure simply leaves persisted data intact and
 * marks the sync as ready so the app proceeds normally.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

import type { BootSyncResult } from "@/lib/boot-sync";
import { syncBootId } from "@/lib/boot-sync";

export interface BootIdSyncState {
  /** The server boot ID fetched from GET /api/boot-id (`null` if unreachable). */
  bootId: string | null;
  /** `true` once the initial reconciliation attempt has completed. */
  ready: boolean;
  /** Outcome of the reconciliation. */
  result: BootSyncResult;
}

export function useBootIdSync(): BootIdSyncState {
  const [bootId, setBootId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<BootSyncResult>({
    bootId: null,
    reset: false,
    reason: "unreachable",
  });

  const reconcile = useCallback(async () => {
    const res = await syncBootId();
    setBootId(res.bootId);
    setResult(res);
    setReady(true);
  }, []);

  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  return { bootId, ready, result };
}
