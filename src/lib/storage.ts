"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Centralized localStorage persistence.
 *
 * Row-item / UI state is persisted to `localStorage` so it survives page
 * refreshes *and* tab/browser restarts. The persisted data is reset only when
 * the dev server (or production server) process restarts, which is detected by
 * comparing the server's boot ID against the value stored in
 * `app:last-boot-id` (see `@/lib/boot-sync` + `@/hooks/use-boot-sync`).
 *
 * All reads/writes are wrapped in try/catch so the app falls back to defaults
 * if storage is unavailable or the saved data is malformed.
 *
 * Keys are automatically namespaced with `app:` (e.g. "workspaces" -> "app:workspaces").
 * Note: `clearAllPersisted()` sweeps both `localStorage` and `sessionStorage`
 * `app:`-prefixed keys, so any legacy sessionStorage data is cleaned up too.
 */

const PREFIX = "app:";

function readRaw(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // storage unavailable or quota exceeded — ignore, in-memory state stays authoritative
  }
}

export function loadPersisted<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePersisted<T>(key: string, value: T): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearAllPersisted(): void {
  try {
    if (typeof window === "undefined") return;
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // storage unavailable — ignore
  }
}

export function clearLegacyStorage(): void {
  try {
    if (typeof window === "undefined") return;
    const legacyPrefixes = ["pw-", "workspace:", "board:"];
    for (const key of Object.keys(window.localStorage)) {
      if (legacyPrefixes.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
    for (const key of Object.keys(window.sessionStorage)) {
      if (legacyPrefixes.some((prefix) => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // storage unavailable — ignore
  }
}

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => loadPersisted(key, initial));

  useEffect(() => {
    savePersisted(key, state);
  }, [key, state]);

  return [state, setState];
}
