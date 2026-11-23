import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { format } from "date-fns";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { getLiveJobScope } from "@/features/client-360/live-job-scope";
import { narrowAllTimeRange, parseTimeRangeQuery, timeRangeQueryString } from "@/features/overview/time-range";
import { fetchDataBounds } from "@/features/overview/data-bounds";
import { pickVolumeGranularity } from "@/features/overview/volume-buckets";

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json({ error: "Unable to determine organization. Please ensure you are a member of a workspace." }, { status: 401 });
    }

    const supabase = await createServiceClient();
    const range = parseTimeRangeQuery(request.nextUrl.searchParams);
    const scope = await getLiveJobScope(organizationId);
    const dataBounds = await fetchDataBounds(supabase, organizationId, null);
    const window = narrowAllTimeRange(range, dataBounds);

    const boardIds = (request.nextUrl.searchParams.get("boards") ?? "")
      .split(",")
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

    let jobs = scope.jobs;
    if (boardIds.length > 0) {
      const allowed = new Set(boardIds);
      jobs = jobs.filter((j) => allowed.has(j.board_id));
    }
    const inWindow = jobs.filter((j) => j.received_date && j.received_date >= window.from && j.received_date <= window.to);

    const byBoard = new Map<string, { board_id: string; board_name: string; jobs: number }>();
    for (const j of inWindow) {
      const cur = byBoard.get(j.board_id) ?? { board_id: j.board_id, board_name: j.board_name, jobs: 0 };
      cur.jobs += 1;
      byBoard.set(j.board_id, cur);
    }
    const total = inWindow.length || 1;
    const workloadByTeam = [...byBoard.values()]
      .sort((a, b) => b.jobs - a.jobs || a.board_name.localeCompare(b.board_name))
      .map((row) => ({ team: row.board_name, jobs: row.jobs, percentage: (row.jobs / total) * 100 }));

    const { data: { user } } = await supabase.auth.getUser();
    const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || null;

    const ACTIVITY_LIMIT = 8;
    const fromIso = new Date(`${window.from}T00:00:00.000Z`).toISOString();
    const toIso = new Date(`${window.to}T23:59:59.999Z`).toISOString();
    const activityResult = await supabase
      .from("activity_logs")
      .select("id, action, payload, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT);

    const actionIcon: Record<string, string> = { "record.create": "Activity", "record.update": "Clock", "record.archive": "ListChecks", "record.restore": "Activity", "record.delete": "Zap", "record.duplicate": "Activity", "record.rename": "Clock", "record.move": "Clock", "cell.update": "Clock", "board.create": "Activity", "board.update": "Clock" };
    const actionTitle: Record<string, string> = { "record.create": "New job created", "record.update": "Job updated", "record.archive": "Job archived", "record.restore": "Job restored", "record.delete": "Job deleted", "record.duplicate": "Job duplicated", "record.rename": "Job renamed", "record.move": "Job moved", "cell.update": "Field updated", "board.create": "Board created", "board.update": "Board updated" };

    const activityFeed: Array<{ id: string; icon: string; title: string; detail: string; timestamp: string }> = [];
    let activityMissing = false;
    if (activityResult.error) {
      if (!activityResult.error.message.includes("relation") || !activityResult.error.message.includes("does not exist")) console.error("Activity log query error:", activityResult.error);
      activityMissing = true;
    } else if (activityResult.data) {
      for (const entry of activityResult.data) {
        const action = entry.action ?? "";
        let rawPayload = entry.payload ?? {};
        if (typeof rawPayload === "string") { try { rawPayload = JSON.parse(rawPayload); } catch { rawPayload = {}; } }
        const payload = rawPayload as Record<string, unknown>;
        const after = (payload.after ?? null) as Record<string, unknown> | null;
        const title = (after?.title as string) ?? (after?.name as string) ?? "";
        activityFeed.push({ id: entry.id, icon: actionIcon[action] ?? "Activity", title: actionTitle[action] ?? action.replace(/\./g, " "), detail: title || "Untitled", timestamp: entry.created_at ? format(new Date(entry.created_at), "MMM d, h:mm A") : "" });
      }
    }

    return NextResponse.json({
      range: { id: window.id, label: window.label, from: window.from, to: window.to, days: window.days, granularity: pickVolumeGranularity(window.days) },
      workloadByTeam,
      userName,
      activityFeed,
      activityMissing,
      generatedAt: scope.generatedAt,
      todayIST: scope.todayIST,
    });
  } catch (err) {
    console.error("Overview API error:", err);
    return NextResponse.json({ error: "Failed to fetch overview data" }, { status: 500 });
  }
}
