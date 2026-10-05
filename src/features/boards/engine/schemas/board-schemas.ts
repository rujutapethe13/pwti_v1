/**
 * Board CRUD Zod Schemas
 *
 * Validates all Board mutation inputs before they reach the service layer.
 * Every schema produces a typed output consumed by BoardService methods.
 */

import { z } from "zod";

// ── Reusable Primitives ─────────────────────────────────────

const entityId = z.string().min(1, "ID is required");
const organizationId = z.string().min(1, "Organization ID is required");
const workspaceId = z.string().min(1, "Workspace ID is required");
const nonEmptyString = z.string().min(1, "Value must not be empty");
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── Create Board ───────────────────────────────────────────

export const createBoardSchema = z.object({
  organizationId,
  workspaceId,
  name: nonEmptyString.max(255, "Board name must be 255 characters or fewer"),
  description: z.string().max(2000).default(""),
  templateId: z.string().optional(),
  visibility: z.enum(["private", "workspace", "org", "public"]).default("workspace"),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;

// ── Rename Board ───────────────────────────────────────────

export const renameBoardSchema = z.object({
  boardId: entityId,
  name: nonEmptyString.max(255),
  /** Auto-generate slug if true, otherwise keep existing */
  updateSlug: z.boolean().default(true),
});

export type RenameBoardInput = z.infer<typeof renameBoardSchema>;

// ── Duplicate Board ────────────────────────────────────────

export const duplicateBoardSchema = z.object({
  boardId: entityId,
  newName: nonEmptyString.max(255).optional(),
  /** Whether to copy records along with the schema */
  includeRecords: z.boolean().default(true),
});

export type DuplicateBoardInput = z.infer<typeof duplicateBoardSchema>;

// ── Archive Board ──────────────────────────────────────────

export const archiveBoardSchema = z.object({
  boardId: entityId,
});

export type ArchiveBoardInput = z.infer<typeof archiveBoardSchema>;

// ── Delete Board ───────────────────────────────────────────

export const deleteBoardSchema = z.object({
  boardId: entityId,
  /** If true, permanently delete instead of soft-delete */
  permanent: z.boolean().default(false),
});

export type DeleteBoardInput = z.infer<typeof deleteBoardSchema>;

// ── Favorite Board ─────────────────────────────────────────

export const favoriteBoardSchema = z.object({
  boardId: entityId,
  favorite: z.boolean(),
});

export type FavoriteBoardInput = z.infer<typeof favoriteBoardSchema>;

