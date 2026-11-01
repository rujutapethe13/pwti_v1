import "server-only";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/board-access";
import type { AccessRole } from "@/lib/members-types";

/**
 * Server-side access resolution for the Members & access feature.
 *
 * Uses the `resolve_*` / `can_manage_members` RPCs added in migration
 * 20261005120000_members_and_access_management.sql, with a direct service-client
 * fallback so a schema/cast mismatch in an unapplied database migration never
 * locks owners or editors out of member management.
 */

/** Interpret a raw RPC result as an access level, or null. */
export function toAccessLevel(value: unknown): AccessRole | null {
  return value === "owner" || value === "edit" || value === "view" ? value : null;
}

interface UserScopedClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function resolveAccessViaTables(
  userId: string,
  workspaceId: string,
  boardId?: string | null,
): Promise<AccessRole | null> {
  try {
    const svc = await createServiceClient();

    const { data: ws } = await svc
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .maybeSingle();

    if (ws?.owner_id === userId) {
      return "owner";
    }

    if (boardId) {
      const { data: override } = await svc
        .from("board_member_overrides")
        .select("access")
        .eq("board_id", boardId)
        .eq("user_id", userId)
        .maybeSingle();

      const overrideLevel = toAccessLevel(override?.access);
      if (overrideLevel) return overrideLevel;
    }

    const { data: member } = await svc
      .from("workspace_members")
      .select("role, can_edit, can_view")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!member) return null;
    if (member.role === "admin" || member.role === "staff" || member.can_edit === true) {
      return "edit";
    }
    if (member.can_view !== false) {
      return "view";
    }
    return null;
  } catch (err) {
    console.warn("[members-access] table fallback failed:", err);
    return null;
  }
}

/** The caller's own access on a board, or on the workspace when boardId is null. */
export async function resolveCallerAccess(
  userId: string,
  workspaceId: string,
  boardId?: string | null,
): Promise<AccessRole | null> {
  if (!workspaceId) return null;

  // Fast path that needs no round trip: the hardcoded workspace owner.
  if (await isOwner(userId)) return "owner";

  try {
    const db = (await createClient()) as unknown as UserScopedClient;

    if (boardId) {
      const { data, error } = await db.rpc("resolve_board_access", {
        p_board_id: boardId,
        p_user_id: userId,
      });
      if (!error) {
        const resolved = toAccessLevel(data);
        if (resolved) return resolved;
      } else {
        console.warn("[members-access] resolve_board_access failed:", error.message);
      }
    } else {
      const { data, error } = await db.rpc("resolve_workspace_access", {
        p_workspace_id: workspaceId,
        p_user_id: userId,
      });
      if (!error) {
        const resolved = toAccessLevel(data);
        if (resolved) return resolved;
      } else {
        console.warn("[members-access] resolve_workspace_access failed:", error.message);
      }
    }
  } catch (err) {
    console.warn("[members-access] RPC client error:", err);
  }

  return resolveAccessViaTables(userId, workspaceId, boardId);
}

/** Owner and edit can change memberships; view cannot. A workspace admin can
 * always manage members too, even on a board whose board-level grant is view,
 * so an admin is never locked out of the Members dialog by an inherited default. */
export async function canManageMembers(
  userId: string,
  workspaceId: string,
  boardId?: string | null,
): Promise<boolean> {
  const level = await resolveCallerAccess(userId, workspaceId, boardId);
  if (level === "owner" || level === "edit") return true;
  return canManageWorkspaceMembers(userId, workspaceId);
}

/**
 * Whether the caller is an owner/admin of the workspace itself (independent of any
 * board-level override). Backed by the `can_manage_workspace_members` RPC with a
 * table fallback so SQL cast issues never lock out an owner/editor.
 */
export async function canManageWorkspaceMembers(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  if (await isOwner(userId)) return true;

  try {
    const db = (await createClient()) as unknown as UserScopedClient;
    const { data, error } = await db.rpc("can_manage_workspace_members", {
      p_workspace_id: workspaceId,
    });
    if (!error && data === true) {
      return true;
    }
    if (error) {
      console.warn("[members-access] can_manage_workspace_members failed:", error.message);
    }
  } catch (err) {
    console.warn("[members-access] can_manage_workspace_members error:", err);
  }

  const wsLevel = await resolveAccessViaTables(userId, workspaceId, null);
  return wsLevel === "owner" || wsLevel === "edit";
}

/**
 * Invoke one of the guarded write RPCs as the signed-in user.
 *
 * Throws with the database's own message, which is written to be readable
 * ("the owner cannot be removed") rather than as a raw constraint name.
 */
export async function callMemberMutation(
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const db = (await createClient()) as unknown as UserScopedClient;
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** The workspace a board belongs to. Needed to scope every board-scope call. */
export async function getBoardWorkspaceId(boardId: string): Promise<string | null> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("boards")
    .select("workspace_id")
    .eq("id", boardId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.workspace_id as string | null) ?? null;
}

/** The display name for a workspace or board. */
export async function getSubjectName(
  scope: "workspace" | "board",
  workspaceId: string,
  boardId?: string | null,
): Promise<string> {
  const svc = await createServiceClient();

  if (scope === "board" && boardId) {
    const { data } = await svc.from("boards").select("name").eq("id", boardId).maybeSingle();
    if (data?.name) return data.name as string;
  }

  const { data } = await svc
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  return (data?.name as string | undefined) ?? "";
}
