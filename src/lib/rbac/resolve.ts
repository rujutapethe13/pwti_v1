import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import type {
  AccessSnapshot,
  AppRole,
  BoardAccess,
  SessionIdentity,
  WorkspaceAccess,
} from "./types";

/**
 * RBAC resolution — server side only.
 *
 * ── The one rule that matters here ─────────────────────────────────────────
 * Every answer comes from the SQL helpers in migration 02, called over the
 * cookie-scoped anon client so the caller's real JWT reaches the database. The
 * TypeScript in this file never re-derives a permission rule; if it did, the
 * database and the app would eventually disagree and the weaker of the two
 * would be the one an attacker uses.
 *
 * The service-role key is deliberately NOT used for authorization. Under
 * service_role there is no end-user JWT, so auth.uid() is null and every helper
 * would return its deny answer. It is used only for reads that are already
 * scoped to an id the guards have approved.
 *
 * ── Failing closed ─────────────────────────────────────────────────────────
 * If an RPC errors, the result is treated as the deny answer, not the allow
 * one. An unreachable permission helper must not become an open door.
 */

/** Matches `is_super_admin()` in the database. */
export const SUPER_ADMIN_EMAIL = "rujutapethe@gmail.com";

type RpcFailure = { message: string } | null;

/**
 * Call one RBAC helper. Returns null on any error so callers can decide between
 * "deny" and "no data", which are different questions.
 */
async function callRpc<TResult>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<TResult | null> {
  try {
    const supabase = await createClient(await cookies());
    const { data, error } = await supabase.rpc(fn, (args ?? {}) as never);

    if (error) {
      console.error(`[rbac] rpc ${fn} failed: ${error.message}`);
      return null;
    }

    return (data as TResult) ?? null;
  } catch (error) {
    console.error(`[rbac] rpc ${fn} threw:`, error);
    return null;
  }
}

/** Call one of the table-returning client RPCs, always returning an array. */
async function callRpcRows<TResult>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<TResult[]> {
  const rows = await callRpc<TResult[]>(fn, args);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Resolve the caller's identity. Null means "not signed in".
 *
 * A signed-in user whose identity cannot be resolved still gets an object —
 * role 'client', no organization — so the shell can render the access-required
 * empty state instead of a 500.
 */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  let user: { id: string; email?: string; email_confirmed_at?: string | null } | null = null;

  try {
    const supabase = await createClient(await cookies());
    const result = await supabase.auth.getUser();
    user = result.data?.user ?? null;
  } catch (error) {
    console.error("[rbac] could not read session:", error);
    return null;
  }

  if (!user) return null;

  const [isSuperAdmin, role, organizationId] = await Promise.all([
    callRpc<boolean>("is_super_admin"),
    callRpc<string>("current_role"),
    callRpc<string>("current_org_id"),
  ]);

  const emailVerified = Boolean(user.email_confirmed_at);

  return {
    userId: user.id,
    email: user.email ?? null,
    emailVerified,
    // The database is authoritative here. A true value with an unverified
    // email is not possible by construction, but the check is kept so that a
    // future refactor of is_super_admin() cannot make the UI disagree with it.
    isSuperAdmin: isSuperAdmin === true && emailVerified,
    role: (role ?? "client") as AppRole,
    organizationId: organizationId ?? null,
  };
}

/** Workspaces the caller may see, with personal workspaces included or not. */
export async function listAccessibleWorkspaces(
  options: { includePersonal?: boolean } = {},
): Promise<WorkspaceAccess[]> {
  const rows = await callRpcRows<{
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    description: string;
    type: string;
    can_view: boolean;
    can_edit: boolean;
  }>("get_my_workspaces");

  return rows
    .filter((row) => (options.includePersonal ? true : row.type !== "personal"))
    .map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      type: row.type as WorkspaceAccess["type"],
      canView: row.can_view === true,
      canEdit: row.can_edit === true,
    }));
}

/** Boards the caller may see. Never includes boards from an ungranted client
 *  workspace, because get_my_boards() filters at the row level. */
export async function listAccessibleBoards(): Promise<BoardAccess[]> {
  const rows = await callRpcRows<{
    id: string;
    workspace_id: string;
    slug: string;
    name: string;
    icon: string | null;
    can_view: boolean;
    can_create: boolean;
    can_delete: boolean;
    can_edit_board: boolean;
  }>("get_my_boards");

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    icon: row.icon ?? null,
    canView: row.can_view === true,
    canCreate: row.can_create === true,
    canDelete: row.can_delete === true,
    canEditBoard: row.can_edit_board === true,
  }));
}

/**
 * Everything the shell needs in one call.
 *
 * `hasAnyWorkspace` is the flag the empty state hangs off: a signed-in user
 * with no membership gets the "ask your account manager" screen, which is a
 * correct outcome rather than a failure.
 */
export async function getAccessSnapshot(): Promise<AccessSnapshot> {
  const identity = await getSessionIdentity();

  if (!identity) {
    return {
      identity: null,
      workspaces: [],
      hasAnyWorkspace: false,
      isClient: false,
      isInternal: false,
    };
  }

  const workspaces = await listAccessibleWorkspaces({ includePersonal: true });

  return {
    identity,
    workspaces,
    hasAnyWorkspace: workspaces.length > 0,
    isClient: identity.role === "client",
    isInternal: identity.role === "admin" || identity.role === "staff",
  };
}

// ── Individual permission probes ───────────────────────────────────────────
// Each returns false on error. Use these for rendering; use the assert*
// variants in guards.ts for anything that mutates.

export async function canViewWorkspace(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;
  return (await callRpc<boolean>("can_view_workspace", { p_workspace_id: workspaceId })) === true;
}

export async function canEditWorkspace(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;
  return (await callRpc<boolean>("can_edit_workspace", { p_workspace_id: workspaceId })) === true;
}

export async function canViewBoard(boardId: string): Promise<boolean> {
  if (!boardId) return false;
  return (await callRpc<boolean>("can_view_board", { p_board_id: boardId })) === true;
}

export async function canEditBoard(boardId: string): Promise<boolean> {
  if (!boardId) return false;
  return (await callRpc<boolean>("can_edit_board", { p_board_id: boardId })) === true;
}

export async function canViewColumn(boardId: string, columnId: string): Promise<boolean> {
  if (!boardId || !columnId) return false;
  return (
    (await callRpc<boolean>("client_can_view_column", {
      p_board_id: boardId,
      p_column_id: columnId,
    })) === true
  );
}

export async function canEditColumn(boardId: string, columnId: string): Promise<boolean> {
  if (!boardId || !columnId) return false;
  return (
    (await callRpc<boolean>("client_can_edit_column", {
      p_board_id: boardId,
      p_column_id: columnId,
    })) === true
  );
}

/** Columns the caller may see on a board. Empty for an ungranted board. */
export async function listVisibleColumnIds(boardId: string): Promise<string[]> {
  if (!boardId) return [];
  const ids = await callRpc<string[]>("client_visible_column_ids", { p_board_id: boardId });
  return Array.isArray(ids) ? ids : [];
}

/**
 * Organization-wide surfaces — Overview analytics, client search, the activity
 * feed. Internal roles only, and scoped to the workspaces the caller can see.
 *
 * A client calling this gets an empty list rather than an error, because from
 * their side those surfaces do not exist.
 */
export async function listAnalyticsWorkspaceIds(): Promise<string[]> {
  const identity = await getSessionIdentity();
  if (!identity) return [];
  if (identity.role === "client") return [];

  const ids = await callRpc<string[]>("accessible_workspace_ids", {
    p_include_personal: false,
  });

  return Array.isArray(ids) ? ids : [];
}

/** Internal-only surfaces. Returns null for a client so callers can 403. */
export async function requireInternalRole(): Promise<SessionIdentity | null> {
  const identity = await getSessionIdentity();
  if (!identity) return null;
  if (identity.role !== "admin" && identity.role !== "staff") return null;
  return identity;
}

export type { RpcFailure };