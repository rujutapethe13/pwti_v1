import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { format } from "date-fns";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";
import {
  narrowAllTimeRange,
  parseTimeRangeQuery,
  toTimestampBounds,
} from "@/features/overview/time-range";
import { fetchDataBounds } from "@/features/overview/data-bounds";
import { pickVolumeGranularity } from "@/features/overview/volume-buckets";

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Unable to determine organization. Please ensure you are a member of a workspace." },
        { status: 401 }
      );
    }

    const supabase = await createServiceClient();

    // Every section below is queried for this window — no client-side slicing.
    // Stat cards are intentionally NOT part of this payload: they live in
    // /api/overview/stats, which aggregates the current and the immediately
    // preceding window in the database so their trends are real comparisons.
    // The volume trend is likewise not here: it has its own endpoint
    // (/api/overview/volume-trend) so it can own its loading and error state and
    // can return a completed series alongside the received one.
    const range = parseTimeRangeQuery(request.nextUrl.searchParams);

    // Refresh the materialized snapshot if a DB trigger marked it dirty
    // (records/cell_values insertions set needs_refresh = true).
    // Without this, newly created records won't appear in the panels
    // until the next scheduled pg_cron refresh.
    await checkAndRefreshSnapshotIfNeeded(supabase);

    // "All time" resolves to a sentinel before the data bounds are known. The
    // three section services narrow it, so without doing the same here this
    // route would echo `1900-01-01` and the page would caption the header
    // "Jan 1, 1900 – ..." while the sections above it showed the real span.
    const window = narrowAllTimeRange(
      range,
      await fetchDataBounds(supabase, organizationId, null),
    );
    const rangeFrom = window.from;
    const rangeTo = window.to;
    const { fromIso, toIso } = toTimestampBounds(window);

    // ── 1. Workload by team (range-scoped) ──

    // Group by board (as proxy for team) since no teams table exists.
    // The explicit high `range` is required: without it PostgREST silently
    // truncates at the project max-rows of 1000, and this org holds ~4,200
    // snapshot rows, so the shares would be computed from a fraction of the
    // data and still render as though they were real.
    const WORKLOAD_ROW_CEILING = 50_000;
    const workloadResult = await supabase
      .from("client_360_daily_snapshot")
      .select("board_id, volume")
      .eq("organization_id", organizationId)
      .gte("job_date", rangeFrom)
      .lte("job_date", rangeTo)
      .range(0, WORKLOAD_ROW_CEILING);

    if (
      workloadResult.data &&
      workloadResult.data.length >= WORKLOAD_ROW_CEILING
    ) {
      console.warn(
        `Overview workload panel hit its ${WORKLOAD_ROW_CEILING}-row ceiling; ` +
          `shares may under-report. Aggregate this in SQL instead of reading rows.`,
      );
    }

    // A failed query used to be indistinguishable from a studio with no
    // records: `data` is null, the map stayed empty, and the page rendered
    // "No team data" as though that were the real answer. Report the failure.
    if (workloadResult.error) {
      console.error("Failed to load workload by team:", workloadResult.error);
      return NextResponse.json(
        { error: "Failed to load workload by team" },
        { status: 500 },
      );
    }

    const boardVolumeMap = new Map<string, number>();
    for (const s of workloadResult.data ?? []) {
      boardVolumeMap.set(s.board_id, (boardVolumeMap.get(s.board_id) || 0) + (s.volume || 1));
    }

    const boardIds = Array.from(boardVolumeMap.keys());
    let workloadByTeam: Array<{ team: string; jobs: number; items: number; percentage: number }> = [];

    if (boardIds.length > 0) {
      const { data: boards } = await supabase
        .from("boards")
        .select("id, name")
        .in("id", boardIds)
        .neq("status", "archived");

      const totalJobs = Array.from(boardVolumeMap.values()).reduce((a, b) => a + b, 0);
      if (boards) {
        workloadByTeam = boards.map((b) => {
          const jobs = boardVolumeMap.get(b.id) || 0;
          return {
            team: b.name,
            jobs,
            items: jobs,
            percentage: totalJobs > 0 ? Math.round((jobs / totalJobs) * 100) : 0,
          };
        });
      }
    }

    // ── 4. Greeting: user name ──
    const { data: { user } } = await supabase.auth.getUser();
    const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

    // ── 5. Activity feed (from activity_logs, populated by the event-bus subscriber) ──
    // Scoped to the selected range by created_at, so the feed follows the selector.
    const ACTIVITY_LIMIT = 8;
    const activityResult = await supabase
      .from("activity_logs")
      .select("id, action, payload, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT);

    const actionIcon: Record<string, string> = {
      "record.create": "Activity",
      "record.update": "Clock",
      "record.archive": "ListChecks",
      "record.restore": "Activity",
      "record.delete": "Zap",
      "record.duplicate": "Activity",
      "record.rename": "Clock",
      "record.move": "Clock",
      "cell.update": "Clock",
      "board.create": "Activity",
      "board.update": "Clock",
    };

    const actionTitle: Record<string, string> = {
      "record.create": "New job created",
      "record.update": "Job updated",
      "record.archive": "Job archived",
      "record.restore": "Job restored",
      "record.delete": "Job deleted",
      "record.duplicate": "Job duplicated",
      "record.rename": "Job renamed",
      "record.move": "Job moved",
      "cell.update": "Field updated",
      "board.create": "Board created",
      "board.update": "Board updated",
    };

    const activityFeed: Array<{ id: string; icon: string; title: string; detail: string; timestamp: string }> = [];
    let activityMissing = false;

    if (activityResult.error) {
      if (
        !activityResult.error.message.includes("relation") ||
        !activityResult.error.message.includes("does not exist")
      ) {
        console.error("Activity log query error:", activityResult.error);
      }
      activityMissing = true;
    } else if (activityResult.data) {
      for (const entry of activityResult.data) {
        const action = entry.action ?? "";
        let rawPayload = entry.payload ?? {};
        if (typeof rawPayload === "string") {
          try { rawPayload = JSON.parse(rawPayload); } catch { rawPayload = {}; }
        }
        const payload = rawPayload as Record<string, unknown>;
        const after = (payload.after ?? null) as Record<string, unknown> | null;
        const title = (after?.title as string) ?? (after?.name as string) ?? "";

        activityFeed.push({
          id: entry.id,
          icon: actionIcon[action] ?? "Activity",
          title: actionTitle[action] ?? action.replace(/\./g, " "),
          detail: title || "Untitled",
          timestamp: entry.created_at
            ? format(new Date(entry.created_at), "MMM d, h:mm A")
            : "",
        });
      }
    }

    return NextResponse.json({
      range: {
        id: window.id,
        label: window.label,
        from: rangeFrom,
        to: rangeTo,
        // Read off the narrowed window, not the sentinel-resolved one: for "All
        // time" `range.days` was measured against 1900-01-01 and would pick a
        // month granularity that matches neither the caption nor the sections.
        days: window.days,
        granularity: pickVolumeGranularity(window.days),
      },
      workloadByTeam,
      userName,
      activityFeed,
      activityMissing,
    });
  } catch (err) {
    console.error("Overview API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch overview data" },
      { status: 500 }
    );
  }
}