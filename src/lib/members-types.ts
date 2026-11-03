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

/** What a member can be granted from the dialog. "owner" is grantable by an
 * existing owner, and makes the grantee a second (or further) workspace owner. */
export type GrantableAccess = "owner" | "edit" | "view";

export type MemberScope = "workspace" | "board";

export const ACCESS_ROLE_MAPPING: Record<
  GrantableAccess,
  {
    roleName: "Owner" | "Admin" | "Member" | "Viewer";
    appRole: "client" | "staff" | "admin";
    canView: true;
    canEdit: boolean;
    description: string;
  }
> = {
  owner: {
    roleName: "Owner",
    appRole: "admin",
    canView: true,
    canEdit: true,
    description: "Full workspace access, including managing members and billing",
  },
  edit: {
    roleName: "Admin",
    appRole: "staff",
    canView: true,
    canEdit: true,
    description: "Can add, edit and delete items, columns and groups",
  },
  view: {
    roleName: "Viewer",
    appRole: "client",
    canView: true,
    canEdit: false,
    description: "Can see the board but not make changes",
  },
};

export function isGrantableAccess(value: unknown): value is GrantableAccess {
  return value === "owner" || value === "view" || value === "edit";
}

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
    value: "owner",
    label: "Owner",
    description: ACCESS_ROLE_MAPPING.owner.description,
  },
  {
    value: "edit",
    label: "Admin",
    description: ACCESS_ROLE_MAPPING.edit.description,
  },
  {
    value: "view",
    label: "Viewer",
    description: ACCESS_ROLE_MAPPING.view.description,
  },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function accessRoleLabel(level: AccessRole): string {
  return level === "owner" ? "Owner" : level === "edit" ? "Edit" : "View";
}