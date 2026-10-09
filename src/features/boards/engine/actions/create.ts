"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { boardTemplates } from "../registry";

import type { BoardDefinition, BoardRecord, ColumnDefinition, ColumnValue, Group, BoardTemplate } from "../types";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function findTemplate(templateId: string): BoardTemplate | undefined {
  return boardTemplates.find((t) => t.id === templateId);
}

function toAppError(error: unknown): Error {
  if (error instanceof Error) return error;
  const anyErr = error as { code?: string; details?: string | null; hint?: string | null; message?: string } | null | undefined;
  const message = anyErr?.message ?? 'Unknown database error';
  const detail = [anyErr?.details, anyErr?.hint].filter(Boolean).join(' — ');
  return new Error(detail ? `${message} (${detail})` : message);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  const anyErr = error as { message?: string } | null | undefined;
  return anyErr?.message ?? fallback;
}

/**
 * The board creator is automatically an Owner of the board they created, and that
 * ownership overrides anything inherited from the workspace. Without it the
 * creator's board-level role is whatever their workspace role is, so an admin who
 * created a board could be downgraded to a viewer's access on their own board.
 *
 * Uses the caller's session to find the creator; if there is no caller (an
 * automated creation path) it falls back to the workspace owner. Never throws —
 * a board must not fail to be created because the owner assignment could not be
 * written.
 */
async function ensureBoardCreatorIsOwner(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  boardId: string,
  workspaceId: string,
): Promise<void> {
  let creatorId: string | null = null;
  try {
    const client = await createClient(await cookies());
    const { data: { user } } = await client.auth.getUser();
    creatorId = user?.id ?? null;
  } catch {
    creatorId = null;
  }

  let ownerId = creatorId;
  if (!ownerId) {
    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error || !ws) return;
    ownerId = (ws.owner_id as string | null) ?? null;
  }
  if (!ownerId) return;

  try {
    await supabase
      .from("board_member_overrides")
      .upsert(
        { board_id: boardId, user_id: ownerId, access: "owner", granted_by: ownerId },
        { onConflict: "board_id,user_id" },
      );
  } catch (err) {
    console.warn(
      `[ensureBoardCreatorIsOwner] could not assign board owner for board ${boardId}:`,
      toErrorMessage(err, "Unknown error"),
    );
  }
}

export async function createBoardWithDefaults(
  name: string,
  workspaceId: string,
  organizationId: string,
): Promise<{
  board: BoardDefinition;
  groups: Group[];
  columns: ColumnDefinition[];
  records: BoardRecord[];
  viewId: string;
}> {
  const supabase = await createServiceClient();

  const workspaceCheck = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  console.warn(`[createBoardWithDefaults] workspaceCheck`, {
    workspaceId,
    data: workspaceCheck.data,
    error: workspaceCheck.error,
  });

  if (workspaceCheck.error || !workspaceCheck.data) {
    const msg = workspaceCheck.error
      ? `Workspace not found: ${workspaceCheck.error.message}`
      : "Workspace not found. It may have been deleted.";
    throw new Error(msg);
  }

  const orgCheck = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgCheck.error || !orgCheck.data) {
    const msg = orgCheck.error
      ? `Organization not found: ${orgCheck.error.message}`
      : "Organization not found. It may have been deleted.";
    throw new Error(msg);
  }

  const boardId = generateId("board");
  const slug = generateSlug(name);
  const now = new Date().toISOString();

  const board: BoardDefinition = {
    id: boardId,
    organizationId,
    workspaceId,
    slug,
    name,
    description: "",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: now,
    updatedAt: now,
  };

  // Phase 1: Single default group
  const groups: Group[] = [
    {
      id: generateId("group"),
      organizationId,
      workspaceId,
      boardId,
      name: "Group Title",
      color: "#94a3b8",
      collapsed: false,
      order: 0,
      status: "active",
      statusOptions: [],
    },
  ];

  // Phase 1: Default columns in order - Item/Client Name, Job Type, Status, Date, Assigned To
  const columns: ColumnDefinition[] = [
    // Item/Client Name (primary text column) - this is handled specially in TableView as the record title
    // We still create a "name" column for the primary text field
    {
      id: generateId("col"),
      boardId,
      key: "name",
      label: "Item Name",
      type: "text",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "",
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    // Job Type (dropdown)
    {
      id: generateId("col"),
      boardId,
      key: "job_type",
      label: "Job Type",
      type: "dropdown",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "",
      settings: {
        options: [
          { id: "opt-retouching", label: "Retouching" },
          { id: "opt-compositing", label: "Compositing" },
          { id: "opt-color-grade", label: "Color Grade" },
          { id: "opt-delivery", label: "Delivery" },
        ],
      },
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
    // Status (status-type with Not Started/Working on it/Done - grey/orange/green)
    {
      id: generateId("col"),
      boardId,
      key: "status",
      label: "Status",
      type: "status",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "Not Started",
      settings: {
        options: [
          { id: "opt-not-started", label: "Not Started", color: "#94a3b8" },
          { id: "opt-working-on-it", label: "Working on it", color: "#f59e0b" },
          { id: "opt-done", label: "Done", color: "#22c55e" },
        ],
      },
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 2,
      createdAt: now,
      updatedAt: now,
    },
    // Date (date picker)
    {
      id: generateId("col"),
      boardId,
      key: "date",
      label: "Date",
      type: "date",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 3,
      createdAt: now,
      updatedAt: now,
    },
    // Assigned To (person)
    {
      id: generateId("col"),
      boardId,
      key: "assigned_to",
      label: "Assigned To",
      type: "person",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 4,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const viewId = generateId("view");

  const { error: boardError } = await supabase.from("boards").insert({
    id: board.id,
    organization_id: board.organizationId,
    workspace_id: board.workspaceId,
    slug: board.slug,
    name: board.name,
    description: board.description,
    favorite: board.favorite,
    pinned: board.pinned,
    visibility: board.visibility,
    status: board.status,
    shared_with: board.sharedWith,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
  });

  if (boardError) throw toAppError(boardError);

  await ensureBoardCreatorIsOwner(supabase, board.id, workspaceId);

  for (const group of groups) {
    const { error: groupError } = await supabase.from("groups").insert({
      id: group.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: group.boardId,
      parent_group_id: null,
      name: group.name,
      color: group.color ?? null,
      collapsed: group.collapsed,
      sort_order: group.order,
      status: group.status,
      status_options: group.statusOptions ?? [],
      created_at: now,
      updated_at: now,
    });

    if (groupError) throw toAppError(groupError);
  }

  const { error: columnsError } = await supabase.from("columns").insert(
    columns.map((col) => ({
      id: col.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: col.boardId,
      key: col.key,
      label: col.label,
      description: col.description ?? null,
      type: col.type,
      required: col.required,
      hidden: col.hidden,
      frozen: col.frozen,
      default_value: col.defaultValue,
      settings: col.settings,
      permissions: col.permissions,
      validation: col.validation,
      version: col.version,
      sort_order: col.order,
      created_at: col.createdAt,
      updated_at: col.updatedAt,
    })),
  );

  if (columnsError) throw toAppError(columnsError);

  const { error: viewError } = await supabase.from("views").insert({
    id: viewId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    board_id: boardId,
    name: "Table",
    type: "table",
    visibility: "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visible_column_ids: columns.map((c) => c.id),
    column_widths: {},
    row_height: 44,
    shared_with: ["owner", "editor", "viewer"],
    is_default: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });

  if (viewError) throw toAppError(viewError);

  console.warn(`[createBoardWithDefaults] Created board ${board.id} (${board.name}) in workspace ${workspaceId}`);

  return { board, groups, columns, records: [], viewId };
}

export async function createBoardFromTemplate(
  name: string,
  workspaceId: string,
  organizationId: string,
  templateId: string,
): Promise<{
  board: BoardDefinition;
  groups: Group[];
  columns: ColumnDefinition[];
  viewId: string;
}> {
  const supabase = await createServiceClient();

  const workspaceCheck = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceCheck.error || !workspaceCheck.data) {
    const msg = workspaceCheck.error
      ? `Workspace not found: ${workspaceCheck.error.message}`
      : "Workspace not found. It may have been deleted.";
    throw new Error(msg);
  }

  const orgCheck = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgCheck.error || !orgCheck.data) {
    const msg = orgCheck.error
      ? `Organization not found: ${orgCheck.error.message}`
      : "Organization not found. It may have been deleted.";
    throw new Error(msg);
  }

  const template = findTemplate(templateId);
  if (!template) {
    throw new Error(`Template "${templateId}" not found`);
  }

  const boardId = generateId("board");
  const slug = generateSlug(name);
  const now = new Date().toISOString();

  const board: BoardDefinition = {
    id: boardId,
    organizationId,
    workspaceId,
    slug,
    name,
    description: "",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: now,
    updatedAt: now,
  };

  const { error: boardError } = await supabase.from("boards").insert({
    id: board.id,
    organization_id: board.organizationId,
    workspace_id: board.workspaceId,
    slug: board.slug,
    name: board.name,
    description: board.description,
    favorite: board.favorite,
    pinned: board.pinned,
    visibility: board.visibility,
    status: board.status,
    shared_with: board.sharedWith,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
  });

  if (boardError) throw toAppError(boardError);

  await ensureBoardCreatorIsOwner(supabase, board.id, workspaceId);

  const groups: Group[] = [];
  const groupIdMap = new Map<string, string>();

  for (let i = 0; i < template.seed.groups.length; i++) {
    const g = template.seed.groups[i];
    const groupId = generateId("group");
    if (g.name) groupIdMap.set(g.name, groupId);
    const group: Group = {
      id: groupId,
      organizationId,
      workspaceId,
      boardId,
      parentGroupId: null,
      name: g.name ?? "",
      color: g.color,
      collapsed: false,
      order: i,
      status: "active",
      statusOptions: [],
    };
    groups.push(group);

    const { error: groupError } = await supabase.from("groups").insert({
      id: group.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: group.boardId,
      parent_group_id: null,
      name: group.name,
      color: group.color ?? null,
      collapsed: group.collapsed,
      sort_order: group.order,
      status: group.status,
      status_options: [],
      created_at: now,
      updated_at: now,
    });
    if (groupError) throw toAppError(groupError);
  }

  const columns: ColumnDefinition[] = [];
  for (let i = 0; i < template.seed.columns.length; i++) {
    const c = template.seed.columns[i];
    const columnId = generateId("col");
    const column: ColumnDefinition = {
      id: columnId,
      boardId,
      key: c.key ?? "",
      label: c.label ?? "",
      type: c.type as ColumnDefinition["type"],
      required: c.required ?? false,
      hidden: false,
      frozen: false,
      defaultValue: c.defaultValue ?? "",
      settings: c.settings ?? {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: i,
      createdAt: now,
      updatedAt: now,
    };
    columns.push(column);
  }

  if (columns.length > 0) {
    const { error: columnsError } = await supabase.from("columns").insert(
      columns.map((col) => ({
        id: col.id,
        organization_id: organizationId,
        workspace_id: workspaceId,
        board_id: col.boardId,
        key: col.key,
        label: col.label,
        description: col.description ?? null,
        type: col.type,
        required: col.required,
        hidden: col.hidden,
        frozen: col.frozen,
        default_value: col.defaultValue,
        settings: col.settings,
        permissions: col.permissions,
        validation: col.validation,
        version: col.version,
        sort_order: col.order,
        created_at: col.createdAt,
        updated_at: col.updatedAt,
      })),
    );
    if (columnsError) throw toAppError(columnsError);
  }

  const viewId = generateId("view");
  const defaultView = template.seed.views[0];
  const { error: viewError } = await supabase.from("views").insert({
    id: viewId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    board_id: boardId,
    name: defaultView?.name ?? "Table",
    type: defaultView?.type ?? "table",
    visibility: defaultView?.visibility ?? "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visible_column_ids: columns.map((c) => c.id),
    column_widths: {},
    row_height: 44,
    shared_with: ["owner", "editor", "viewer"],
    is_default: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });
  if (viewError) throw toAppError(viewError);

  console.warn(`[createBoardFromTemplate] Created board ${board.id} (${board.name}) from template ${templateId} in workspace ${workspaceId}`);

  return { board, groups, columns, viewId };
}

export async function createMultiLevelBoard(
  name: string,
  workspaceId: string,
  organizationId: string,
): Promise<{
  board: BoardDefinition;
  groups: Group[];
  columns: ColumnDefinition[];
  viewId: string;
}> {
  const supabase = await createServiceClient();

  const workspaceCheck = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceCheck.error || !workspaceCheck.data) {
    const msg = workspaceCheck.error
      ? `Workspace not found: ${workspaceCheck.error.message}`
      : "Workspace not found. It may have been deleted.";
    throw new Error(msg);
  }

  const orgCheck = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgCheck.error || !orgCheck.data) {
    const msg = orgCheck.error
      ? `Organization not found: ${orgCheck.error.message}`
      : "Organization not found. It may have been deleted.";
    throw new Error(msg);
  }

  const boardId = generateId("board");
  const slug = generateSlug(name);
  const now = new Date().toISOString();

  const board: BoardDefinition = {
    id: boardId,
    organizationId,
    workspaceId,
    slug,
    name,
    description: "",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: now,
    updatedAt: now,
  };

  const { error: boardError } = await supabase.from("boards").insert({
    id: board.id,
    organization_id: board.organizationId,
    workspace_id: board.workspaceId,
    slug: board.slug,
    name: board.name,
    description: board.description,
    favorite: board.favorite,
    pinned: board.pinned,
    visibility: board.visibility,
    status: board.status,
    shared_with: board.sharedWith,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
  });

  if (boardError) throw toAppError(boardError);

  await ensureBoardCreatorIsOwner(supabase, board.id, workspaceId);

  const topLevelGroups = [
    { name: "Backlog", color: "#64748b" },
    { name: "In Progress", color: "#0ea5e9" },
    { name: "Review", color: "#f59e0b" },
    { name: "Done", color: "#22c55e" },
  ];

  const groups: Group[] = [];
  const groupIdMap = new Map<string, string>();

  for (let i = 0; i < topLevelGroups.length; i++) {
    const g = topLevelGroups[i];
    const groupId = generateId("group");
    groupIdMap.set(g.name, groupId);
    const group: Group = {
      id: groupId,
      organizationId,
      workspaceId,
      boardId,
      parentGroupId: null,
      name: g.name,
      color: g.color,
      collapsed: false,
      order: i,
      status: "active",
      statusOptions: [],
    };
    groups.push(group);

    const { error: groupError } = await supabase.from("groups").insert({
      id: group.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: group.boardId,
      parent_group_id: null,
      name: group.name,
      color: group.color ?? null,
      collapsed: group.collapsed,
      sort_order: group.order,
      status: group.status,
      status_options: [],
      created_at: now,
      updated_at: now,
    });
    if (groupError) throw toAppError(groupError);
  }

  const subGroups = [
    { parent: "Backlog", name: "Ideas", color: "#94a3b8" },
    { parent: "Backlog", name: "Prioritized", color: "#64748b" },
    { parent: "In Progress", name: "Development", color: "#0ea5e9" },
    { parent: "In Progress", name: "Design", color: "#0ea5e9" },
    { parent: "In Progress", name: "QA", color: "#0ea5e9" },
    { parent: "Review", name: "Code Review", color: "#f59e0b" },
    { parent: "Review", name: "Design Review", color: "#f59e0b" },
    { parent: "Done", name: "Released", color: "#22c55e" },
    { parent: "Done", name: "Archived", color: "#22c55e" },
  ];

  for (let i = 0; i < subGroups.length; i++) {
    const sg = subGroups[i];
    const parentGroupId = groupIdMap.get(sg.parent);
    if (!parentGroupId) continue;

    const subGroupId = generateId("group");
    const subGroup: Group = {
      id: subGroupId,
      organizationId,
      workspaceId,
      boardId,
      parentGroupId,
      name: sg.name,
      color: sg.color,
      collapsed: false,
      order: i,
      status: "active",
      statusOptions: [],
    };
    groups.push(subGroup);

    const { error: groupError } = await supabase.from("groups").insert({
      id: subGroup.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: subGroup.boardId,
      parent_group_id: subGroup.parentGroupId,
      name: subGroup.name,
      color: subGroup.color ?? null,
      collapsed: subGroup.collapsed,
      sort_order: subGroup.order,
      status: subGroup.status,
      status_options: [],
      created_at: now,
      updated_at: now,
    });
    if (groupError) throw toAppError(groupError);
  }

  const columns: ColumnDefinition[] = [
    {
      id: generateId("col"),
      boardId,
      key: "title",
      label: "Title",
      type: "text",
      required: true,
      hidden: false,
      frozen: false,
      defaultValue: "",
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId("col"),
      boardId,
      key: "status",
      label: "Status",
      type: "status",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "Not Started",
      settings: {
        options: ["Not Started", "In Progress", "In Review", "Done"],
      },
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId("col"),
      boardId,
      key: "priority",
      label: "Priority",
      type: "dropdown",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "Medium",
      settings: { options: ["Low", "Medium", "High", "Critical"] },
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId("col"),
      boardId,
      key: "assigned_to",
      label: "Assigned To",
      type: "person",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "",
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId("col"),
      boardId,
      key: "due_date",
      label: "Due Date",
      type: "date",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: null,
      settings: {},
      permissions: {
        view: ["owner", "editor", "commenter", "viewer"],
        edit: ["owner", "editor"],
        configure: ["owner"],
      },
      validation: [],
      version: 1,
      order: 4,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const { error: columnsError } = await supabase.from("columns").insert(
    columns.map((col) => ({
      id: col.id,
      organization_id: organizationId,
      workspace_id: workspaceId,
      board_id: col.boardId,
      key: col.key,
      label: col.label,
      description: col.description ?? null,
      type: col.type,
      required: col.required,
      hidden: col.hidden,
      frozen: col.frozen,
      default_value: col.defaultValue,
      settings: col.settings,
      permissions: col.permissions,
      validation: col.validation,
      version: col.version,
      sort_order: col.order,
      created_at: col.createdAt,
      updated_at: col.updatedAt,
    })),
  );
  if (columnsError) throw toAppError(columnsError);

  const viewId = generateId("view");
  const { error: viewError } = await supabase.from("views").insert({
    id: viewId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    board_id: boardId,
    name: "Table",
    type: "table",
    visibility: "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visible_column_ids: columns.map((c) => c.id),
    column_widths: {},
    row_height: 44,
    shared_with: ["owner", "editor", "viewer"],
    is_default: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });
  if (viewError) throw toAppError(viewError);

  console.warn(`[createMultiLevelBoard] Created board ${board.id} (${board.name}) with nested groups in workspace ${workspaceId}`);

  return { board, groups, columns, viewId };
}

export async function createDashboardBoard(
  name: string,
  workspaceId: string,
  organizationId: string,
): Promise<{
  board: BoardDefinition;
  viewId: string;
}> {
  const supabase = await createServiceClient();

  const workspaceCheck = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceCheck.error || !workspaceCheck.data) {
    const msg = workspaceCheck.error
      ? `Workspace not found: ${workspaceCheck.error.message}`
      : "Workspace not found. It may have been deleted.";
    throw new Error(msg);
  }

  const orgCheck = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgCheck.error || !orgCheck.data) {
    const msg = orgCheck.error
      ? `Organization not found: ${orgCheck.error.message}`
      : "Organization not found. It may have been deleted.";
    throw new Error(msg);
  }

  const boardId = generateId("board");
  const slug = generateSlug(name);
  const now = new Date().toISOString();

  const board: BoardDefinition = {
    id: boardId,
    organizationId,
    workspaceId,
    slug,
    name,
    description: "",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: now,
    updatedAt: now,
  };

  const viewId = generateId("view");

  const { error: boardError } = await supabase.from("boards").insert({
    id: board.id,
    organization_id: board.organizationId,
    workspace_id: board.workspaceId,
    slug: board.slug,
    name: board.name,
    description: board.description,
    favorite: board.favorite,
    pinned: board.pinned,
    visibility: board.visibility,
    status: board.status,
    shared_with: board.sharedWith,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
  });

  if (boardError) throw toAppError(boardError);

  await ensureBoardCreatorIsOwner(supabase, board.id, workspaceId);

  const { error: viewError } = await supabase.from("views").insert({
    id: viewId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    board_id: boardId,
    name: "Dashboard",
    type: "dashboard",
    visibility: "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visible_column_ids: [],
    column_widths: {},
    row_height: 44,
    shared_with: ["owner", "editor", "viewer"],
    is_default: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });

  if (viewError) throw toAppError(viewError);

  console.warn(`[createDashboardBoard] Created dashboard board ${board.id} (${board.name}) in workspace ${workspaceId}`);

  return { board, viewId };
}