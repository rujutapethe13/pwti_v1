"use client";

/**
 * Shared Hooks
 *
 * Central export for custom React hooks that are shared across features.
 * Feature-specific hooks should live in their respective feature directory.
 *
 * ── Available Hooks ──────────────────────────────────────────
 * - useBootIdSync — reconciles persisted data with the server boot ID on load
 * - useLocalStorage — typed localStorage wrapper (planned)
 * - useMediaQuery  — responsive breakpoint detection (planned)
 * - useDebounce    — debounced value for search inputs (planned)
 * ────────────────────────────────────────────────────────────
 */

export { useBootIdSync } from "./use-boot-sync";
export type { BootIdSyncState } from "./use-boot-sync";
export { useNotifications } from "./use-notifications";
export type { Notification } from "./use-notifications";
export { timeAgo } from "./use-notifications";

