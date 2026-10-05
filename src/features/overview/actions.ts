"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildUnifiedDataset } from "@/features/analytics/aggregation/aggregation-service";

// ── Types ──────────────────────────────────────────────────────

export interface OverviewActivityEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
}

export interface OverviewTeamEntry {
  id: string;
  name: string;
  memberCount: number;
}

export interface OverviewData {
  rows: { id: string; status: string; createdAt: string }[];
  activity: OverviewActivityEntry[];
  teams: OverviewTeamEntry[];
}

export interface OverviewFetchResult {
  data: OverviewData | null;
  error: string | null;
}

// ── Main Fetch ─────────────────────────────────────────────────

const ACTIVITY_LIMIT = 8;

/**
 * Fetch all real data needed by the Overview page for a workspace.
 *
 * - `rows`: every active record across all boards in the workspace, used to
 *   compute stat cards, weekly volume, and workload-by-team.
 * - `activity`: the most recent activity_logs entries for the workspace, used to
 *   populate the Studio activity feed.
 * - `teams`: workspace teams joined with their real member counts, used for
 *   the Workload by team panel.
 */
export async function fetchOverviewData(
  workspaceId: string,
): Promise<OverviewFetchResult> {
  if (!workspaceId) {
    return { data: null, error: "No active workspace" };
  }

  const supabase = await createClient(await cookies());

  // 1. Unified dataset (real records across all boards)
  let rows: OverviewData["rows"] = [];
  try {
    const dataset = await buildUnifiedDataset(workspaceId);
    rows = dataset.rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
    }));
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to load jobs",
    };
  }

  // 2. Recent activity from the real activity_logs table
  let activity: OverviewActivityEntry[] = [];
  const { data: activityRows, error: activityError } = await supabase
    .from("activity_logs")
    .select(
      "id, action, payload, created_at, actor_user_id, organization_id, workspace_id",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (activityError) {
    return { data: null, error: activityError.message };
  }

  // Resolve actor display names via workspace_members -> roles join
  const actorIds = Array.from(
    new Set((activityRows ?? []).map((r) => r.actor_user_id).filter(Boolean)),
  ) as string[];

  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actorRows } = await supabase
      .from("workspace_members")
      .select("user_id, roles(name)")
      .in("user_id", actorIds);

    for (const ar of actorRows ?? []) {
      const roles = ar.roles as { name: string } | null;
      const name = roles?.name;
      if (name) actorNames.set(ar.user_id as string, name);
    }
  }

  activity = (activityRows ?? []).map((r) => {
    let payload: Record<string, unknown> = {};
    if (r.payload && typeof r.payload === "object") {
      payload = r.payload as Record<string, unknown>;
    } else if (typeof r.payload === "string") {
      try { payload = JSON.parse(r.payload); } catch { payload = {}; }
    }
    const details = (payload.details ?? {}) as Record<string, unknown>;
    const entityId = (details.entityId ?? payload.entityId ?? null) as string | null;

    return {
      id: String(r.id),
      action: String(r.action ?? ""),
      resourceType: r.action?.split(".")[0] ?? null,
      resourceId: entityId,
      metadata: payload,
      createdAt: String(r.created_at ?? ""),
      actorName: r.actor_user_id ? actorNames.get(String(r.actor_user_id)) ?? null : null,
    };
  });

  // 3. Workspace teams + real member counts
  let teams: OverviewTeamEntry[] = [];
  const { data: teamRows, error: teamError } = await supabase
    .from("teams")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (teamError) {
    return { data: null, error: teamError.message };
  }

  const teamIds = (teamRows ?? []).map((t) => t.id);
  const memberCounts = new Map<string, number>();
  if (teamIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("team_members")
      .select("team_id")
      .in("team_id", teamIds);

    for (const m of memberRows ?? []) {
      const tid = String(m.team_id);
      memberCounts.set(tid, (memberCounts.get(tid) ?? 0) + 1);
    }
  }

  teams = (teamRows ?? []).map((t) => ({
    id: String(t.id),
    name: String(t.name ?? "Untitled team"),
    memberCount: memberCounts.get(String(t.id)) ?? 0,
  }));

  return {
    data: {
      rows,
      activity,
      teams,
    },
    error: null,
  };
}