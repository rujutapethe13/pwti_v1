"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { toErrorMessage } from "@/lib/utils";
import type { PostgrestError } from "@supabase/supabase-js";
import type { WorkspaceEntry, ContentItem } from "@/lib/workspace-context";

/** Row shape returned by the `workspaces` insert-then-select round trip. */
interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
}

/** Row shape returned by the `organizations` insert-then-select round trip. */
interface OrganizationRow {
  id: string;
  name: string;
}

/**
 * Structural subset of `PostgrestError` used by this module. Real PostgREST
 * failures satisfy it structurally, and it lets locally synthesized failures
 * (e.g. the timeout sentinel) be reported through the same channel.
 */
interface DbFailure {
  message: string;
  details: string;
  hint: string;
  code: string;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export async function createWorkspaceInDb(
  name: string,
  organizationId: string,
): Promise<WorkspaceEntry | null> {
  const DB_TIMEOUT_MS = 5000;
  console.log(`[createWorkspaceInDb] starting: "${name}" in org: ${organizationId}`);

  let serviceClient;
  let client;
  try {
    serviceClient = await withTimeout(createServiceClient(), DB_TIMEOUT_MS, "createServiceClient");
    client = await withTimeout(createClient(await cookies()), DB_TIMEOUT_MS, "createClient");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[createWorkspaceInDb] client init failed:`, message);
    throw new Error(`DB client init failed: ${message}`);
  }

  const workspaceId = generateId("ws");
  const slug = generateSlug(name);
  const now = new Date().toISOString();

  let user;
  try {
    const { data: { user: userData } } = await withTimeout(client.auth.getUser(), DB_TIMEOUT_MS, "auth.getUser");
    user = userData;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[createWorkspaceInDb] auth getUser failed:`, message);
    user = null;
  }
  const userId = user?.id;

  let workspace: WorkspaceRow | null;
  let workspaceError: PostgrestError | null;
  try {
    const result = await withTimeout<{ data: WorkspaceRow | null; error: PostgrestError | null }>(
      serviceClient
        .from("workspaces")
        .insert({
          id: workspaceId,
          organization_id: organizationId,
          name,
          slug,
          description: "",
          status: "active",
          created_by: userId ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single(),
      DB_TIMEOUT_MS,
      "workspaces insert",
    );
    workspace = result.data;
    workspaceError = result.error;
  } catch (err) {
    const message = toErrorMessage(err, "Unknown error");
    console.error(`[createWorkspaceInDb] workspaces insert failed:`, message);
    throw new Error(`DB insert failed: ${message}`);
  }

  if (workspaceError || !workspace) {
    const wsMsg = toErrorMessage(workspaceError, "Failed to create workspace.");
    console.error("[createWorkspaceInDb] Failed to create workspace:", workspaceError);
    throw new Error(wsMsg);
  }

  console.log(`[createWorkspaceInDb] Created workspace: ${workspace.id} (created_by: ${userId ?? "none"})`);

  if (userId) {
    try {
      const { error: onboardError } = await withTimeout<{
        error: PostgrestError | null;
      }>(
        client.rpc("onboard_workspace_owner", { p_workspace_id: workspaceId }),
        DB_TIMEOUT_MS,
        "onboard_workspace_owner",
      );
      if (onboardError) {
        const onboardMsg = toErrorMessage(onboardError, "Unknown error");
        console.error("[createWorkspaceInDb] Failed to onboard workspace owner:", onboardError);
        throw new Error(`Failed to onboard workspace owner: ${onboardMsg}`);
      } else {
        console.log(`[createWorkspaceInDb] User onboarded as workspace owner: ${userId}`);
      }
    } catch (err) {
      const message = toErrorMessage(err, "Unknown error");
      console.error(`[createWorkspaceInDb] onboard_workspace_owner failed:`, message);
      throw new Error(`Workspace owner onboarding failed: ${message}`);
    }
  } else {
    console.warn("[createWorkspaceInDb] No authenticated user found; skipping onboarding");
  }

  const boardId = generateId("board");
  let boardError: DbFailure | null;
  try {
    const result = await withTimeout<{ error: PostgrestError | null }>(
      serviceClient
        .from("boards")
        .insert({
          id: boardId,
          organization_id: organizationId,
          workspace_id: workspaceId,
          slug: generateSlug("Manage workspace"),
          name: "Manage workspace",
          description: "Workspace configuration and settings",
          favorite: true,
          pinned: true,
          visibility: "workspace",
          status: "active",
          shared_with: ["owner", "editor", "viewer"],
          created_at: now,
          updated_at: now,
        })
        .select()
        .single(),
      DB_TIMEOUT_MS,
      "boards insert",
    );
    boardError = result.error;
  } catch (err) {
    const message = toErrorMessage(err, "Unknown error");
    console.error(`[createWorkspaceInDb] boards insert failed:`, message);
    boardError = { message, details: "", hint: "", code: "DB_TIMEOUT" };
  }

  if (boardError) {
    console.error("Failed to create default board:", boardError);
  }

  const content: ContentItem[] = boardError
    ? []
    : [
        {
          id: boardId,
          type: "board",
          name: "Manage workspace",
          icon: "Settings2",
          isPinned: true,
        },
      ];

  return {
    id: workspace.id,
    name: workspace.name,
    color: "#666666",
    description: workspace.description || "",
    organizationId: workspace.organization_id,
    content,
  };
}

export async function createOrganizationInDb(
  name: string,
): Promise<{ organizationId: string; workspace: WorkspaceEntry | null } | null> {
  const DB_TIMEOUT_MS = 5000;
  console.log(`[createOrganizationInDb] starting for: "${name}"`);

  let supabase;
  try {
    supabase = await withTimeout(createServiceClient(), DB_TIMEOUT_MS, "createServiceClient");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Supabase client.";
    console.error(`[createOrganizationInDb] createServiceClient failed:`, message);
    throw new Error(`DB client init failed: ${message}`);
  }

  const organizationId = generateId("org");
  const now = new Date().toISOString();

  let org: OrganizationRow | null;
  let orgError: PostgrestError | null;
  try {
    const result = await withTimeout<{ data: OrganizationRow | null; error: PostgrestError | null }>(
      supabase
        .from("organizations")
        .insert({
          id: organizationId,
          name,
          status: "active",
          plan: "starter",
          created_at: now,
          updated_at: now,
        })
        .select()
        .single(),
      DB_TIMEOUT_MS,
      "organizations insert",
    );
    org = result.data;
    orgError = result.error;
  } catch (err) {
    const message = toErrorMessage(err, "Unknown error");
    console.error(`[createOrganizationInDb] organizations insert failed:`, message);
    throw new Error(`DB insert failed: ${message}`);
  }

  if (orgError || !org) {
    const orgMsg = toErrorMessage(orgError, "Failed to create organization.");
    console.error("[createOrganizationInDb] Failed to create organization:", orgError);
    throw new Error(orgMsg);
  }
  console.log(`[createOrganizationInDb] organization created: ${organizationId}`);

  console.log(`[createOrganizationInDb] creating workspace for org: ${organizationId}`);
  let workspace: WorkspaceEntry | null;
  try {
    workspace = await withTimeout(createWorkspaceInDb(name, organizationId), DB_TIMEOUT_MS, "createWorkspaceInDb");
  } catch (err) {
    const message = toErrorMessage(err, "Unknown error");
    console.error(`[createOrganizationInDb] createWorkspaceInDb failed:`, message);
    throw new Error(`Workspace creation failed: ${message}`);
  }
  if (!workspace) {
    return { organizationId, workspace: null };
  }

  console.log(`[createOrganizationInDb] succeeded: org=${organizationId}, ws=${workspace.id}`);
  return { organizationId, workspace };
}

export async function renameWorkspaceInDb(workspaceId: string, name: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("workspaces")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);

  if (error) {
    console.error("Failed to rename workspace:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteWorkspaceInDb(workspaceId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId);

  if (error) {
    console.error("Failed to delete workspace:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
