/**
 * Global Type Definitions
 *
 * Central place for shared types and interfaces that don't belong
 * to a specific feature. Feature-specific types should live in
 * their respective feature directories under `/src/features/`.
 *
 * ── Common Use Cases ───────────────────────────────────────
 * - API response wrappers (e.g., PaginatedResponse<T>)
 * - Shared enums (Status, Priority, etc.)
 * - Utility types (DeepPartial, Nullable, etc.)
 * ────────────────────────────────────────────────────────────
 */

// ── Generic API Response ───────────────────────────────────
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

// ── Shared Enums (expand as needed) ────────────────────────
export type EntityStatus = "active" | "archived" | "draft";
export type Priority = "low" | "medium" | "high" | "urgent";

// ── Utility ────────────────────────────────────────────────
export type Nullable<T> = T | null;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

