/**
 * Record CRUD Zod Schemas
 *
 * Validates all Record mutation inputs before they reach the service layer.
 * Supports single-record and bulk operations.
 */

import { z } from "zod";

// ── Reusable Primitives ─────────────────────────────────────

const entityId = z.string().min(1, "ID is required");
const organizationId = z.string().min(1, "Organization ID is required");
const workspaceId = z.string().min(1, "Workspace ID is required");
const boardId = z.string().min(1, "Board ID is required");
const nonEmptyString = z.string().min(1, "Value must not be empty");

// ── Cell Value Entry (for inline record creation) ───────────

export const cellValueEntrySchema = z.record(
  z.string(),
  z.unknown(),
);

// ── Create Record ──────────────────────────────────────────

export const createRecordSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  title: nonEmptyString.max(500, "Record title must be 500 characters or fewer"),
  groupId: entityId.optional().nullable(),
  /** Initial cell values keyed by column ID */
  cellValues: cellValueEntrySchema.optional().default({}),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;

// ── Edit Record ────────────────────────────────────────────

export const editRecordSchema = z.object({
  recordId: entityId,
  title: nonEmptyString.max(500).optional(),
  groupId: entityId.optional().nullable(),
  /** Cell value updates keyed by column ID */
  cellValues: cellValueEntrySchema.optional(),
});

export type EditRecordInput = z.infer<typeof editRecordSchema>;

// ── Duplicate Record ───────────────────────────────────────

export const duplicateRecordSchema = z.object({
  recordId: entityId,
  /** Override title for the duplicated record */
  newTitle: nonEmptyString.max(500).optional(),
  targetGroupId: entityId.optional(),
});

export type DuplicateRecordInput = z.infer<typeof duplicateRecordSchema>;

// ── Delete Record (soft/hard) ──────────────────────────────

export const deleteRecordSchema = z.object({
  recordId: entityId,
  permanent: z.boolean().default(false),
});

export type DeleteRecordInput = z.infer<typeof deleteRecordSchema>;

// ── Archive Record ─────────────────────────────────────────

export const archiveRecordSchema = z.object({
  recordId: entityId,
});

export type ArchiveRecordInput = z.infer<typeof archiveRecordSchema>;

// ── Restore Record ─────────────────────────────────────────

export const restoreRecordSchema = z.object({
  recordId: entityId,
});

export type RestoreRecordInput = z.infer<typeof restoreRecordSchema>;

// ── Move Record between Groups ─────────────────────────────

export const moveRecordSchema = z.object({
  recordId: entityId,
  targetGroupId: entityId,
  /** Optional new position within the target group */
  newOrder: z.number().int().min(0).optional(),
});

export type MoveRecordInput = z.infer<typeof moveRecordSchema>;

// ── Bulk Update ────────────────────────────────────────────

export const bulkUpdateSchema = z.object({
  recordIds: z.array(entityId).min(1, "At least one record ID is required"),
  /** Common cell value updates applied to all records */
  cellValues: cellValueEntrySchema,
  /** Optional title template (e.g., "Updated: {{originalTitle}}") */
  titleTemplate: z.string().optional(),
  /** Group ID to move all records to */
  targetGroupId: entityId.optional(),
});

export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;

// ── Bulk Create Records (Import) ───────────────────────────

export const bulkCreateRecordEntrySchema = z.object({
  title: nonEmptyString.max(500, "Record title must be 500 characters or fewer"),
  cellValues: cellValueEntrySchema.optional().default({}),
});

export const bulkCreateRecordsSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  groupId: entityId.optional().nullable(),
  records: z.array(bulkCreateRecordEntrySchema).min(1, "At least one record is required"),
});

export type BulkCreateRecordsInput = z.infer<typeof bulkCreateRecordsSchema>;
export type BulkCreateRecordEntry = z.infer<typeof bulkCreateRecordEntrySchema>;

// ── Bulk Delete ────────────────────────────────────────────

export const bulkDeleteSchema = z.object({
  recordIds: z.array(entityId).min(1, "At least one record ID is required"),
  permanent: z.boolean().default(false),
});

export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;

