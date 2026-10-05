/**
 * View CRUD Zod Schemas
 *
 * Validates all Board View mutation inputs before they reach the service layer.
 * Views define how data is presented (table, kanban, calendar, etc.)
 */

import { z } from "zod";

// ── Reusable Primitives ─────────────────────────────────────

const entityId = z.string().min(1, "ID is required");
const boardId = z.string().min(1, "Board ID is required");
const nonEmptyString = z.string().min(1, "Value must not be empty");

// ── Filter Schema ──────────────────────────────────────────

export const viewFilterSchema = z.object({
  columnId: entityId,
  operator: z.enum(["eq", "neq", "contains", "gt", "gte", "lt", "lte", "in", "is_empty", "not_empty"]),
  value: z.unknown().optional(),
});

// ── Sort Schema ────────────────────────────────────────────

export const viewSortSchema = z.object({
  columnId: entityId,
  direction: z.enum(["asc", "desc"]),
});

// ── Grouping Schema ────────────────────────────────────────

export const viewGroupingSchema = z.object({
  columnId: entityId,
  direction: z.enum(["asc", "desc"]).optional(),
});

// ── View Group By Schema (display-only, NOT BoardGroup) ────

export const viewGroupBySchema = z.object({
  columnId: entityId,
  boardGroupId: entityId.optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  collapsedGroupIds: z.array(entityId).default([]),
});

export type ViewGroupByInput = z.infer<typeof viewGroupBySchema>;

// ── View-Type-Specific Settings Schemas ────────────────────

export const kanbanViewSettingsSchema = z.object({
  groupBy: viewGroupBySchema,
  cardSize: z.enum(["compact", "normal", "wide"]).default("normal"),
  showCardCount: z.boolean().default(true),
  showEmptyGroups: z.boolean().default(true),
  collapsedColumns: z.array(entityId).default([]),
});

export const calendarViewSettingsSchema = z.object({
  dateColumnId: entityId,
  endDateColumnId: entityId.optional(),
  defaultView: z.enum(["month", "week", "day", "agenda"]).default("month"),
  firstDayOfWeek: z.union([z.literal(0), z.literal(1)]).default(1),
  showWeekends: z.boolean().default(true),
  showRecordCount: z.boolean().default(true),
});

export const timelineViewSettingsSchema = z.object({
  startDateColumnId: entityId,
  endDateColumnId: entityId,
  groupBy: viewGroupBySchema.optional(),
  defaultZoom: z.enum(["day", "week", "month", "quarter", "year"]).default("month"),
  showTodayMarker: z.boolean().default(true),
  showDependencies: z.boolean().default(false),
});

export const galleryViewSettingsSchema = z.object({
  imageColumnId: entityId,
  titleColumnId: entityId,
  subtitleColumnId: entityId.optional(),
  cardSize: z.enum(["compact", "normal", "wide"]).default("normal"),
  aspectRatio: z.enum(["1:1", "4:3", "16:9", "3:2"]).default("4:3"),
});

export const chartViewSettingsSchema = z.object({
  chartType: z.enum(["bar", "line", "pie", "area", "donut"]).default("bar"),
  labelColumnId: entityId,
  valueColumnId: entityId,
  colorColumnId: entityId.optional(),
  groupByColumnId: entityId.optional(),
  showLegend: z.boolean().default(true),
  showLabels: z.boolean().default(true),
  showGrid: z.boolean().default(true),
  stacked: z.boolean().default(false),
});

// ── View settings discriminated by type ─────────────────────

export const viewSettingsSchema = z.record(z.unknown()).default({});

// ── Create View ────────────────────────────────────────────

export const createViewSchema = z.object({
  boardId,
  organizationId: entityId.optional(),
  workspaceId: entityId.optional(),
  name: nonEmptyString.max(255),
  type: z.enum([
    "table", "kanban", "calendar", "chart", "dashboard",
    "form", "gallery", "timeline", "map", "gantt", "docs",
  ]),
  filters: z.array(viewFilterSchema).default([]),
  sorting: z.array(viewSortSchema).default([]),
  grouping: z.array(viewGroupingSchema).default([]),
  visibleColumnIds: z.array(entityId).default([]),
  columnWidths: z.record(z.number()).default({}),
  rowHeight: z.number().int().min(20).max(200).default(44),
  settings: viewSettingsSchema,
  visibility: z.enum(["personal", "shared"]).default("shared"),
  isDefault: z.boolean().default(false),
});

export type CreateViewInput = z.infer<typeof createViewSchema>;

// ── Update View Configuration ──────────────────────────────

export const updateViewSchema = z.object({
  viewId: entityId,
  name: nonEmptyString.max(255).optional(),
  filters: z.array(viewFilterSchema).optional(),
  sorting: z.array(viewSortSchema).optional(),
  grouping: z.array(viewGroupingSchema).optional(),
  visibleColumnIds: z.array(entityId).optional(),
  columnWidths: z.record(z.number()).optional(),
  rowHeight: z.number().int().min(20).max(200).optional(),
  settings: viewSettingsSchema.optional(),
});

export type UpdateViewInput = z.infer<typeof updateViewSchema>;

// ── Duplicate View ─────────────────────────────────────────

export const duplicateViewSchema = z.object({
  viewId: entityId,
  newName: nonEmptyString.max(255).optional(),
});

export type DuplicateViewInput = z.infer<typeof duplicateViewSchema>;

// ── Set Default View ───────────────────────────────────────

export const setDefaultViewSchema = z.object({
  boardId,
  viewId: entityId,
});

export type SetDefaultViewInput = z.infer<typeof setDefaultViewSchema>;

// ── Delete View ────────────────────────────────────────────

export const deleteViewSchema = z.object({
  viewId: entityId,
});

export type DeleteViewInput = z.infer<typeof deleteViewSchema>;

// ── Update View Settings (type-specific) ───────────────────

export const updateViewSettingsSchema = z.object({
  viewId: entityId,
  settings: viewSettingsSchema,
});

export type UpdateViewSettingsInput = z.infer<typeof updateViewSettingsSchema>;

