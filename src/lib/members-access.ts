import "server-only";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/board-access";
import type { AccessRole } from "@/lib/members-types";

/**
 * Server-side access resolution for the Members & access feature.
 *
 * All of it goes through the `resolve_*` / `can_manage_members` RPCs added in
 * migration 20261005120000_members_and_access_management.sql, so the API and the
 * UI cannot disagree about what somebody can do.
 *
 * These RPCs resolve `auth.uid()` from the caller's own JWT, so they must be
 * invoked with a **user-scoped** client. Calling them with the service client
 * would present `auth.uid() = null` and every check would fail closed.
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

/** The caller's own access on a board, or on the workspace when boardId is null. */
export async function resolveCallerAccess(
  userId: string,
  workspaceId: string,
  boardId?: string | null,
): Promise<AccessRole | null> {
  if (!workspaceId) return null;

  // Fast path that needs no round trip: the hardcoded workspace owner.
  if (await isOwner(userId)) return "owner";

  const db = (await createClient()) as unknown as UserScopedClient;

  if (boardId) {
    const { data, error } = await db.rpc("resolve_board_access", {
      p_board_id: boardId,
      p_user_id: userId,
    });
    if (error) {
      console.warn("[members-access] resolve_board_access failed:", error.message);
      return null;
    }
    return toAccessLevel(data);
  }

  const { data, error } = await db.rpc("resolve_workspace_access", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
  if (error) {
    console.warn("[members-access] resolve_workspace_access failed:", error.message);
    return null;
  }
  return toAccessLevel(data);
}

/** Owner and edit can change memberships; view cannot. */
export async function canManageMembers(
  userId: string,
  workspaceId: string,
  boardId?: string | null,
): Promise<boolean> {
  const level = await resolveCallerAccess(userId, workspaceId, boardId);
  return level === "owner" || level === "edit";
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