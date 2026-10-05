import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Board Access Control — Open By Default, Restricted By Exception
 *
 * ── Model Summary ───────────────────────────────────────────
 * - Every board is open by default: all workspace members can view it.
 * - A board with `is_restricted = true` requires an explicit grant
 *   (board_access_overrides, access = 'granted') for non-admin users.
 * - The workspace owner (OWNER_EMAIL = rujutapethe@gmail.com) always
 *   has full access to every board in every workspace.
 * - Admin rights are configurable via the `board_admins` table so they
 *   can be transferred or extended without a code change.
 * ────────────────────────────────────────────────────────────
 */

/**
 * The workspace owner / admin who always has full access to every board
 * and is the only one (besides other admins) who can manage restrictions.
 *
 * To extend admin rights to additional people, insert rows into
 * `board_admins` with role = 'admin' (or 'owner' to transfer ownership).
 */
export const OWNER_EMAIL = "rujutapethe@gmail.com";

/**
 * Resolve a user's email to their Supabase auth user_id.
 * Falls back to `auth.users` lookup.
 */
export async function resolveUserByEmail(email: string): Promise<string | null> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("auth.users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error || !data) {
    // Fallback: try the `users` view if it exists
    const fallback = await svc
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (fallback.error || !fallback.data) {
      console.error("[board-access] Failed to resolve user by email:", email, error ?? fallback.error);
      return null;
    }
    return fallback.data.id as string;
  }

  return data.id as string;
}

/**
 * Check whether the given user is the workspace owner (by email).
 * The owner is identified by OWNER_EMAIL in auth.users.
 */
export async function isOwner(userId: string): Promise<boolean> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("auth.users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
}

/**
 * Check whether the given user is an owner or admin for the given workspace.
 * Reads the `board_admins` table (configurable) plus the hardcoded owner check.
 *
 * This is the single source of truth for "can this person manage boards /
 * access requests / restrictions?"
 */
export async function canManageWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  // Fast path: owner always has full access
  if (await isOwner(userId)) return true;

  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("board_admins")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (error) {
    console.error("[board-access] board_admins lookup failed:", error.message);
    return false;
  }

  return !!data;
}

/**
 * Check whether a user has an explicit grant for a restricted board.
 */
export async function hasExplicitAccess(userId: string, boardId: string): Promise<boolean> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("board_access_overrides")
    .select("access")
    .eq("board_id", boardId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Table might not exist yet; treat as "no explicit grant"
    return false;
  }

  return data?.access === "granted";
}

/**
 * Check whether a board is restricted.
 *
 * Returns `null` when the restriction flag cannot be read — a query failure, a
 * missing row, or a schema without the column. That is deliberately *not* the
 * same answer as `false`: "the board is not restricted" and "we could not find
 * out" lead to different decisions, and collapsing them makes a transient
 * database error look like an open-by-default board. Callers must deny on
 * `null`.
 */
export async function isBoardRestricted(
  boardId: string,
): Promise<boolean | null> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("boards")
    .select("is_restricted")
    .eq("id", boardId)
    .maybeSingle();

  if (error || !data) return null;
  return !!data.is_restricted;
}

/**
 * Gate a user's access to a board.
 *
 * - Owner: always allowed.
 * - Non-restricted boards: allowed (open by default).
 * - Restricted boards: allowed only if the user has an explicit grant
 *   or is an admin/owner of the workspace.
 * - Unknown: denied. If the restriction flag cannot be read, this function
 *   cannot tell a restricted board from an open one, and the safe answer to
 *   that is no.
 */
export async function canUserAccessBoard(
  userId: string,
  boardId: string,
  workspaceId: string,
): Promise<boolean> {
  // Owner always has access
  if (await isOwner(userId)) return true;

  // Check if board is restricted
  const restricted = await isBoardRestricted(boardId);

  // Fail closed: only an explicit "not restricted" opens the board by default.
  if (restricted === null) return false;
  if (!restricted) return true;

  // Admins can access restricted boards without explicit grant
  if (await canManageWorkspace(userId, workspaceId)) return true;

  // Otherwise, check for an explicit grant
  return hasExplicitAccess(userId, boardId);
}

/**
 * Get the workspace ID for a board.
 */
export async function getBoardWorkspaceId(boardId: string): Promise<string | null> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from("boards")
    .select("workspace_id")
    .eq("id", boardId)
    .maybeSingle();

  if (error || !data) return null;
  return data.workspace_id as string;
}

/**
 * Check whether a user is the workspace owner by checking their email
 * directly (without a DB lookup). Useful for client-side checks.
 */
export function isOwnerEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return email.toLowerCase() === OWNER_EMAIL.toLowerCase();
}
