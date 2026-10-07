import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  callMemberMutation,
  canManageMembers,
  getBoardWorkspaceId,
  getSubjectName,
  resolveCallerAccess,
} from "@/lib/members-access";
import {
  isValidEmail,
  type AccessRole,
  type GrantableAccess,
  type Member,
  type MemberCandidate,
  type MemberScope,
  type MembersPayload,
  type PendingInvite,
} from "@/lib/members-types";

/**
 * Members & access API.
 *
 *   GET    /api/members?scope=workspace&workspace_id=<id>[&q=<search>]
 *   GET    /api/members?scope=board&board_id=<id>[&q=<search>]
 *   POST   /api/members  { scope, workspace_id, board_id?, email, access }
 *   PATCH  /api/members  { action: ... }
 *   DELETE /api/members  { scope, workspace_id, board_id?, user_id }
 *
 * Reads happen through the service client so a workspace with no client RLS
 * policy on workspace_members still lists correctly; the permission check runs
 * first, from the session cookie, so the service client only ever sees rows the
 * caller was already entitled to. Writes go through the SECURITY DEFINER RPCs
 * as the signed-in user, so the database re-checks the caller's role on its own
 * — this route cannot grant itself authority it does not have.
 */

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function getCaller() {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function readScope(request: NextRequest): MemberScope | null {
  const scope = request.nextUrl.searchParams.get("scope");
  return scope === "workspace" || scope === "board" ? scope : null;
}

function displayName(raw: unknown, email: string): string {
  if (raw && typeof raw === "object") {
    const meta = raw as { full_name?: unknown; name?: unknown };
    if (typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
    if (typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  }
  return email.split("@")[0] || email;
}

/**
 * `ilike` treats % and _ as wildcards and PostgREST has no ESCAPE clause, so
 * they are stripped rather than escaped. Searching "a_b" matches "ab" instead of
 * failing.
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_\\]/g, "").trim();
}

interface WorkspaceMemberRow {
  user_id: string;
  role: string;
  can_edit: boolean;
  full_name: string | null;
  email: string;
}

interface OverrideRow {
  user_id: string;
  email: string;
  access: string;
}

/** Workspace members with their resolved display role, via the SQL resolver. */
async function loadWorkspaceMembers(workspaceId: string): Promise<{ members: Member[]; emails: Map<string, string> }> {
  const svc = await createServiceClient();

  const { data: rows, error } = await svc
    .from("workspace_members")
    .select("user_id, role, can_edit")
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  const list = (rows ?? []) as WorkspaceMemberRow[];

  const { data: workspace } = await svc
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();

  const ownerId = (workspace?.owner_id as string | undefined) ?? null;

  const emails = new Map<string, string>();
  const names = new Map<string, string>();
  const avatars = new Map<string, string>();
  const lastLoginAt = new Map<string, string | null>();
  const lastActiveAt = new Map<string, string | null>();
  const joinedAt = new Map<string, string | null>();
  const userIds = list.map((row) => row.user_id);
  if (ownerId) userIds.push(ownerId);

  if (userIds.length > 0) {
    const { data: profiles } = await svc
      .from("profiles")
      .select("id, full_name, email, avatar_url, last_login_at, last_active_at, created_at")
      .in("id", userIds);

    for (const profile of profiles ?? []) {
      const id = profile.id as string;
      const email = (profile.email as string | null)?.toLowerCase();
      if (email) emails.set(id, email);
      names.set(id, (profile.full_name as string | null)?.trim() || "");
      const avatar = (profile.avatar_url as string | null)?.trim();
      if (avatar) avatars.set(id, avatar);
      lastLoginAt.set(id, (profile.last_login_at as string | null) ?? null);
      lastActiveAt.set(id, (profile.last_active_at as string | null) ?? null);
      joinedAt.set(id, (profile.created_at as string | null) ?? null);
    }
  }

  const missing = userIds.filter((id) => !emails.has(id));
  if (missing.length > 0) {
    const { data: authRows } = await svc
      .from("auth.users")
      .select("id, email, raw_user_meta_data, avatar_url")
      .in("id", missing);

    for (const row of authRows ?? []) {
      const id = row.id as string;
      const email = (row.email as string | null)?.toLowerCase();
      if (!email) continue;
      emails.set(id, email);
      if (!names.get(id)) names.set(id, displayName(row.raw_user_meta_data, email));
      const avatar = (row.avatar_url as string | null)?.trim();
      if (avatar && !avatars.has(id)) avatars.set(id, avatar);
    }
  }

  const describe = (id: string, fallbackName: string): Pick<Member, "name" | "email" | "avatar_url"> => ({
    name: names.get(id) || emails.get(id)?.split("@")[0] || fallbackName,
    email: emails.get(id) ?? "",
    avatar_url: avatars.get(id) ?? null,
  });

  const members: Member[] = list.map((row) => {
    const id = row.user_id;
    const email = emails.get(id) ?? "";
    return {
      user_id: id,
      ...describe(id, "User"),
      role: (row.role === "admin" || row.role === "staff" || row.can_edit
        ? "edit"
        : "view") as AccessRole,
      status: "active",
      inherited: true,
      joined_at: joinedAt.get(id) ?? null,
      last_login_at: lastLoginAt.get(id) ?? null,
      last_active_at: lastActiveAt.get(id) ?? null,
    };
  });

  if (ownerId) {
    members.unshift({
      user_id: ownerId,
      ...describe(ownerId, "Owner"),
      role: "owner",
      status: "active",
      inherited: true,
      joined_at: joinedAt.get(ownerId) ?? null,
      last_login_at: lastLoginAt.get(ownerId) ?? null,
      last_active_at: lastActiveAt.get(ownerId) ?? null,
    });
  }

  const deduped = new Map<string, Member>();
  for (const m of members) {
    if (!deduped.has(m.user_id)) deduped.set(m.user_id, m);
  }
  const uniqueMembers = Array.from(deduped.values());

  const order: Record<AccessRole, number> = { owner: 0, edit: 1, view: 2 };
  uniqueMembers.sort((a, b) => {
    const byRole = order[a.role] - order[b.role];
    return byRole !== 0 ? a.email.localeCompare(b.email) : a.user_id.localeCompare(b.user_id);
  });

  return { members: uniqueMembers, emails };
}

export async function GET(request: NextRequest) {
  const user = await getCaller();
  if (!user) return fail("Authentication required", 401);

  const scope = readScope(request);
  if (!scope) return fail("scope must be 'workspace' or 'board'", 400);

  const params = request.nextUrl.searchParams;
  const boardId = scope === "board" ? params.get("board_id") : null;
  const workspaceIdParam = params.get("workspace_id");
  const query = sanitizeSearch(params.get("q") ?? "");

  if (scope === "board" && !boardId) {
    return fail("board_id query param is required for board scope", 400);
  }

  const workspaceId = scope === "board" ? await getBoardWorkspaceId(boardId!) : workspaceIdParam;
  if (!workspaceId) return fail("That workspace could not be found", 404);

  const currentAccess = await resolveCallerAccess(user.id, workspaceId, boardId);
  if (!currentAccess) {
    return fail("You do not have access to this workspace", 403);
  }

  const canManage = currentAccess === "owner" || currentAccess === "edit";

  let members: Member[] = [];
  let pending: PendingInvite[] = [];
  let candidates: MemberCandidate[] = [];
  let subjectName = "";

  try {
    subjectName = await getSubjectName(scope, workspaceId, boardId);
    const loaded = await loadWorkspaceMembers(workspaceId);
    members = loaded.members;

    if (scope === "board") {
      // A board-specific override wins over the inherited workspace role. An
      // override for someone who is not a workspace member is their only route
      // onto this board, so it is listed too rather than silently dropped.
      const svc = await createServiceClient();
      const { data: overrides, error } = await svc
        .from("board_member_overrides")
        .select("user_id, access")
        .eq("board_id", boardId);

      if (error) throw new Error(error.message);

      const byUser = new Map<string, Member>(members.map((member) => [member.user_id, member]));

      for (const row of (overrides ?? []) as OverrideRow[]) {
        const access = (row.access as AccessRole) ?? "view";
        const existing = byUser.get(row.user_id);
        if (existing) byUser.set(row.user_id, { ...existing, role: access, inherited: false });
      }

      // Overrides for people who are not workspace members: the only route onto this
      // board, so listed rather than silently dropped.
      const orphans = (overrides ?? []).filter((row) => !byUser.has(row.user_id));

      if (orphans.length > 0) {
        const { data: authRows } = await svc
          .from("auth.users")
          .select("id, email, raw_user_meta_data, avatar_url")
          .in(
            "id",
            orphans.map((row) => row.user_id),
          );

        for (const row of authRows ?? []) {
          const id = row.id as string;
          const email = (row.email as string | null)?.toLowerCase();
          if (!email) continue;
          const override = orphans.find((o) => o.user_id === id);
          if (!override) continue;
          byUser.set(id, {
            user_id: id,
            name: displayName(row.raw_user_meta_data, email),
            email,
            avatar_url: (row.avatar_url as string | null) ?? null,
            role: (override.access as AccessRole) ?? "view",
            status: "active",
            inherited: false,
            joined_at: null,
            last_login_at: null,
            last_active_at: null,
          });
        }
      }

      members = [...byUser.values()];
      const order: Record<AccessRole, number> = { owner: 0, edit: 1, view: 2 };
      members.sort((a, b) => {
        const byRole = order[a.role] - order[b.role];
        return byRole !== 0 ? byRole : a.email.localeCompare(b.email);
      });
    }

    // Pending invites are privileged: only owner/admin may see them, and the RPC
    // raises otherwise. A view user simply gets an empty list.
    if (canManage) {
      const svc = await createServiceClient();
      const { data, error } = await svc.rpc("list_pending_workspace_invites", {
        p_workspace_id: workspaceId,
      });

      if (error) {
        console.warn("[api/members] pending invites unavailable:", error.message);
      } else {
        pending = ((data ?? []) as { code: string; email: string; access: string; created_at: string }[]).map(
          (row) => ({
            code: row.code,
            email: row.email,
            role: (row.access === "edit" ? "edit" : "view") as AccessRole,
            created_at: row.created_at,
          }),
        );
      }
    }

    if (canManage && query.length > 0) {
      const svc = await createServiceClient();
      const { data, error } = await svc
        .from("auth.users")
        .select("id, email, raw_user_meta_data")
        .ilike("email", `%${query}%`)
        .limit(8);

      if (!error) {
        const taken = new Set(members.map((member) => member.email.toLowerCase()));
        for (const invite of pending) taken.add(invite.email.toLowerCase());

candidates = (data ?? [])
          .map((row) => ({
            id: row.id as string,
            email: (row.email as string | null)?.toLowerCase() ?? null,
            raw_user_meta_data: row.raw_user_meta_data as unknown,
          }))
          // A row with no email cannot be invited or matched, so it is dropped
          // here rather than being carried as an empty string into the picker.
          .filter(
            (row): row is { id: string; email: string; raw_user_meta_data: unknown } =>
              row.email !== null && !taken.has(row.email),
          )
          .map((row) => ({
            user_id: row.id,
            email: row.email,
            name: displayName(row.raw_user_meta_data, row.email),
          }));
      }
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not load members", 500);
  }

  // Activity columns are only sent to an owner or admin. The UI gates on
  // `can_manage`, but the values must not reach the browser for a view or edit
  // caller at all, because last_active_at is session data and the database is the
  // only trustworthy gatekeeper.
  if (!canManage) {
    members = members.map((member) => ({
      ...member,
      joined_at: null,
      last_login_at: null,
      last_active_at: null,
    }));
  }

  const payload: MembersPayload = {
    success: true,
    scope,
    subject_name: subjectName,
    current_access: currentAccess,
    can_manage: canManage,
    members,
    pending_invites: pending,
    candidates,
  };

  return NextResponse.json(payload);
}

interface AddBody {
  scope?: unknown;
  workspace_id?: unknown;
  board_id?: unknown;
  email?: unknown;
  access?: unknown;
}

export async function POST(request: NextRequest) {
  const user = await getCaller();
  if (!user) return fail("Authentication required", 401);

  const body = (await request.json().catch(() => ({}))) as AddBody;

  const scope: MemberScope = body.scope === "board" ? "board" : "workspace";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const access: GrantableAccess = body.access === "edit" ? "edit" : "view";

  if (!isValidEmail(email)) return fail("Enter a valid email address", 400);

  const boardId = scope === "board" && typeof body.board_id === "string" ? body.board_id : null;
  const workspaceId =
    scope === "board" && boardId
      ? await getBoardWorkspaceId(boardId)
      : typeof body.workspace_id === "string"
        ? body.workspace_id
        : null;

  if (!workspaceId) return fail("That workspace could not be found", 404);

  if (!(await canManageMembers(user.id, workspaceId, boardId))) {
    return fail("Only the owner and users with edit access can manage members", 403);
  }

  try {
    // Membership always lands on the workspace — that is the table
    // can_edit_workspace reads, and a board grant on a non-member would not be
    // honoured by any of the existing RLS. At board scope the chosen access is
    // then pinned as an override for that board only.
    let invited = false;

    try {
      await callMemberMutation("add_workspace_member", {
        p_workspace_id: workspaceId,
        p_email: email,
        p_access: access,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // The RPC raises P0002 when no account exists for the address; anything
      // else (duplicate, permission) must surface as-is.
      if (!message.includes("no account exists")) throw err;
      await callMemberMutation("invite_workspace_member", {
        p_workspace_id: workspaceId,
        p_email: email,
        p_access: access,
      });
      invited = true;
    }

    if (scope === "board" && boardId) {
      const svc = await createServiceClient();
      const { data } = await svc
        .from("auth.users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (data?.id) {
        await callMemberMutation("set_board_member_access", {
          p_board_id: boardId,
          p_user_id: data.id,
          p_access: access,
        });
      }
    }

    return NextResponse.json({ success: true, invited });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not add that member", 400);
  }
}

interface PatchBody {
  action?: unknown;
  scope?: unknown;
  workspace_id?: unknown;
  board_id?: unknown;
  user_id?: unknown;
  access?: unknown;
  code?: unknown;
}

export async function PATCH(request: NextRequest) {
  const user = await getCaller();
  if (!user) return fail("Authentication required", 401);

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const action = body.action;

  try {
    // ── Pending invites ───────────────────────────────────────────────────
    if (action === "resend_invite" || action === "cancel_invite") {
      const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id : null;
      const code = typeof body.code === "string" ? body.code : null;
      if (!workspaceId || !code) return fail("workspace_id and code are required", 400);

      if (!(await canManageMembers(user.id, workspaceId, null))) {
        return fail("Only the owner and users with edit access can manage invites", 403);
      }

      await callMemberMutation(
        action === "resend_invite" ? "resend_workspace_invite" : "cancel_workspace_invite",
        { p_workspace_id: workspaceId, p_code: code },
      );

      return NextResponse.json({ success: true });
    }

    // ── Access change / clear an override ────────────────────────────────
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    if (!userId) return fail("user_id is required", 400);

    const scope: MemberScope = body.scope === "board" ? "board" : "workspace";
    const boardId = scope === "board" && typeof body.board_id === "string" ? body.board_id : null;
    const workspaceId =
      scope === "board" && boardId
        ? await getBoardWorkspaceId(boardId)
        : typeof body.workspace_id === "string"
          ? body.workspace_id
          : null;

    if (!workspaceId) return fail("That workspace could not be found", 404);

    if (!(await canManageMembers(user.id, workspaceId, boardId))) {
      return fail("Only the owner and users with edit access can change access", 403);
    }

    if (action === "clear_override") {
      if (!boardId) return fail("board_id is required to clear a board override", 400);
      await callMemberMutation("remove_board_member_access", {
        p_board_id: boardId,
        p_user_id: userId,
      });
      return NextResponse.json({ success: true });
    }

    if (action !== "set_access") return fail("Unknown action", 400);

    const access: GrantableAccess = body.access === "edit" ? "edit" : "view";

    if (scope === "board" && boardId) {
      await callMemberMutation("set_board_member_access", {
        p_board_id: boardId,
        p_user_id: userId,
        p_access: access,
      });
      return NextResponse.json({ success: true, access });
    }

    await callMemberMutation("set_workspace_member_access", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_access: access,
    });

    return NextResponse.json({ success: true, access });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not change that member", 400);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCaller();
  if (!user) return fail("Authentication required", 401);

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  // DELETE carries either a member to remove (user_id) or an invite to cancel
  // (code). Two unrelated nouns in one verb is a smell, but they are the same
  // "stop this pending relationship" action from the dialog's point of view.
  const code = typeof body.code === "string" ? body.code : null;
  const userId = typeof body.user_id === "string" ? body.user_id : null;

  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;

  if (workspaceId && code) {
    try {
      if (!(await canManageMembers(user.id, workspaceId, null))) {
        return fail("Only the owner and users with edit access can cancel invites", 403);
      }
      await callMemberMutation("cancel_workspace_invite", {
        p_workspace_id: workspaceId,
        p_code: code,
      });
      return NextResponse.json({ success: true, cancelled: true });
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Could not cancel that invite", 400);
    }
  }

  if (!userId) return fail("user_id is required", 400);

  const scope: MemberScope = body.scope === "board" ? "board" : "workspace";
  const boardId = scope === "board" && typeof body.board_id === "string" ? body.board_id : null;
  const resolvedWorkspaceId =
    scope === "board" && boardId ? await getBoardWorkspaceId(boardId) : workspaceId;

  if (!resolvedWorkspaceId) return fail("That workspace could not be found", 404);

  try {
    // At board scope, removing means "drop the override and hand them back to
    // the workspace role" — it must not strip workspace access as a side effect.
    if (scope === "board" && boardId) {
      await callMemberMutation("remove_board_member_access", {
        p_board_id: boardId,
        p_user_id: userId,
      });
      return NextResponse.json({ success: true, scope });
    }

    if (!(await canManageMembers(user.id, resolvedWorkspaceId, null))) {
      return fail("Only the owner and users with edit access can remove members", 403);
    }

    await callMemberMutation("remove_workspace_member", {
      p_workspace_id: resolvedWorkspaceId,
      p_user_id: userId,
    });

    return NextResponse.json({ success: true, scope });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not remove that member", 400);
  }
}