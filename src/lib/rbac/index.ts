/**
 * RBAC — public surface.
 *
 * Server-side only. Import from "@/lib/rbac" rather than reaching into the
 * individual modules.
 *
 * Two layers, deliberately separate:
 *   - `resolve.ts` answers "may I?" for rendering. Safe to call from any server
 *     component; never throws for a merely-unauthorised caller.
 *   - `guards.ts` answers "may I do this?" for mutations. Returns a result the
 *     caller maps to a status or a redirect.
 *
 * Both read the database helpers over the caller's own JWT. Neither re-implements
 * a permission rule in TypeScript.
 */

export type {
  AccessSnapshot,
  AppRole,
  BoardAccess,
  ClientColumnAccess,
  SessionIdentity,
  WorkspaceAccess,
  WorkspaceKind,
} from "./types";

export {
  SUPER_ADMIN_EMAIL,
  canEditBoard,
  canEditColumn,
  canEditWorkspace,
  canViewBoard,
  canViewColumn,
  canViewWorkspace,
  getAccessSnapshot,
  getSessionIdentity,
  listAccessibleBoards,
  listAccessibleWorkspaces,
  listAnalyticsWorkspaceIds,
  listVisibleColumnIds,
  requireInternalRole,
} from "./resolve";

export {
  assertAdmin,
  assertAuthenticated,
  assertBoardEdit,
  assertBoardView,
  assertColumnEdit,
  assertRole,
  assertWorkspaceEdit,
  assertWorkspaceView,
  guardResponse,
  requirePageAccess,
} from "./guards";

export type { GuardDenied, GuardOk, GuardResult } from "./guards";