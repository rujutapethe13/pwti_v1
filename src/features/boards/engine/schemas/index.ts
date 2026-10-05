/**
 * Zod Schemas — Barrel Export
 *
 * All CRUD input validation schemas and their inferred types.
 */

export * from "./board-schemas";
export * from "./group-schemas";
export * from "./column-schemas";
export * from "./record-schemas";
export * from "./cell-schemas";
export * from "./view-schemas";

// ── Shared Schema Utilities ────────────────────────────────

import { z } from "zod";

/** Generic pagination schema used by the Query Service */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(50),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/** Generic entity ID lookup */
export const entityIdSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

export type EntityIdInput = z.infer<typeof entityIdSchema>;

