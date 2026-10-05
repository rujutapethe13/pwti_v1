import { createServiceClient } from "@/lib/supabase/server";
import { getSessionIdentity } from "@/lib/rbac/resolve";

/**
 * Organization resolution.
 *
 * ── Why this changed ───────────────────────────────────────────────────────
 * The old path read `workspace_members` through the anon key and gave up when
 * that returned nothing, which is where "Unable to determine organization"
 * came from: RLS decided the answer, so a user whose membership row was not
 * readable through the anon key looked exactly like a user with no membership.
 *
 * The organization now comes from `current_org_id()`, a SECURITY DEFINER
 * function that resolves it from workspace membership and is not subject to the
 * caller's RLS. Same answer, no RLS dependency.
 *
 * The functions keep their original signatures and their original null-means-
 * unknown contract, so every existing caller is unaffected.
 */

export async function getUserOrganizationId(): Promise<string | null> {
  const identity = await getSessionIdentity();
  return identity?.organizationId ?? null;
}

/**
 * Every organization the caller belongs to.
 *
 * Still derived from workspace membership rather than from current_org_id(),
 * because a user with memberships in two organizations must see both — which is
 * what this function returned before, and what the singular form above cannot
 * express.
 */
export async function getUserOrganizationIds(): Promise<string[]> {
  const workspaceIds = await getUserWorkspaceIds();
  if (workspaceIds.length === 0) return [];

  const supabase = await createServiceClient().catch((error: unknown) => {
    console.error("[organization] service client init failed", {
      workspaceCount: workspaceIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!supabase) return [];

  const { data, error } = await supabase
    .from("workspaces")
    .select("organization_id")
    .in("id", workspaceIds);

  if (error) {
    console.error("[organization] workspace organization lookup failed", {
      workspaceCount: workspaceIds.length,
      error: error.message,
    });
    return [];
  }

  return [...new Set((data ?? []).map((row) => row.organization_id as string))];
}

/**
 * The workspaces whose data the caller is entitled to see.
 *
 * Personal workspaces are excluded on purpose: every analytics, search and feed
 * surface scopes through this list, and a personal workspace must never appear
 * in one of them. A surface that genuinely wants a personal workspace asks for
 * it by id through listAccessibleWorkspaces({ includePersonal: true }) instead.
 */
export async function getUserWorkspaceIds(): Promise<string[]> {
  const identity = await getSessionIdentity();
  if (!identity) return [];

  const supabase = await createServiceClient().catch((error: unknown) => {
    console.error("[organization] service client init failed", {
      userIdPresent: Boolean(identity.userId),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!supabase) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", identity.userId);

  if (error) {
    console.error("[organization] workspace membership lookup failed", {
      userIdPresent: Boolean(identity.userId),
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => row.workspace_id as string);
}
