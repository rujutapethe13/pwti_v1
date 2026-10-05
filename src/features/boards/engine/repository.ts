import "server-only";

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { OWNER_EMAIL } from "@/lib/board-access";

import type { DemoBoardPageData } from "./demo-data";
import type { BoardDefinition, BoardRecord, ColumnDefinition, ColumnValue, BoardView, Group, BoardRole } from "./types";

type DatabaseRow = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

function asRecord(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : fallback;
}

function toBoardDefinition(row: DatabaseRow): BoardDefinition {
  const id = asString(row.id);
  const slug = asString(row.slug, id);

  return {
    id,
    organizationId: asString(row.organization_id ?? row.organizationId),
    workspaceId: asString(row.workspace_id ?? row.workspaceId),
    slug,
    name: asString(row.name, slug),
    description: asString(row.description),
    templateId: asString(row.template_id ?? row.templateId) || undefined,
    icon: undefined,
    favorite: asBoolean(row.favorite),
    pinned: asBoolean(row.pinned),
    visibility: asString(row.visibility, "workspace") as BoardDefinition["visibility"],
    status: asString(row.status, "active") as BoardDefinition["status"],
    sharedWith: asStringArray(row.shared_with ?? row.sharedWith, ["owner", "editor", "viewer"]) as BoardDefinition["sharedWith"],
    isRestricted: asBoolean(row.is_restricted),
    primaryColumnLabel: asString(row.primary_column_label ?? row.primaryColumnLabel) || undefined,
       createdAt: asString(row.created_at ?? row.createdAt),
       updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

function toColumnDefinition(row: DatabaseRow): ColumnDefinition {
  return {
    id: asString(row.id),
    boardId: asString(row.board_id ?? row.boardId),
    key: asString(row.key),
    label: asString(row.label, asString(row.key)),
    description: asString(row.description) || undefined,
    type: asString(row.type, "text") as ColumnDefinition["type"],
    required: asBoolean(row.required),
    hidden: asBoolean(row.hidden),
    frozen: asBoolean(row.frozen),
    defaultValue: (row.default_value ?? row.defaultValue ?? null) as ColumnValue,
    settings: asRecord(row.settings),
    permissions: asRecord(row.permissions, {
      view: ["owner", "editor", "commenter", "viewer"],
      edit: ["owner", "editor"],
      configure: ["owner"],
    }) as unknown as ColumnDefinition["permissions"],
    validation: Array.isArray(row.validation) ? (row.validation as ColumnDefinition["validation"]) : [],
    version: asNumber(row.version, 1),
    order: asNumber(row.order),
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

function toBoardRecord(row: DatabaseRow): BoardRecord {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id ?? row.organizationId),
    workspaceId: asString(row.workspace_id ?? row.workspaceId),
    boardId: asString(row.board_id ?? row.boardId),
    groupId: asString(row.group_id ?? row.groupId) || null,
    title: asString(row.title, asString(row.name, "Untitled record")),
    status: asString(row.status, "active") as BoardRecord["status"],
    version: asNumber(row.version, 1),
    archivedAt: asString(row.archived_at ?? row.archivedAt) || null,
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

function toCellEntry(row: DatabaseRow): [string, ColumnValue] | null {
  const recordId = asString(row.record_id ?? row.recordId);
  const columnId = asString(row.column_id ?? row.columnId);

  if (!recordId || !columnId) {
    return null;
  }

  return [`${recordId}:${columnId}`, (row.value ?? row.value_json ?? row.valueText ?? row.value_text ?? null) as ColumnValue];
}

function toBoardView(row: DatabaseRow): BoardView {
  return {
    id: asString(row.id),
    boardId: asString(row.board_id ?? row.boardId),
    name: asString(row.name),
    description: asString(row.description) || undefined,
    type: asString(row.type, "table") as BoardView["type"],
    visibility: asString(row.visibility, "shared") as BoardView["visibility"],
    filters: Array.isArray(row.filters) ? (row.filters as BoardView["filters"]) : [],
    sorting: Array.isArray(row.sorting) ? (row.sorting as BoardView["sorting"]) : [],
    grouping: Array.isArray(row.grouping) ? (row.grouping as BoardView["grouping"]) : [],
    visibleColumnIds: Array.isArray(row.visible_column_ids ?? row.visibleColumnIds)
      ? (row.visible_column_ids ?? row.visibleColumnIds) as string[]
      : [],
    columnWidths: asRecord(row.column_widths ?? row.columnWidths) as Record<string, number>,
    rowHeight: asNumber(row.row_height ?? row.rowHeight, 44),
    settings: asRecord(row.settings ?? (row as Record<string, unknown>).settings) as BoardView["settings"],
    personalOwnerUserId: asString(row.personal_owner_user_id ?? row.personalOwnerUserId) || null,
    sharedWith: Array.isArray(row.shared_with ?? row.sharedWith)
      ? (row.shared_with ?? row.sharedWith) as BoardRole[]
      : ["owner", "editor", "viewer"],
    isDefault: asBoolean(row.is_default ?? row.isDefault),
    order: asNumber(row.sort_order ?? row.order),
    createdAt: asString(row.created_at ?? row.createdAt),
    updatedAt: asString(row.updated_at ?? row.updatedAt),
  };
}

function toGroup(row: DatabaseRow): Group {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id ?? row.organizationId),
    workspaceId: asString(row.workspace_id ?? row.workspaceId),
    boardId: asString(row.board_id ?? row.boardId),
    parentGroupId: asString(row.parent_group_id ?? row.parentGroupId) || null,
    name: asString(row.name),
    color: asString(row.color) || undefined,
    collapsed: asBoolean(row.collapsed),
    order: asNumber(row.sort_order ?? row.order),
    status: asString(row.status, "active") as Group["status"],
    permissions: row.permissions ? (row.permissions as Group["permissions"]) : undefined,
    statusOptions: row.status_options
      ? (row.status_options as Group["statusOptions"])
      : undefined,
  };
}

export async function loadBoardBySlug(
  boardSlug: string,
  options?: {
    recordLimit?: number;
    recordOffset?: number;
  },
): Promise<DemoBoardPageData | undefined> {
  const supabase = await createServiceClient();

  console.warn(`[loadBoardBySlug] Querying board with slug: "${boardSlug}"`);

  const { data: boardRow, error: boardError } = await supabase
    .from("boards")
    .select("*")
    .eq("slug", boardSlug)
    .maybeSingle();

  if (boardError) {
    console.error(`[loadBoardBySlug] Board query error for "${boardSlug}":`, boardError);
    return undefined;
  }

  if (!boardRow) {
    console.warn(`[loadBoardBySlug] No board found with slug: "${boardSlug}"`);
    return undefined;
  }

  console.warn(`[loadBoardBySlug] Found board: ${boardRow.id} (${boardRow.name})`);

  const recordLimit = options?.recordLimit ?? 100;
  const recordOffset = options?.recordOffset ?? 0;

  const [{ data: columnRows, error: columnError }, { data: recordRows, error: recordError, count: recordCount }, { data: cellRows, error: cellError }, { data: viewRows, error: viewError }, { data: groupRows, error: groupError }] = await Promise.all([
    supabase.from("columns").select("*").eq("board_id", boardRow.id).order("sort_order", { ascending: true }),
    supabase
      .from("records")
      .select("*", { count: "exact" })
      .eq("board_id", boardRow.id)
      .order("created_at", { ascending: true })
      .range(recordOffset, recordOffset + recordLimit - 1),
    supabase.from("cell_values").select("*").eq("board_id", boardRow.id),
    supabase.from("views").select("*").eq("board_id", boardRow.id).order("sort_order", { ascending: true }),
    supabase.from("groups").select("*").eq("board_id", boardRow.id).order("sort_order", { ascending: true }),
  ]);

  if (columnError) {
    console.error(`[loadBoardBySlug] Columns query error for board ${boardRow.id}:`, columnError);
    return undefined;
  }
  if (recordError) {
    console.error(`[loadBoardBySlug] Records query error for board ${boardRow.id}:`, recordError);
    return undefined;
  }
  if (cellError) {
    console.error(`[loadBoardBySlug] Cell values query error for board ${boardRow.id}:`, cellError);
    return undefined;
  }
  if (viewError) {
    console.error(`[loadBoardBySlug] Views query error for board ${boardRow.id}:`, viewError);
    return undefined;
  }
  if (groupError) {
    console.error(`[loadBoardBySlug] Groups query error for board ${boardRow.id}:`, groupError);
    return undefined;
  }

  console.warn(`[loadBoardBySlug] Board ${boardRow.id} data: ${(columnRows ?? []).length} columns, ${(recordRows ?? []).length} records (of ${recordCount ?? 0} total), ${(cellRows ?? []).length} cells, ${(viewRows ?? []).length} views, ${(groupRows ?? []).length} groups`);

  const cellValues: Array<[string, ColumnValue]> = [];
  for (const row of cellRows ?? []) {
    const entry = toCellEntry(row as DatabaseRow);
    if (entry) {
      cellValues.push(entry);
    }
  }

  const views = (viewRows ?? []).map((row) => toBoardView(row as DatabaseRow));

  return {
    board: toBoardDefinition(boardRow as DatabaseRow),
    description: asString((boardRow as DatabaseRow).description),
    metrics: [],
    columns: (columnRows ?? []).map((row) => toColumnDefinition(row as DatabaseRow)),
    records: (recordRows ?? []).map((row) => toBoardRecord(row as DatabaseRow)),
    cellValues,
    views,
    groups: (groupRows ?? []).map((row) => toGroup(row as DatabaseRow)),
    recordCount: recordCount ?? (recordRows ?? []).length,
    recordOffset,
  };
}

export async function upsertBoard(data: BoardDefinition): Promise<BoardDefinition> {
  const supabase = await createServiceClient();

  const { error } = await supabase.from("boards").upsert({
    id: data.id,
    organization_id: data.organizationId,
    workspace_id: data.workspaceId,
     slug: data.slug,
     name: data.name,
     description: data.description,
     template_id: data.templateId ?? null,
     icon: null,
     favorite: data.favorite,
     pinned: data.pinned,
     visibility: data.visibility,
     status: data.status,
     shared_with: data.sharedWith,
     primary_column_label: data.primaryColumnLabel ?? null,
     updated_at: data.updatedAt,
     created_at: data.createdAt,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertBoardColumns(boardId: string, organizationId: string, workspaceId: string, columns: ColumnDefinition[]): Promise<void> {
  const supabase = await createServiceClient();

  const payload = columns.map((column) => ({
    id: column.id,
    organization_id: organizationId,
    workspace_id: workspaceId,
    board_id: boardId,
    key: column.key,
    label: column.label,
    description: column.description ?? null,
    type: column.type,
    required: column.required,
    hidden: column.hidden,
    frozen: column.frozen,
    default_value: column.defaultValue,
    settings: column.settings,
    permissions: column.permissions,
    validation: column.validation,
    version: column.version,
    sort_order: column.order,
    created_at: column.createdAt,
    updated_at: column.updatedAt,
  }));

  const { error } = await supabase.from("columns").upsert(payload);

  if (error) {
    throw error;
  }
}

export async function upsertBoardRecords(boardId: string, organizationId: string, workspaceId: string, records: BoardRecord[]): Promise<void> {
  const supabase = await createServiceClient();

  const payload = records.map((record) => ({
    id: record.id,
    organization_id: organizationId,
    workspace_id: workspaceId,
    board_id: boardId,
    group_id: record.groupId ?? null,
    title: record.title,
    status: record.status,
    version: record.version,
    archived_at: record.archivedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }));

  const { error } = await supabase.from("records").upsert(payload);

  if (error) {
    throw error;
  }
}

export async function upsertBoardCellValues(boardId: string, organizationId: string, workspaceId: string, cellValues: Array<[string, ColumnValue]>): Promise<void> {
  const supabase = await createServiceClient();

  const payload = cellValues.map(([key, value]) => {
    const [recordId, columnId] = key.split(":");
    return {
      id: `${boardId}:${recordId}:${columnId}`,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: boardId,
      record_id: recordId,
      column_id: columnId,
      value,
      value_text: typeof value === "string" ? value : JSON.stringify(value),
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from("cell_values").upsert(payload);

  if (error) {
    throw error;
  }
}

/**
 * Check whether the current authenticated user has access to a board (by slug).
 *
 * Open-by-default model:
 *  - Boards with is_restricted = false → everyone in the workspace can access.
 *  - Boards with is_restricted = true  → only owner, workspace admins, or users
 *    with an explicit board_access_overrides grant can access.
 *
 * Returns `{ allowed: true }` on open boards or when the user has access,
 * `{ allowed: false, reason }` when access is denied, and
 * `{ allowed: false, reason: "not_found" }` when the board doesn't exist.
 */
export async function checkBoardAccessBySlug(
  boardSlug: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const anonClient = await createClient(await cookies());

  const {
    data: { user },
  } = await anonClient.auth.getUser();

  if (!user) {
    return { allowed: false, reason: "authentication_required" };
  }

  const svc = await createServiceClient();

  const { data: boardRow, error: boardError } = await svc
    .from("boards")
    .select("id, workspace_id, is_restricted")
    .eq("slug", boardSlug)
    .maybeSingle();

  if (boardError || !boardRow) {
    return { allowed: false, reason: "not_found" };
  }

  // The owner always has access everywhere. Read the one shared constant so
  // this check cannot drift from the one in board-access.ts.
  const userEmail = (user.email ?? "").toLowerCase();
  if (userEmail === OWNER_EMAIL.toLowerCase()) {
    return { allowed: true };
  }

  // Open by default — non-restricted boards are accessible to all workspace members
  if (!boardRow.is_restricted) {
    return { allowed: true };
  }

  // Restricted board: check for admin status or explicit override
  // Admins can be configured via board_admins table
  const { data: adminRow } = await svc
    .from("board_admins")
    .select("role")
    .eq("workspace_id", boardRow.workspace_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (adminRow) {
    return { allowed: true };
  }

  // Check for explicit access grant
  const { data: overrideRow } = await svc
    .from("board_access_overrides")
    .select("access")
    .eq("board_id", boardRow.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (overrideRow?.access === "granted") {
    return { allowed: true };
  }

  return { allowed: false, reason: "access_denied" };
}