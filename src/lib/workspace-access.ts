"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type WorkspaceAccess = "owner" | "edit" | "view";

export interface WorkspaceMini {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  canView: boolean;
  canEdit: boolean;
}

/**
 * Membership/access check for a workspace.
 *
 * The answer comes from `resolve_workspace_access()`, the SECURITY DEFINER
 * function that encodes the same rule the row-level policies use (owner,
 * workspace_members.role/can_edit, super admin). Taking an explicit user id
 * lets any server path answer "does this user have access to this workspace?"
 * without guessing from the UI.
 *
 * Fails closed: any error resolves to `null`, so an unreachable helper can
 * never become an open door.
 */
export async function getUserWorkspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAccess | null> {
  if (!userId || !workspaceId) return null;

  const supabase = await createClient(await cookies());
  const { data, error } = await supabase.rpc(
    "resolve_workspace_access",
    { p_workspace_id: workspaceId, p_user_id: userId },
  );

  if (error || data == null) return null;
  return data as WorkspaceAccess;
}

/**
 * Human label for the access level, used by the overview header and the
 * workspace switcher.
 */
export async function workspaceRoleLabel(access: WorkspaceAccess | null): Promise<string> {
  switch (access) {
    case "owner":
      return "Owner";
    case "edit":
      return "Admin";
    case "view":
      return "Member";
    default:
      return "No access";
  }
}

/**
 * Every workspace the caller may see. Membership is enforced server-side by
 * `get_my_workspaces()`, so a workspace the user is not a member of can never
 * appear in this list.
 */
export async function getUserWorkspaces(): Promise<WorkspaceMini[]> {
  const supabase = await createClient(await cookies());
  const { data, error } = await supabase.rpc(
    "get_my_workspaces",
  );

  if (error || !data) return [];

  const rows = data as Array<{
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    can_view: boolean;
    can_edit: boolean;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    organizationId: row.organization_id,
    canView: row.can_view === true,
    canEdit: row.can_edit === true,
  }));
}
