/**
 * Client-side Boot ID synchronization
 *
 * Compares the running server's boot ID (fetched from GET /api/boot-id) with the
 * last-known boot ID stored in localStorage. When they differ the server was
 * restarted, so any persisted "row item" data (localStorage keys prefixed with
 * `app:`) is stale and is wiped so the app re-initializes from a clean state.
 *
 * The `lastBootId` itself lives under `app:last-boot-id` so it is swept up
 * alongside the row data by `clearAllPersisted()` (a forced dev reset clears
 * everything and the next load re-establishes the new boot ID).
 *
 * Design notes:
 * - On the very first run there is no stored boot ID; we treat that as "fresh"
 *   and keep any existing row data (there typically isn't any).
 * - If the boot-id fetch fails (server down, network error) we deliberately do
 *   NOT clear persisted data — we never want to destroy user state on a
 *   transient failure.
 */
"use client";

import { clearAllPersisted } from "@/lib/storage";

const BOOT_ID_STORAGE_KEY = "app:last-boot-id";

/** Reads the last-known server boot ID from localStorage (server-rendered safe). */
export function getStoredBootId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(BOOT_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the current server boot ID to localStorage. */
export function setStoredBootId(id: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BOOT_ID_STORAGE_KEY, id);
  } catch {
    // storage unavailable — ignore
  }
}

/** Removes the stored boot ID (used on explicit resets). */
export function clearStoredBootId(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(BOOT_ID_STORAGE_KEY);
  } catch {
    // storage unavailable — ignore
  }
}

/** Fetches the live boot ID from the server. Returns `null` on any failure. */
export async function fetchBootId(): Promise<string | null> {
  try {
    const res = await fetch("/api/boot-id", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { bootId?: unknown };
    return typeof json.bootId === "string" ? json.bootId : null;
  } catch {
    return null;
  }
}

export interface BootSyncResult {
  bootId: string | null;
  reset: boolean;
  reason: "first-run" | "match" | "restart" | "unreachable";
}

/**
 * Reconciles local persisted data with the running server.
 *
 * Fetches the server boot ID and compares it to the last-known value:
 * - mismatch  -> server restarted: clears all `app:` persisted data, then
 *                stores the new boot ID.
 * - match     -> keeps existing persisted data.
 * - no stored -> first run: stores the boot ID, keeps existing data.
 * - fetch err -> unreachable: leaves data intact (no destructive action).
 * */
export async function syncBootId(): Promise<BootSyncResult> {
  const serverBootId = await fetchBootId();

  if (!serverBootId) {
    return { bootId: null, reset: false, reason: "unreachable" };
  }

  const lastBootId = getStoredBootId();

  if (lastBootId === null) {
    setStoredBootId(serverBootId);
    return { bootId: serverBootId, reset: false, reason: "first-run" };
  }

  if (lastBootId === serverBootId) {
    return { bootId: serverBootId, reset: false, reason: "match" };
  }

  // Mismatch -> server restarted. Wipe stale persisted row-item data first
  // (this also removes the old `app:last-boot-id`), then record the new one.
  clearAllPersisted();
  setStoredBootId(serverBootId);
  return { bootId: serverBootId, reset: true, reason: "restart" };
}
