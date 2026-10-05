/**
 * Column CRUD Zod Schemas
 *
 * Validates all Column mutation inputs before they reach the service layer.
 * Column type changes use the Migration Engine for value coercion.
 */

import { z } from "zod";
import { columnTypeKeys } from "../types";

// ── Reusable Primitives ─────────────────────────────────────

const entityId = z.string().min(1, "ID is required");
const organizationId = z.string().min(1, "Organization ID is required");
const workspaceId = z.string().min(1, "Workspace ID is required");
const boardId = z.string().min(1, "Board ID is required");
const nonEmptyString = z.string().min(1, "Value must not be empty");
const columnTypeSchema = z.enum(columnTypeKeys);

// ── Column Order Entry ─────────────────────────────────────

export const columnOrderEntrySchema = z.object({
  id: entityId,
  order: z.number().int().min(0),
});

// ── Add Column ─────────────────────────────────────────────

export const addColumnSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z_][a-z0-9_]*$/, "Key must start with a letter/underscore and contain only lowercase letters, numbers, and underscores"),
  label: nonEmptyString.max(255),
  description: z.string().max(2000).optional(),
  type: columnTypeSchema,
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  settings: z.record(z.unknown()).default({}),
});

export type AddColumnInput = z.infer<typeof addColumnSchema>;

// ── Connect Board column type schemas ─────────────────────
//
// These describe the exact data shape for the `connect_board`
// column type:
//   - settings  -> stored in `columns.settings` (jsonb)
//   - cell value -> stored in `cell_values.value` (jsonb) as
//     { linked_item_ids: [{ board_id, item_id }, ...] }

export const connectedBoardLinkItemSchema = z.object({
  board_id: z.string().min(1, "board_id is required"),
  item_id: z.string().min(1, "item_id is required"),
  workspace_id: z.string().min(1, "workspace_id is required"),
});

export const connectedBoardColumnValueSchema = z.object({
  linked_item_ids: z.array(connectedBoardLinkItemSchema).default([]),
});

export type ConnectedBoardColumnValueInput = z.infer<typeof connectedBoardColumnValueSchema>;

export const connectedBoardBoardEntrySchema = z.object({
  workspace_id: z.string().min(1, "workspace_id is required"),
  board_id: z.string().min(1, "board_id is required"),
});

export const connectedBoardSettingsSchema = z.object({
  connected_board_ids: z.union([z.array(z.string()), z.array(connectedBoardBoardEntrySchema)]).default([]),
  allow_multiple_items: z.boolean().default(false),
  two_way_sync: z.boolean().default(false),
  linked_column_id_on_other_board: z.string().nullable().default(null),
});

export type ConnectedBoardSettingsInput = z.infer<typeof connectedBoardSettingsSchema>;

// ── Mirror column type schemas ───────────────────────────────
//
//   settings -> stored in `columns.settings` (jsonb)
//
export const mirrorDisplayConfigSchema = z.object({
  aggregation: z.string().nullable().default(null),
  display_mode: z.enum(["stacked", "separate"]).default("stacked").optional(),
  filter_value: z.string().nullable().default(null).optional(),
});

export const mirroredColumnSchema = z.object({
  board_id: z.string().min(1, "board_id is required"),
  column_id: z.string().min(1, "column_id is required"),
  aggregation: z.string().nullable().default(null),
});

export const mirrorSettingsSchema = z.object({
  source_connect_column_id: z.string().min(1, "Connect Boards column id is required"),
  mirrored_column_id: z.string().optional().nullable(),
  mirrored_columns: z.array(mirroredColumnSchema).default([]),
  display_config: mirrorDisplayConfigSchema.default({ aggregation: null }),
}).superRefine((data, ctx) => {
  const hasSingle = (data.mirrored_column_id ?? "").trim().length > 0;
  const hasMulti = data.mirrored_columns.length > 0;
  if (!hasSingle && !hasMulti) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["settings"],
      message: "A mirror column requires at least one mirrored column.",
    });
  }
});

export type MirrorSettingsInput = z.infer<typeof mirrorSettingsSchema>;

// Validate `connect_board` AND `mirror` settings at the column-mutation boundary.
// For every other type the settings bag stays a free-form record.
export const addColumnSchemaWithConnectBoard = addColumnSchema.superRefine((input, ctx) => {
  if (input.type !== "connected_board") {
    if (input.type === "mirror") {
      const parsed = mirrorSettingsSchema.safeParse(input.settings ?? {});
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["settings", ...issue.path],
            message: issue.message,
          });
        }
        return;
      }
      const hasSingle = (parsed.data.mirrored_column_id ?? "").trim().length > 0;
      const hasMulti = parsed.data.mirrored_columns.length > 0;
      if (!hasSingle && !hasMulti) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["settings"],
          message: "A mirror column requires at least one mirrored column.",
        });
      }
      return;
    }
    return;
  }
  const parsed = connectedBoardSettingsSchema.safeParse(input.settings ?? {});
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settings", ...issue.path],
        message: issue.message,
      });
    }
    return;
  }
  if (parsed.data.connected_board_ids.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["settings", "connected_board_ids"],
      message: "At least one connected board is required.",
    });
  }
});

// ── Rename Column ──────────────────────────────────────────

export const renameColumnSchema = z.object({
  columnId: entityId,
  label: nonEmptyString.max(255),
});

export type RenameColumnInput = z.infer<typeof renameColumnSchema>;

// ── Duplicate Column ───────────────────────────────────────

export const duplicateColumnSchema = z.object({
  columnId: entityId,
  includeValues: z.boolean().default(true),
});

export type DuplicateColumnInput = z.infer<typeof duplicateColumnSchema>;

// ── Delete Column ──────────────────────────────────────────

export const deleteColumnSchema = z.object({
  columnId: entityId,
  /** If true, also clean up cell values for this column */
  cascade: z.boolean().default(true),
  /** If true, permanently delete */
  permanent: z.boolean().default(false),
});

export type DeleteColumnInput = z.infer<typeof deleteColumnSchema>;

// ── Reorder Columns ────────────────────────────────────────

export const reorderColumnsSchema = z.object({
  boardId,
  columns: z.array(columnOrderEntrySchema).min(1, "At least one column order entry is required"),
});

export type ReorderColumnsInput = z.infer<typeof reorderColumnsSchema>;

// ── Hide Columns ──────────────────────────────────────────

export const hideColumnsSchema = z.object({
  columnIds: z.array(entityId).min(1, "At least one column ID is required"),
  hidden: z.boolean(),
});

export type HideColumnsInput = z.infer<typeof hideColumnsSchema>;

// ── Freeze Columns ─────────────────────────────────────────

export const freezeColumnSchema = z.object({
  columnId: entityId,
  frozen: z.boolean(),
});

export type FreezeColumnInput = z.infer<typeof freezeColumnSchema>;

// ── Change Column Type ─────────────────────────────────────

export const changeColumnTypeSchema = z.object({
  columnId: entityId,
  newType: columnTypeSchema,
  /** If true, preview the migration without executing */
  preview: z.boolean().default(false),
});

export type ChangeColumnTypeInput = z.infer<typeof changeColumnTypeSchema>;

// ── Update Column Options ──────────────────────────────────

export const updateColumnOptionsSchema = z.object({
  columnId: entityId,
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    color: z.string().optional(),
  })).min(1, "At least one option is required"),
});

export type UpdateColumnOptionsInput = z.infer<typeof updateColumnOptionsSchema>;

