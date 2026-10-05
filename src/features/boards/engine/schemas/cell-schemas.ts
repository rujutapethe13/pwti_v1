/**
 * Cell Value Zod Schemas
 *
 * Validates all Cell Value mutations before they reach the service layer.
 * Each cell update is validated against its Column Definition's type rules.
 */

import { z } from "zod";

// ── Reusable Primitives ─────────────────────────────────────

const entityId = z.string().min(1, "ID is required");
const organizationId = z.string().min(1, "Organization ID is required");
const workspaceId = z.string().min(1, "Workspace ID is required");
const boardId = z.string().min(1, "Board ID is required");

// ── Single Cell Update ─────────────────────────────────────

export const updateCellSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  recordId: entityId,
  columnId: entityId,
  value: z.unknown(),
});

export type UpdateCellInput = z.infer<typeof updateCellSchema>;

// ── Cell Update Entry (for bulk operations) ────────────────

export const cellUpdateEntrySchema = z.object({
  recordId: entityId,
  columnId: entityId,
  value: z.unknown(),
});

// ── Bulk Cell Update ───────────────────────────────────────

export const bulkUpdateCellsSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  updates: z.array(cellUpdateEntrySchema).min(1, "At least one cell update is required"),
});

export type BulkUpdateCellsInput = z.infer<typeof bulkUpdateCellsSchema>;

// ── Clear Cell Value ───────────────────────────────────────

export const clearCellSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  recordId: entityId,
  columnId: entityId,
});

export type ClearCellInput = z.infer<typeof clearCellSchema>;

