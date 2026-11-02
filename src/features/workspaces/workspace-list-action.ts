"use server";

import { getUserWorkspaces, workspaceRoleLabel } from "@/lib/workspace-access";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  canView: boolean;
  canEdit: boolean;
}

/**
 * The workspaces the current user may open, each with the user's role in it.
 * Enforced server-side: non-member workspaces never appear here.
 */
export async function listUserWorkspaces(): Promise<WorkspaceSummary[]> {
  const workspaces = await getUserWorkspaces();

  return workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    role: await workspaceRoleLabel(ws.canEdit ? "edit" : ws.canView ? "view" : null),
    canView: ws.canView,
    canEdit: ws.canEdit,
  }));
}
