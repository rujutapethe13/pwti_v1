import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLiveJobScope } from "@/features/client-360/live-job-scope";

/** The real received-date span in scope, as `YYYY-MM-DD` or null. */
export interface DataBounds {
  earliest: string | null;
  latest: string | null;
}

export const EMPTY_DATA_BOUNDS: DataBounds = { earliest: null, latest: null };

/**
 * Reads the real received-date bounds from the live job scope.
 *
 * A failure here is deliberately non-fatal. The caller keeps whatever range it
 * already resolved, so a bounds read that errors degrades to a wider window
 * rather than an empty dashboard.
 */
export async function fetchDataBounds(
  _supabase: SupabaseClient,
  organizationId: string,
  _workspaceIds: string[] | null,
): Promise<DataBounds> {
  try {
    const scope = await getLiveJobScope(organizationId);
    let earliest: string | null = null;
    let latest: string | null = null;
    for (const job of scope.jobs) {
      if (!job.received_date) continue;
      if (earliest == null || job.received_date < earliest) earliest = job.received_date;
      if (latest == null || job.received_date > latest) latest = job.received_date;
    }
    return { earliest, latest };
  } catch (error) {
    console.warn("Could not read live Overview data bounds:", error);
    return EMPTY_DATA_BOUNDS;
  }
}
