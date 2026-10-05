import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/organization";
import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";

const MAX_RANGE_DAYS = 180;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

type DateField = "job_date" | "due_date";

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

function parsePageSize(raw: string | null): number {
  const n = parseInt(raw || String(DEFAULT_PAGE_SIZE), 10);
  if (Number.isNaN(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, n));
}

interface SnapshotRow {
  record_id: string;
  board_id: string;
  workspace_id: string;
  client_id: string | null;
  job_date: string | null;
  due_date: string | null;
  volume: number | null;
  status: string | null;
  is_pending: boolean | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawDateField = searchParams.get("date_field");
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const clientId = searchParams.get("client_id");
  const clientSearch = searchParams.get("client_search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = parsePageSize(searchParams.get("page_size"));

  // ── Date-field validation + 180-day range cap (only when a date filter is active) ─
  const fieldValid = rawDateField === "job_date" || rawDateField === "due_date";
  const hasDateRange = !!startParam || !!endParam;

  if (hasDateRange && !fieldValid) {
    return NextResponse.json(
      {
        error:
          "date_field is required when start or end is provided. Use 'job_date' or 'due_date'.",
      },
      { status: 400 },
    );
  }

  let resolvedDateField: DateField | null = null;
  let startStr: string | null = null;
  let endStr: string | null = null;

  if (fieldValid && hasDateRange) {
    resolvedDateField = rawDateField as DateField;
    const today = getBusinessTimezoneToday();
    const startDate = parseDateParam(startParam, today);
    const endDate = parseDateParam(endParam, today);
    startStr = formatDate(startDate);
    endStr = formatDate(endDate);

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > MAX_RANGE_DAYS) {
      return NextResponse.json(
        {
          error: `Date range cannot exceed ${MAX_RANGE_DAYS} days. Requested range: ${diffDays} days.`,
        },
        { status: 400 },
      );
    }
  }

  // ── Organization scoping (reuses the Part 2 /snapshot auth + org-scoping pattern) ─
  const organizationId = await getUserOrganizationId();
  if (!organizationId) {
    return NextResponse.json(
      {
        error:
          "Unable to determine organization. Please ensure you are a member of a workspace.",
      },
      { status: 401 },
    );
  }

  const supabase = await createServiceClient();

  // Ensure the materialized snapshot is fresh before querying it.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  // ── Resolve free-text client search → list of canonical client_ids ─────────
  // (client_id always wins over client_search when both are supplied)
  let clientIds: string[] | null = null;
  if (!clientId && clientSearch) {
    const search = `%${clientSearch}%`;
    const [directRes, aliasRes] = await Promise.all([
      supabase
        .from("client_360_clients")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("canonical_name", search),
      supabase
        .from("client_360_client_aliases")
        .select("client_id")
        .eq("organization_id", organizationId)
        .ilike("alias_text", search),
    ]);

    if (directRes.error || aliasRes.error) {
      console.error("Failed to resolve client search:", directRes.error ?? aliasRes.error);
      return NextResponse.json(
        { error: "Failed to resolve client filter" },
        { status: 500 },
      );
    }

    const idSet = new Set<string>();
    for (const c of directRes.data ?? []) idSet.add(c.id);
    for (const a of aliasRes.data ?? []) idSet.add(a.client_id);

    if (idSet.size === 0) {
      return NextResponse.json({
        date_field: resolvedDateField,
        start: startStr,
        end: endStr,
        client_filter: null,
        total_pending: 0,
        clients_active: 0,
        boards_touched: 0,
        unmapped_boards: 0,
        results: [],
        page,
        page_size: pageSize,
        total_pages: 1,
      });
    }
    clientIds = Array.from(idSet);
  }

  // ── Pending snapshot query (is_pending filtered at the DB level, never client-side) ─
  let query = supabase
    .from("client_360_daily_snapshot")
    .select(
      "record_id, board_id, workspace_id, client_id, job_date, due_date, volume, status, is_pending",
    )
    .eq("organization_id", organizationId)
    .eq("is_pending", true);

  if (resolvedDateField) {
    query = query.gte(resolvedDateField, startStr!).lte(resolvedDateField, endStr!);
  }

  if (clientId) {
    query = query.eq("client_id", clientId);
  } else if (clientIds) {
    query = query.in("client_id", clientIds);
  }

  const { data: snapshots, error } = await query;

  if (error) {
    console.error("Failed to fetch pending work:", error);
    return NextResponse.json(
      { error: "Failed to fetch pending work data" },
      { status: 500 },
    );
  }

  type Row = SnapshotRow;
  const rows: Row[] = snapshots ?? [];

  if (rows.length === 0) {
    return NextResponse.json({
      date_field: resolvedDateField,
      start: startStr,
      end: endStr,
      client_filter: clientId ? { client_id: clientId, client_name: "" } : null,
      total_pending: 0,
      clients_active: 0,
      boards_touched: 0,
      unmapped_boards: 0,
      results: [],
      page,
      page_size: pageSize,
      total_pages: 1,
    });
  }

  // ── Resolve display names via bulk lookups (same pattern as Part 2 snapshot) ──
  const boardIds = Array.from(new Set(rows.map((r) => r.board_id)));
  const recordIds = Array.from(new Set(rows.map((r) => r.record_id)));
  const clientIdsInRows = Array.from(
    new Set(rows.map((r) => r.client_id).filter((id): id is string => id != null)),
  );

  const [boardsRes, clientsRes, recordsRes] = await Promise.all([
    supabase.from("boards").select("id, name, slug").in("id", boardIds),
    supabase.from("client_360_clients").select("id, canonical_name").in("id", clientIdsInRows),
    supabase.from("records").select("id, title").in("id", recordIds),
  ]);

  if (boardsRes.error) console.error("Failed to load boards for pending work:", boardsRes.error);
  if (clientsRes.error) console.error("Failed to load clients for pending work:", clientsRes.error);
  if (recordsRes.error) console.error("Failed to load records for pending work:", recordsRes.error);

  const boardNames = new Map((boardsRes.data ?? []).map((b) => [b.id, b]));
  const clientNames = new Map((clientsRes.data ?? []).map((c) => [c.id, c.canonical_name]));
  const recordTitles = new Map((recordsRes.data ?? []).map((r) => [r.id, r.title]));

  // ── Unmapped boards (same semantics as Part 2: lack a confirmed job_date mapping) ──
  const mappedBoardIds = new Set<string>();
  const { data: mappings } = await supabase
    .from("client_360_field_mappings")
    .select("board_id")
    .in("board_id", boardIds)
    .eq("field_type", "job_date")
    .eq("organization_id", organizationId);
  for (const m of mappings ?? []) mappedBoardIds.add(m.board_id);
  let unmappedBoards = 0;
  for (const bid of boardIds) {
    if (!mappedBoardIds.has(bid)) unmappedBoards++;
  }

  // ── Map snapshot rows → result items ──
  const sortKey: DateField = resolvedDateField ?? "job_date";
  const allItems = rows
    .map((s) => ({
      record_id: s.record_id,
      board_id: s.board_id,
      board_name: boardNames.get(s.board_id)?.name ?? "Unknown Board",
      client_id: s.client_id,
      client_name: (s.client_id ? clientNames.get(s.client_id) : null) ?? "Unknown Client",
      item_name: recordTitles.get(s.record_id) ?? s.record_id,
      status: s.status,
      job_date: s.job_date,
      due_date: s.due_date,
      assigned_to: [],
    }))
    .sort((a, b) => {
      const cn = a.client_name.localeCompare(b.client_name);
      if (cn !== 0) return cn;
      const da = a[sortKey] ?? "";
      const db = b[sortKey] ?? "";
      const d = da.localeCompare(db);
      if (d !== 0) return d;
      return a.record_id.localeCompare(b.record_id);
    });

  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const results = allItems.slice(startIdx, startIdx + pageSize);

  const clientFilter = clientId
    ? { client_id: clientId, client_name: results[0]?.client_name ?? "" }
    : null;

  const clientsActive = new Set(
    allItems.map((i) => i.client_id ?? i.client_name).filter(Boolean),
  ).size;

  return NextResponse.json({
    date_field: resolvedDateField,
    start: startStr,
    end: endStr,
    client_filter: clientFilter,
    total_pending: totalItems,
    clients_active: clientsActive,
    boards_touched: boardIds.length,
    unmapped_boards: unmappedBoards,
    results,
    page: safePage,
    page_size: pageSize,
    total_pages: totalPages,
  });
}
