/**
 * Client Search Dashboard — Server Actions
 *
 * Provides the client dashboard with data fetching capabilities.
 */

"use server";

import "server-only";

import { buildUnifiedDataset } from "./aggregation-service";
import type { UnifiedDataset } from "./types";

/**
 * Fetch the unified dataset for a workspace.
 * Called by the client dashboard on mount and on refresh.
 */
export async function fetchClientSearchData(
  workspaceId: string,
): Promise<{ data: UnifiedDataset | null; error: string | null }> {
  try {
    const dataset = await buildUnifiedDataset(workspaceId);
    return { data: dataset, error: null };
  } catch (err) {
    console.error("[ClientSearch] Failed to build dataset:", err);
    return { data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
