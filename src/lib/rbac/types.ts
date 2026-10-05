/**
 * RBAC types
 *
 * Mirrors the SQL enums in `public.app_role` and `public.workspace_kind`.
 * Kept as string unions rather than an enum so they serialise across the
 * server/client boundary without a conversion step.
 */

export type AppRole = "admin" | "staff" | "client";

export type WorkspaceKind = "standard" | "client" | "personal";

/** Who is calling, resolved once per request. */
export type SessionIdentity = {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  /** True only for the verified rujutapethe@gmail.com account. */
  isSuperAdmin: boolean;
  role: AppRole;
  organizationId: string | null;
};

/** A workspace the caller may see, with what they may do in it. */
export type WorkspaceAccess = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  type: WorkspaceKind;
  canView: boolean;
  canEdit: boolean;
};

/** A board the caller may see, with the row-level actions they may take. */
export type BoardAccess = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  icon: string | null;
  canView: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canEditBoard: boolean;
};

/**
 * Everything the shell needs to decide what to render. One call, because the
 * sidebar, the nav, and the empty-state decision all need it and making three
 * round trips to the database for the same answer is how they drift apart.
 */
export type AccessSnapshot = {
  identity: SessionIdentity | null;
  workspaces: WorkspaceAccess[];
  /** False for a signed-in user with no membership anywhere: render the empty
   *  state ("Ask your account manager to give you access"), not an error. */
  hasAnyWorkspace: boolean;
  isClient: boolean;
  isInternal: boolean;
};

/** A column as a client is allowed to see it. */
export type ClientColumnAccess = {
  id: string;
  key: string;
  label: string;
  type: string;
  sortOrder: number;
  required: boolean;
  canView: boolean;
  canEdit: boolean;
};