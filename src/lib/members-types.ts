/**
 * Shared shapes for the Members & access feature.
 *
 * Kept free of `server-only` and of any Supabase import so client components,
 * route handlers and the server-side access resolver can all share one
 * definition.
 *
 * The data model behind these shapes is the existing RBAC one, not a new table:
 *   workspaces.owner_id          -> "owner"
 *   workspace_members.role       -> app_role admin | staff | client
 *   workspace_members.can_edit   -> the per-member edit flag
 *   workspace_invites            -> "pending"
 *   board_member_overrides       -> a per-board role that wins over the above
 */

export type AccessRole = "owner" | "edit" | "view";

/** What a member can be granted from the dialog. "owner" is not grantable. */
export type GrantableAccess = "edit" | "view";

export type MemberScope = "workspace" | "board";

export interface Member {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: AccessRole;
  status: "active" | "pending";
  /**
   * Board scope only: true when no `board_member_overrides` row exists, so the
   * workspace role is what applies. Drives the "Inherited from workspace" label.
   */
  inherited: boolean;
  /** Null for callers who are not owner or admin. */
  joined_at: string | null;
  /** Null for callers who are not owner or admin. */
  last_login_at: string | null;
  /** Null for callers who are not owner or admin. */
  last_active_at: string | null;
}

export interface PendingInvite {
  code: string;
  email: string;
  role: AccessRole;
  created_at: string;
}

/** An existing auth user matching the search box, not yet a member. */
export interface MemberCandidate {
  user_id: string;
  name: string;
  email: string;
}

export interface MembersPayload {
  success: boolean;
  scope: MemberScope;
  subject_name: string;
  current_access: AccessRole | null;
  can_manage: boolean;
  members: Member[];
  pending_invites: PendingInvite[];
  candidates: MemberCandidate[];
}

export const ACCESS_OPTIONS: {
  value: GrantableAccess;
  label: string;
  description: string;
}[] = [
  {
    value: "view",
    label: "View",
    description: "Can see the board but not make changes",
  },
  {
    value: "edit",
    label: "Edit",
    description: "Can add, edit and delete items, columns and groups",
  },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function accessRoleLabel(level: AccessRole): string {
  return level === "owner" ? "Owner" : level === "edit" ? "Edit" : "View";
}