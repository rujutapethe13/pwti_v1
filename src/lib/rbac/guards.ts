import "server-only";

import { redirect } from "next/navigation";

import {
  canEditBoard,
  canEditColumn,
  canEditWorkspace,
  canViewBoard,
  canViewWorkspace,
  getSessionIdentity,
} from "./resolve";

import type { AppRole, SessionIdentity } from "./types";

/**
 * Guards for anything that mutates.
 *
 * ── Why a server guard exists when the database already enforces ───────────
 * Because the app's own reads and writes go through the service_role key, which
 * bypasses RLS. Without this layer a forgotten RLS check in a server action
 * would be a real vulnerability rather than a caught mistake. These guards are
 * the second wall, not the first: the triggers in migration 03 still run on
 * every write, and they still refuse a client who reaches the table by some
 * other route.
 *
 * Each assert* returns a discriminated result rather than throwing, so route
 * handlers can map it to a status code and server components can map it to a
 * redirect, without catching exceptions they did not expect.
 */

export type GuardOk = { ok: true };
export type GuardDenied = { ok: false; status: number; reason: string };
export type GuardResult = GuardOk | GuardDenied;

function deny(status: number, reason: string): GuardDenied {
  return { ok: false, status, reason };
}

const UNAUTHENTICATED = deny(401, "Authentication required");
const FORBIDDEN = deny(403, "You do not have access to this");

/** Require a signed-in user. */
export async function assertAuthenticated(): Promise<
  { ok: true; identity: SessionIdentity } | GuardDenied
> {
  const identity = await getSessionIdentity();
  if (!identity) return UNAUTHENTICATED;
  return { ok: true, identity };
}

/**
 * Require one of the given roles.
 *
 * Only the super admin can create admins, and that rule is not expressible
 * here: it lives in the guard_role_change() trigger, because a role change can
 * also arrive from a direct table write that never goes through this file.
 */
export async function assertRole(...roles: AppRole[]): Promise<
  { ok: true; identity: SessionIdentity } | GuardDenied
> {
  const authed = await assertAuthenticated();
  if (!authed.ok) return authed;

  if (!roles.includes(authed.identity.role)) {
    return deny(403, `This action requires one of: ${roles.join(", ")}`);
  }

  return authed;
}

/** Require admin. Used by every screen that changes someone else's access. */
export async function assertAdmin(): Promise<
  { ok: true; identity: SessionIdentity } | GuardDenied
> {
  return assertRole("admin");
}

export async function assertWorkspaceView(workspaceId: string): Promise<GuardResult> {
  const authed = await assertAuthenticated();
  if (!authed.ok) return authed;
  if (!(await canViewWorkspace(workspaceId))) return FORBIDDEN;
  return { ok: true };
}

export async function assertWorkspaceEdit(workspaceId: string): Promise<GuardResult> {
  const authed = await assertAuthenticated();
  if (!authed.ok) return authed;
  if (!(await canEditWorkspace(workspaceId))) return FORBIDDEN;
  return { ok: true };
}

export async function assertBoardView(boardId: string): Promise<GuardResult> {
  const authed = await assertAuthenticated();
  if (!authed.ok) return authed;
  if (!(await canViewBoard(boardId))) {
    // 404 rather than 403: telling a client that a board exists but is not
    // theirs confirms the existence of a board they were never granted, which
    // is itself a leak. Same answer as a board that does not exist.
    return deny(404, "Board not found");
  }
  return { ok: true };
}

export async function assertBoardEdit(boardId: string): Promise<GuardResult> {
  const authed = await assertAuthenticated();
  if (!authed.ok) return authed;
  if (!(await canViewBoard(boardId))) return deny(404, "Board not found");
  if (!(await canEditBoard(boardId))) return FORBIDDEN;
  return { ok: true };
}

/**
 * Require write access to one column.
 *
 * The cell_values trigger enforces this in the database too; calling it here
 * means an unauthorised edit produces a clean 403 with a readable message
 * instead of a raised exception surfacing as a 500.
 */
export async function assertColumnEdit(
  boardId: string,
  columnId: string,
): Promise<GuardResult> {
  const authed = await assertAuthenticated();
  if (!authed.ok) return authed;
  if (!(await canEditColumn(boardId, columnId))) {
    return deny(403, "You do not have permission to edit this column");
  }
  return { ok: true };
}

// ── Route-handler and page conveniences ────────────────────────────────────

/** Map a GuardResult onto a Response. Unauthorised reads answer 404, not 403. */
export function guardResponse(result: GuardResult): Response | null {
  if (result.ok) return null;

  return new Response(
    JSON.stringify({ success: false, error: result.reason }),
    {
      status: result.status,
      headers: { "content-type": "application/json" },
    },
  );
}

/**
 * Page-level guard: redirect rather than render an error.
 *
 * Unauthenticated goes to sign-in. Authenticated-but-refused goes to the
 * access-required page, which is the same screen a user with no membership at
 * all sees — deliberately, because from the caller's side the two situations
 * are indistinguishable and should not look different.
 */
export async function requirePageAccess(
  check: () => Promise<GuardResult>,
): Promise<void> {
  const authed = await assertAuthenticated();
  if (!authed.ok) {
    redirect("/signin");
  }

  const result = await check();
  if (!result.ok) {
    redirect("/access-required");
  }
}