/**
 * Group CRUD Zod Schemas
 *
 * Validates all Group mutation inputs before they reach the service layer.
 */

import { z } from "zod";

// ── Reusable Primitives ─────────────────────────────────────

const entityId = z.string().min(1, "ID is required");
const organizationId = z.string().min(1, "Organization ID is required");
const workspaceId = z.string().min(1, "Workspace ID is required");
const boardId = z.string().min(1, "Board ID is required");
const nonEmptyString = z.string().min(1, "Value must not be empty");

// ── Group Order Entry ──────────────────────────────────────

export const groupOrderEntrySchema = z.object({
  id: entityId,
  order: z.number().int().min(0),
});

// ── Create Group ───────────────────────────────────────────

export const createGroupSchema = z.object({
  organizationId,
  workspaceId,
  boardId,
  name: nonEmptyString.max(255, "Group name must be 255 characters or fewer"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color").optional(),
  parentGroupId: entityId.optional().nullable(),
  statusOptions: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(255),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

// ── Rename Group ───────────────────────────────────────────

export const renameGroupSchema = z.object({
  groupId: entityId,
  name: nonEmptyString.max(255),
});

export type RenameGroupInput = z.infer<typeof renameGroupSchema>;

// ── Reorder Groups ─────────────────────────────────────────

export const reorderGroupsSchema = z.object({
  boardId,
  groups: z.array(groupOrderEntrySchema).min(1, "At least one group order entry is required"),
});

export type ReorderGroupsInput = z.infer<typeof reorderGroupsSchema>;

// ── Move Group ─────────────────────────────────────────────

export const moveGroupSchema = z.object({
  groupId: entityId,
  targetBoardId: boardId,
  newOrder: z.number().int().min(0).optional(),
});

export type MoveGroupInput = z.infer<typeof moveGroupSchema>;

// ── Duplicate Group ────────────────────────────────────────

export const duplicateGroupSchema = z.object({
  groupId: entityId,
  includeRecords: z.boolean().default(true),
});

export type DuplicateGroupInput = z.infer<typeof duplicateGroupSchema>;

// ── Collapse / Expand Group ───────────────────────────────

export const collapseGroupSchema = z.object({
  groupId: entityId,
  collapsed: z.boolean(),
});

export type CollapseGroupInput = z.infer<typeof collapseGroupSchema>;

// ── Delete Group ───────────────────────────────────────────

export const deleteGroupSchema = z.object({
  groupId: entityId,
  /** If true, also delete records in the group */
  cascade: z.boolean().default(false),
  /** If true, permanently delete */
  permanent: z.boolean().default(false),
});

export type DeleteGroupInput = z.infer<typeof deleteGroupSchema>;

// ── Update Group Color ─────────────────────────────────────

export const updateGroupColorSchema = z.object({
  groupId: entityId,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color").nullable().optional(),
});

export type UpdateGroupColorInput = z.infer<typeof updateGroupColorSchema>;

// ── Update Group Status Options ────────────────────────────

export const updateGroupStatusOptionsSchema = z.object({
  groupId: entityId,
  statusOptions: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(255),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })),
});

export type UpdateGroupStatusOptionsInput = z.infer<typeof updateGroupStatusOptionsSchema>;

