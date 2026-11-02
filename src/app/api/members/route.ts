import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  canManageMembers,
  getBoardWorkspaceId,
  getSubjectName,
  resolveCallerAccess,
} from "@/lib/members-access";
import {
  isValidEmail,
  isGrantableAccess,
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
 * Reads and writes run after verifying caller permissions via `resolveCallerAccess`
 * and `canManageMembers` from the session cookie. User account lookups use
 * `public.profiles` and `svc.auth.admin.listUsers()` because `auth.users` is not
 * exposed through PostgREST's `public` schema.
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
}

interface OverrideRow {
  user_id: string;
  access: string;
}

interface AuthUserSummary {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

async function listAuthUserSummaries(
  svc: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<AuthUserSummary[]> {
  try {
    const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data?.users) return [];
    const results: AuthUserSummary[] = [];
    for (const u of data.users) {
      const email = u.email?.trim().toLowerCase();
      if (!email) continue;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const avatar =
        typeof meta.avatar_url === "string" && meta.avatar_url.trim()
          ? meta.avatar_url.trim()
          : null;
      results.push({
        id: u.id,
        email,
        name: displayName(meta, email),
        avatar_url: avatar,
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function resolveUserByEmail(
  svc: Awaited<ReturnType<typeof createServiceClient>>,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: profileRows } = await svc
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .limit(1);

  if (profileRows && profileRows.length > 0 && profileRows[0].id) {
    return {
      id: profileRows[0].id as string,
      email: ((profileRows[0].email as string | null) ?? normalized).toLowerCase(),
    };
  }

  const authUsers = await listAuthUserSummaries(svc);
  const matched = authUsers.find((u) => u.email === normalized);
  if (matched) {
    return { id: matched.id, email: matched.email };
  }

  return null;
}

async function resolveRoleIdForAccess(
  svc: Awaited<ReturnType<typeof createServiceClient>>,
  access: GrantableAccess,
): Promise<string | null> {
  const targetName = access === "edit" ? "Employee" : "Viewer";
  const { data } = await svc
    .from("roles")
    .select("id, name")
    .ilike("name", targetName)
    .limit(1);

  if (data && data.length > 0 && data[0].id) {
    return data[0].id as string;
  }
  return null;
}

/** Workspace members with their resolved display role. */
async function loadWorkspaceMembers(
  workspaceId: string,
): Promise<{ members: Member[]; emails: Map<string, string> }> {
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
  if (ownerId && !userIds.includes(ownerId)) userIds.push(ownerId);

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
    const missingSet = new Set(missing);
    const authUsers = await listAuthUserSummaries(svc);
    for (const row of authUsers) {
      if (!missingSet.has(row.id)) continue;
      emails.set(row.id, row.email);
      if (!names.get(row.id)) names.set(row.id, row.name);
      if (row.avatar_url && !avatars.has(row.id)) avatars.set(row.id, row.avatar_url);
    }
  }

  const describe = (id: string, fallbackName: string): Pick<Member, "name" | "email" | "avatar_url"> => ({
    name: names.get(id) || emails.get(id)?.split("@")[0] || fallbackName,
    email: emails.get(id) ?? "",
    avatar_url: avatars.get(id) ?? null,
  });

  const members: Member[] = list.map((row) => {
    const id = row.user_id;
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
    return byRole !== 0 ? byRole : a.email.localeCompare(b.email);
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

  const canManage = await canManageMembers(user.id, workspaceId, boardId);

  let members: Member[] = [];
  const pending: PendingInvite[] = [];
  let candidates: MemberCandidate[] = [];
  let subjectName = "";

  try {
    subjectName = await getSubjectName(scope, workspaceId, boardId);
    const loaded = await loadWorkspaceMembers(workspaceId);
    members = loaded.members;

    const svc = await createServiceClient();

    if (scope === "board") {
      // A board-specific override wins over the inherited workspace role.
      const { data: overrides, error } = await svc
        .from("board_member_overrides")
        .select("user_id, access")
        .eq("board_id", boardId);

      if (error) throw new Error(error.message);

      const byUser = new Map<string, Member>(members.map((member) => [member.user_id, member]));

      for (const row of (overrides ?? []) as OverrideRow[]) {
        const access = (row.access as AccessRole) ?? "view";
        const existing = byUser.get(row.user_id);
        if (existing && existing.role !== "owner") {
          byUser.set(row.user_id, { ...existing, role: access, inherited: false });
        }
      }

      // Overrides for people who are not workspace members: listed rather than dropped.
      const orphans = ((overrides ?? []) as OverrideRow[]).filter((row) => !byUser.has(row.user_id));

      if (orphans.length > 0) {
        const orphanIds = orphans.map((row) => row.user_id);
        const { data: orphanProfiles } = await svc
          .from("profiles")
          .select("id, full_name, email, avatar_url, last_login_at, last_active_at, created_at")
          .in("id", orphanIds);

        const profileById = new Map<string, Record<string, unknown>>();
        for (const p of orphanProfiles ?? []) {
          profileById.set(p.id as string, p as Record<string, unknown>);
        }

        const missingOrphans = orphanIds.filter((id) => !profileById.has(id));
        const authById = new Map<string, AuthUserSummary>();
        if (missingOrphans.length > 0) {
          const authUsers = await listAuthUserSummaries(svc);
          for (const u of authUsers) authById.set(u.id, u);
        }

        for (const override of orphans) {
          const id = override.user_id;
          const prof = profileById.get(id);
          const authUser = authById.get(id);
          const email =
            ((prof?.email as string | null) ?? authUser?.email ?? "").trim().toLowerCase();
          if (!email) continue;
          const name =
            ((prof?.full_name as string | null)?.trim() ||
              authUser?.name ||
              email.split("@")[0] ||
              "User");
          byUser.set(id, {
            user_id: id,
            name,
            email,
            avatar_url:
              ((prof?.avatar_url as string | null) ?? authUser?.avatar_url ?? null),
            role: (override.access as AccessRole) ?? "view",
            status: "active",
            inherited: false,
            joined_at: (prof?.created_at as string | null) ?? null,
            last_login_at: (prof?.last_login_at as string | null) ?? null,
            last_active_at: (prof?.last_active_at as string | null) ?? null,
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

    // Pending invites are privileged: only callers who can manage members may see them.
    if (canManage) {
      const { data: inviteRows, error: inviteError } = await svc
        .from("workspace_invites")
        .select("code, email, role, can_edit, created_at, expires_at, used_at")
        .eq("workspace_id", workspaceId)
        .is("used_at", null)
        .order("created_at", { ascending: false });

      if (inviteError) {
        console.warn("[api/members] pending invites unavailable:", inviteError.message);
      } else {
        const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
        const seenInviteEmails = new Set<string>();
        const now = Date.now();

        for (const row of inviteRows ?? []) {
          const email = ((row.email as string | null) ?? "").trim().toLowerCase();
          if (!email || memberEmails.has(email) || seenInviteEmails.has(email)) continue;
          if (row.expires_at) {
            const expiresMs = new Date(row.expires_at as string).getTime();
            if (!Number.isNaN(expiresMs) && expiresMs <= now) continue;
          }
          seenInviteEmails.add(email);
          pending.push({
            code: row.code as string,
            email,
            role: (row.role === "admin" || row.role === "staff" || row.can_edit
              ? "edit"
              : "view") as AccessRole,
            created_at: row.created_at as string,
          });
        }
      }
    }

    if (canManage && query.length > 0) {
      const qLower = query.toLowerCase();
      // In workspace scope, hide people already in the workspace or pending invite.
      // In board scope, only hide the workspace owner so existing workspace members
      // can also be searched and given board-specific overrides from the top bar.
      const taken = new Set<string>();
      if (scope === "workspace") {
        for (const member of members) taken.add(member.email.toLowerCase());
        for (const invite of pending) taken.add(invite.email.toLowerCase());
      } else {
        for (const member of members) {
          if (member.role === "owner") taken.add(member.email.toLowerCase());
        }
      }

      const candidateByEmail = new Map<string, MemberCandidate>();

      const { data: profileMatches } = await svc
        .from("profiles")
        .select("id, email, full_name")
        .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(12);

      for (const row of profileMatches ?? []) {
        const email = ((row.email as string | null) ?? "").trim().toLowerCase();
        if (!email || taken.has(email)) continue;
        const fullName = (row.full_name as string | null)?.trim();
        candidateByEmail.set(email, {
          user_id: row.id as string,
          email,
          name: fullName || email.split("@")[0] || email,
        });
      }

      if (candidateByEmail.size < 8) {
        const authUsers = await listAuthUserSummaries(svc);
        for (const u of authUsers) {
          if (taken.has(u.email) || candidateByEmail.has(u.email)) continue;
          if (u.email.includes(qLower) || u.name.toLowerCase().includes(qLower)) {
            candidateByEmail.set(u.email, {
              user_id: u.id,
              email: u.email,
              name: u.name,
            });
            if (candidateByEmail.size >= 8) break;
          }
        }
      }

      candidates = Array.from(candidateByEmail.values()).slice(0, 8);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not load members", 500);
  }

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
  if (!isGrantableAccess(body.access)) return fail("access must be either view or edit", 400);
  const access: GrantableAccess = body.access;

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
    const svc = await createServiceClient();

    const { data: workspace } = await svc
      .from("workspaces")
      .select("owner_id, organization_id")
      .eq("id", workspaceId)
      .maybeSingle();

    const ownerId = (workspace?.owner_id as string | null) ?? null;
    const organizationId = (workspace?.organization_id as string | null) ?? null;

    const existingUser = await resolveUserByEmail(svc, email);

    if (existingUser) {
      if (ownerId && existingUser.id === ownerId) {
        return fail("That person is already the workspace owner", 400);
      }

      const { data: existingMember } = await svc
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (scope === "workspace" && existingMember) {
        return fail("That person already has access.", 400);
      }

      if (!existingMember) {
        const roleId = await resolveRoleIdForAccess(svc, access);
        const { error: insertMemberErr } = await svc
          .from("workspace_members")
          .insert({
            user_id: existingUser.id,
            workspace_id: workspaceId,
            ...(roleId ? { role_id: roleId } : {}),
            role: access === "edit" ? "staff" : "client",
            can_view: true,
            can_edit: access === "edit",
          });

        if (insertMemberErr) throw new Error(insertMemberErr.message);

        if (organizationId) {
          await svc
            .from("organization_members")
            .upsert(
              {
                organization_id: organizationId,
                user_id: existingUser.id,
                role: "member",
              },
              { onConflict: "organization_id,user_id", ignoreDuplicates: true },
            );
        }
      }

      if (scope === "board" && boardId) {
        const { error: overrideErr } = await svc
          .from("board_member_overrides")
          .upsert(
            {
              board_id: boardId,
              user_id: existingUser.id,
              access,
              granted_by: user.id,
            },
            { onConflict: "board_id,user_id" },
          );

        if (overrideErr) throw new Error(overrideErr.message);
      }

      // Consume any pending invites for this user on this workspace.
      await svc
        .from("workspace_invites")
        .update({
          used_at: new Date().toISOString(),
          used_by: existingUser.id,
        })
        .eq("workspace_id", workspaceId)
        .ilike("email", email)
        .is("used_at", null);

      return NextResponse.json({ success: true, invited: false });
    }

    // No account exists yet for this email -> create or refresh a pending workspace invite.
    const { data: existingInvites } = await svc
      .from("workspace_invites")
      .select("code, expires_at")
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const activeInvite = (existingInvites ?? []).find((inv) => {
      if (!inv.expires_at) return true;
      return new Date(inv.expires_at as string).getTime() > Date.now();
    });

    const nextExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (activeInvite?.code) {
      const { error: updateInviteErr } = await svc
        .from("workspace_invites")
        .update({
          role: access === "edit" ? "staff" : "client",
          can_edit: access === "edit",
          created_at: new Date().toISOString(),
          expires_at: nextExpiry,
        })
        .eq("code", activeInvite.code as string);

      if (updateInviteErr) throw new Error(updateInviteErr.message);
    } else {
      const code = crypto.randomUUID().replace(/-/g, "");
      const { error: insertInviteErr } = await svc
        .from("workspace_invites")
        .insert({
          code,
          workspace_id: workspaceId,
          email,
          role: access === "edit" ? "staff" : "client",
          can_edit: access === "edit",
          created_by: user.id,
          expires_at: nextExpiry,
        });

      if (insertInviteErr) throw new Error(insertInviteErr.message);
    }

    return NextResponse.json({ success: true, invited: true });
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
    const svc = await createServiceClient();

    // ── Pending invites ───────────────────────────────────────────────────
    if (action === "resend_invite" || action === "cancel_invite") {
      const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id : null;
      const code = typeof body.code === "string" ? body.code : null;
      if (!workspaceId || !code) return fail("workspace_id and code are required", 400);

      if (!(await canManageMembers(user.id, workspaceId, null))) {
        return fail("Only the owner and users with edit access can manage invites", 403);
      }

      if (action === "resend_invite") {
        const { data: updated, error } = await svc
          .from("workspace_invites")
          .update({
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("code", code)
          .is("used_at", null)
          .select("code");

        if (error) throw new Error(error.message);
        if (!updated || updated.length === 0) {
          return fail("That invite no longer exists", 404);
        }
      } else {
        const { data: deleted, error } = await svc
          .from("workspace_invites")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("code", code)
          .is("used_at", null)
          .select("code");

        if (error) throw new Error(error.message);
        if (!deleted || deleted.length === 0) {
          return fail("That invite no longer exists", 404);
        }
      }

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
      const { error } = await svc
        .from("board_member_overrides")
        .delete()
        .eq("board_id", boardId)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }

    if (action !== "set_access") return fail("Unknown action", 400);

    if (!isGrantableAccess(body.access)) return fail("access must be either view or edit", 400);
    const access: GrantableAccess = body.access;

    if (scope === "board" && boardId) {
      const { error } = await svc
        .from("board_member_overrides")
        .upsert(
          {
            board_id: boardId,
            user_id: userId,
            access,
            granted_by: user.id,
          },
          { onConflict: "board_id,user_id" },
        );

      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, access });
    }

    const roleId = await resolveRoleIdForAccess(svc, access);
    const { data: updatedRows, error } = await svc
      .from("workspace_members")
      .update({
        ...(roleId ? { role_id: roleId } : {}),
        role: access === "edit" ? "staff" : "client",
        can_view: true,
        can_edit: access === "edit",
      })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .select("id");

    if (error) throw new Error(error.message);
    if (!updatedRows || updatedRows.length === 0) {
      return fail("That user is not a member of this workspace", 404);
    }

    return NextResponse.json({ success: true, access });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not change that member", 400);
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCaller();
  if (!user) return fail("Authentication required", 401);

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const code = typeof body.code === "string" ? body.code : null;
  const userId = typeof body.user_id === "string" ? body.user_id : null;

  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;

  const svc = await createServiceClient();

  if (workspaceId && code) {
    try {
      if (!(await canManageMembers(user.id, workspaceId, null))) {
        return fail("Only the owner and users with edit access can cancel invites", 403);
      }
      const { error } = await svc
        .from("workspace_invites")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("code", code)
        .is("used_at", null);

      if (error) throw new Error(error.message);
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
    if (scope === "board" && boardId) {
      if (!(await canManageMembers(user.id, resolvedWorkspaceId, boardId))) {
        return fail("Only the owner and users with edit access can remove members", 403);
      }
      const { error } = await svc
        .from("board_member_overrides")
        .delete()
        .eq("board_id", boardId)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, scope });
    }

    if (!(await canManageMembers(user.id, resolvedWorkspaceId, null))) {
      return fail("Only the owner and users with edit access can remove members", 403);
    }

    if (userId === user.id) {
      return fail("You cannot remove yourself", 400);
    }

    const { data: ws } = await svc
      .from("workspaces")
      .select("owner_id")
      .eq("id", resolvedWorkspaceId)
      .maybeSingle();

    if (ws?.owner_id === userId) {
      return fail("The workspace owner cannot be removed", 400);
    }

    const { error } = await svc
      .from("workspace_members")
      .delete()
      .eq("workspace_id", resolvedWorkspaceId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, scope });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not remove that member", 400);
  }
}
