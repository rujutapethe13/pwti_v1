import type { SupabaseClient } from "@supabase/supabase-js";

/** The real received-date span in scope, as `YYYY-MM-DD` or null. */
export interface DataBounds {
  earliest: string | null;
  latest: string | null;
}

export const EMPTY_DATA_BOUNDS: DataBounds = { earliest: null, latest: null };

function toDateKeyOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads the real received-date bounds for a scope, so "All time" can resolve to
 * the data that exists rather than an arbitrary sentinel.
 *
 * Lives here rather than in each of the three Overview services because all
 * three need it and they had already drifted: one took an options object while
 * two took positional arguments, and one re-implemented `toDateKeyOrNull`
 * inline. Any change to the RPC shape or to the error policy now has a single
 * place to change.
 *
 * A failure here is deliberately non-fatal. The caller keeps whatever range it
 * already resolved, so a bounds read that errors degrades to a wider window
 * rather than an empty dashboard.
 */
export async function fetchDataBounds(
  supabase: SupabaseClient,
  organizationId: string,
  workspaceIds: string[] | null,
): Promise<DataBounds> {
  const { data, error } = await supabase.rpc("overview_data_bounds", {
    p_organization_id: organizationId,
    p_workspace_ids: workspaceIds,
  });

  if (error) {
    console.warn("Could not read Overview data bounds:", error);
    return EMPTY_DATA_BOUNDS;
  }

  const root = (data ?? {}) as Record<string, unknown>;
  return {
    earliest: toDateKeyOrNull(root.earliest),
    latest: toDateKeyOrNull(root.latest),
  };
}