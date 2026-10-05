import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";

const MAX_RANGE_DAYS = 180;

function parseDateParam(param: string | null, fallback: Date): Date {
  if (!param) return fallback;
  const [year, month, day] = param.split("-").map(Number);
  if (year && month && day) {
    return new Date(year, month - 1, day);
  }
  return fallback;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBusinessTimezoneToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const today = getBusinessTimezoneToday();
  const startDate = parseDateParam(startParam, today);
  const endDate = parseDateParam(endParam, today);

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      {
        error: `Date range cannot exceed ${MAX_RANGE_DAYS} days. Requested range: ${diffDays} days.`,
      },
      { status: 400 }
    );
  }

  const organizationId = await getUserOrganizationId();
  if (!organizationId) {
    return NextResponse.json(
      { error: "Unable to determine organization. Please ensure you are a member of a workspace." },
      { status: 401 }
    );
  }

  const supabase = await createServiceClient();

  // Ensure the materialized snapshot is fresh before querying it.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  const { data: snapshots, error } = await supabase
    .from("client_360_daily_snapshot")
    .select("job_date, client_id, volume, board_id, record_id")
    .eq("organization_id", organizationId)
    .gte("job_date", startStr)
    .lte("job_date", endStr);

  if (error) {
    console.error("Failed to fetch client_360_daily_snapshot:", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshot data" },
      { status: 500 }
    );
  }

  if (!snapshots || snapshots.length === 0) {
    const dailyBreakdown: Array<{ date: string; total: number }> = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dailyBreakdown.push({ date: formatDate(current), total: 0 });
      current.setDate(current.getDate() + 1);
    }
    return NextResponse.json({
      start: startStr,
      end: endStr,
      total_jobs: 0,
      clients_active: 0,
      boards_touched: 0,
      clients: [],
      daily_breakdown: dailyBreakdown,
      unmapped_boards: 0,
    });
  }

  const _totalJobs = snapshots.length;
  const totalVolume = snapshots.reduce((sum, s) => sum + (s.volume || 1), 0);

  const clientVolumeMap = new Map<string, { client_id: string; client_name: string; volume: number }>();
  const boardIds = new Set<string>();

  for (const s of snapshots) {
    boardIds.add(s.board_id);
    if (s.client_id) {
      const existing = clientVolumeMap.get(s.client_id);
      if (existing) {
        existing.volume += s.volume || 1;
      } else {
        clientVolumeMap.set(s.client_id, {
          client_id: s.client_id,
          client_name: "",
          volume: s.volume || 1,
        });
      }
    }
  }

  const clientNames = new Map<string, string>();
  if (clientVolumeMap.size > 0) {
    const clientIds = Array.from(clientVolumeMap.keys());
    const { data: clients } = await supabase
      .from("client_360_clients")
      .select("id, canonical_name")
      .in("id", clientIds);

    if (clients) {
      for (const c of clients) {
        clientNames.set(c.id, c.canonical_name);
      }
    }
  }

  for (const [clientId, info] of clientVolumeMap) {
    info.client_name = clientNames.get(clientId) || `Client ${clientId.slice(0, 8)}`;
  }

  const clientsArray = Array.from(clientVolumeMap.values())
    .sort((a, b) => b.volume - a.volume)
    .map((c) => ({
      client_id: c.client_id,
      client_name: c.client_name,
      count: c.volume,
    }));

  const dailyVolumeMap = new Map<string, number>();
  for (const s of snapshots) {
    const dateStr = formatDate(new Date(s.job_date));
    dailyVolumeMap.set(dateStr, (dailyVolumeMap.get(dateStr) || 0) + (s.volume || 1));
  }

  const dailyBreakdown: Array<{ date: string; total: number }> = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = formatDate(current);
    dailyBreakdown.push({
      date: dateStr,
      total: dailyVolumeMap.get(dateStr) || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  let unmappedBoards = 0;
  if (boardIds.size > 0) {
    const boardIdsArray = Array.from(boardIds);
    const { data: mappings } = await supabase
      .from("client_360_field_mappings")
      .select("board_id")
      .in("board_id", boardIdsArray)
      .eq("field_type", "job_date")
      .eq("organization_id", organizationId);

    const mappedBoardIds = new Set(mappings?.map((m) => m.board_id) || []);
    for (const bid of boardIdsArray) {
      if (!mappedBoardIds.has(bid)) {
        unmappedBoards++;
      }
    }
  }

  return NextResponse.json({
    start: startStr,
    end: endStr,
    total_jobs: totalVolume,
    clients_active: clientVolumeMap.size,
    boards_touched: boardIds.size,
    clients: clientsArray,
    daily_breakdown: dailyBreakdown,
    unmapped_boards: unmappedBoards,
  });
}