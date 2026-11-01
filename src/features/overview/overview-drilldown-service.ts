import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  checkAndRefreshSnapshotIfNeeded,
  parseDateInput,
} from "@/features/client-360/daily-activity-service";
import { fetchDataBounds } from "@/features/overview/data-bounds";
import {
  narrowAllTimeRange,
  priorPeriod,
  type ResolvedTimeRange,
} from "@/features/overview/time-range";

export interface OverviewDrilldownItem {
  item_id: string;
  job_name: string;
  client: string | null;
  workspace_id: string;
  workspace_name: string;
  board_id: string;
  board_slug: string | null;
  board_name: string;
  group_name: string | null;
  job_type: string | null;
  status: string | null;
  assignee_name: string | null;
  received_at: string | null;
  completed_date: string | null;
  turnaround_days: number | null;
  due_date: string | null;
  days_from_today: number | null;
  bucket: string;
  priority: string | null;
  sku_volume: number;
  is_finished: boolean;
  assigned_to_me: boolean;
}

export interface OverviewDrilldownPayload {
  range: {
    id: string;
    label: string;
    from: string;
    to: string;
    days: number;
  };
  today: string;
  periodItems: OverviewDrilldownItem[];
  todayItems: OverviewDrilldownItem[];
  overdueItems: OverviewDrilldownItem[];
  upcomingItems: OverviewDrilldownItem[];
  boardsWithoutDueDate: Array<{ board_id: string; board_name: string }>;
  boardsWithCompletionDate: Array<{
    board_id: string;
    board_name: string;
    column_label: string;
  }>;
  resolvedSummary: {
    jobsReceived: number;
    jobsCompleted: number;
    clientsActive: number;
    priorClientsActive: number;
    boardsTouched: number;
    busiestClient: { name: string; count: number; priorCount: number } | null;
    turnaroundAvgDays: number | null;
    turnaroundSample: number;
    jobTypeSlices: Array<{
      key: string;
      label: string;
      jobs: number;
      percentage: number;
    }>;
  };
}

const FINISHED_STATUS_SET = new Set([
  "done",
  "completed",
  "complete",
  "delivered",
  "closed",
  "cancelled",
  "archived",
]);

const DUE_COL_NAMES = new Set([
  "due date",
  "due",
  "deadline",
  "delivery date",
  "target date",
  "date",
]);

const RECEIVED_COL_NAMES = new Set([
  "receive date post production",
  "receive date",
  "received date",
  "inward date",
  "received",
  "created date",
  "job date",
]);

const COMPLETED_COL_NAMES = new Set([
  "date of upload",
  "upload date",
  "completed date",
  "completion date",
  "delivered date",
]);

const CLIENT_COL_NAMES = new Set([
  "client / company name",
  "client name",
  "client",
  "customer",
  "company",
]);

const ITEM_FALLBACK_COL_NAMES = new Set([
  "item name",
  "files name",
]);

const BATCH_COL_NAMES = new Set([
  "batch details (pfm1_no)",
  "saleno.",
]);

const TYPE_COL_NAMES = new Set([
  "type of job",
  "job type",
  "type",
  "job category",
  "requirement",
  "comment",
  "remarks",
]);

const STATUS_COL_NAMES = new Set([
  "status",
  "upload status",
  "tat",
  "state",
]);

const ASSIGNEE_COL_NAMES = new Set([
  "assigned to",
  "assignee",
  "owner",
  "artist name",
]);

const PRIORITY_COL_NAMES = new Set([
  "priority",
  "urgency",
]);

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayISTString(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return formatDateISO(new Date());
  }
}

function diffCalendarDays(targetISO: string, baseISO: string): number {
  const [ty, tm, td] = targetISO.split("-").map(Number);
  const [by, bm, bd] = baseISO.split("-").map(Number);
  const tUtc = Date.UTC(ty, tm - 1, td);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((tUtc - bUtc) / 86400000);
}

function computeDueBucket(dueISO: string | null, todayISO: string): {
  daysFromToday: number | null;
  bucket: string;
} {
  if (!dueISO) return { daysFromToday: null, bucket: "No due date" };
  const diff = diffCalendarDays(dueISO, todayISO);
  if (diff < 0) return { daysFromToday: diff, bucket: "Overdue" };
  if (diff === 0) return { daysFromToday: 0, bucket: "Due today" };
  if (diff === 1) return { daysFromToday: 1, bucket: "Tomorrow" };
  if (diff <= 7) return { daysFromToday: diff, bucket: "This week" };
  return { daysFromToday: diff, bucket: "Later" };
}

function normalizeColLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanDisplayLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCellText(
  rawVal: unknown,
  rawText: string | null | undefined,
  optionMap: Map<string, string>,
): string | null {
  let candidate: string | null = null;
  if (rawVal !== null && rawVal !== undefined) {
    if (typeof rawVal === "string") {
      candidate = rawVal.trim();
    } else if (typeof rawVal === "number" || typeof rawVal === "boolean") {
      candidate = String(rawVal);
    } else if (Array.isArray(rawVal)) {
      const parts = rawVal
        .map((item) => {
          if (typeof item === "string") return optionMap.get(item) ?? item;
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const id = String(obj.id ?? obj.value ?? "");
            return (
              (id && optionMap.get(id)) ||
              String(obj.label ?? obj.name ?? obj.text ?? obj.value ?? "")
            );
          }
          return "";
        })
        .filter(Boolean);
      candidate = parts.join(", ");
    } else if (typeof rawVal === "object") {
      const obj = rawVal as Record<string, unknown>;
      const id = String(obj.id ?? obj.value ?? "");
      candidate =
        (id && optionMap.get(id)) ||
        String(obj.label ?? obj.name ?? obj.text ?? obj.title ?? obj.value ?? "");
    }
  }
  if (!candidate && rawText) {
    candidate = rawText.trim();
  }
  if (!candidate) return null;
  const cleaned = candidate.replace(/^"+|"+$/g, "").trim();
  if (!cleaned || ["null", "undefined", "-"].includes(cleaned.toLowerCase())) {
    return null;
  }
  return optionMap.get(cleaned) ?? cleaned;
}

function extractCellDateISO(
  rawVal: unknown,
  rawText: string | null | undefined,
): string | null {
  let rawStr: string | null = null;
  if (rawVal && typeof rawVal === "object" && !Array.isArray(rawVal)) {
    const obj = rawVal as Record<string, unknown>;
    const picked = obj.end ?? obj.to ?? obj.date ?? obj.start ?? obj.value;
    if (typeof picked === "string") rawStr = picked;
  } else if (typeof rawVal === "string") {
    rawStr = rawVal;
  }
  if (!rawStr && rawText) {
    rawStr = rawText;
  }
  if (!rawStr) return null;
  const parsed = parseDateInput(rawStr);
  if (!parsed) return null;
  return formatDateISO(parsed);
}

export async function fetchOverviewDrilldown(
  supabase: SupabaseClient,
  options: {
    organizationId: string;
    range: ResolvedTimeRange;
    boardIds?: string[] | null;
  },
): Promise<OverviewDrilldownPayload> {
  const { organizationId, range, boardIds = null } = options;
  const todayIST = getTodayISTString();

  await checkAndRefreshSnapshotIfNeeded(supabase);

  const bounds = await fetchDataBounds(supabase, organizationId, null);
  const window = narrowAllTimeRange(range, bounds);

  let currentUserId: string | null = null;
  let currentUserEmail: string | null = null;
  let currentUserName: string | null = null;
  try {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    currentUserId = user?.id ?? null;
    currentUserEmail = user?.email?.toLowerCase() ?? null;
    currentUserName =
      (user?.user_metadata?.full_name as string | undefined)?.toLowerCase() ?? null;
  } catch {
    // Non-fatal in background/test contexts
  }

  const [wsRes, boardsRes, groupsRes, colsRes, clientsTableRes] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name")
      .eq("organization_id", organizationId),
    supabase
      .from("boards")
      .select("id, name, slug, workspace_id, status")
      .eq("organization_id", organizationId)
      .neq("status", "archived"),
    supabase
      .from("groups")
      .select("id, name, board_id")
      .eq("organization_id", organizationId),
    supabase
      .from("columns")
      .select("id, board_id, label, type, settings, sort_order")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase
      .from("client_360_clients")
      .select("id, canonical_name")
      .eq("organization_id", organizationId),
  ]);

  const wsMap = new Map(
    (wsRes.data ?? []).map((w) => [String(w.id), String(w.name)]),
  );
  const allBoards = (boardsRes.data ?? []).filter((b) => {
    if (boardIds && boardIds.length > 0 && !boardIds.includes(String(b.id))) {
      return false;
    }
    return true;
  });
  const boardMap = new Map(allBoards.map((b) => [String(b.id), b]));
  const groupMap = new Map(
    (groupsRes.data ?? []).map((g) => [String(g.id), String(g.name)]),
  );
  const canonicalClientById = new Map(
    (clientsTableRes.data ?? []).map((c) => [
      String(c.id),
      String(c.canonical_name),
    ]),
  );

  const optionLabelMap = new Map<string, string>();
  const colsByBoard = new Map<
    string,
    Array<{
      id: string;
      label: string;
      normLabel: string;
      type: string;
      sortOrder: number;
    }>
  >();

  for (const col of colsRes.data ?? []) {
    const settings = col.settings as {
      options?: Array<{ id?: string; value?: string; label?: string }>;
    } | null;
    if (settings?.options && Array.isArray(settings.options)) {
      for (const opt of settings.options) {
        if (opt.label) {
          if (opt.id) optionLabelMap.set(String(opt.id), String(opt.label));
          if (opt.value) optionLabelMap.set(String(opt.value), String(opt.label));
        }
      }
    }
    const bId = String(col.board_id);
    if (!colsByBoard.has(bId)) colsByBoard.set(bId, []);
    colsByBoard.get(bId)!.push({
      id: String(col.id),
      label: cleanDisplayLabel(col.label as string),
      normLabel: normalizeColLabel(col.label as string),
      type: String(col.type),
      sortOrder: Number(col.sort_order ?? 0),
    });
  }

  const activeBoardIds = allBoards.map((b) => String(b.id));
  if (activeBoardIds.length === 0) {
    return {
      range: {
        id: window.id,
        label: window.label,
        from: window.from,
        to: window.to,
        days: window.days,
      },
      today: todayIST,
      periodItems: [],
      todayItems: [],
      overdueItems: [],
      upcomingItems: [],
      boardsWithoutDueDate: [],
      boardsWithCompletionDate: [],
      resolvedSummary: {
        jobsReceived: 0,
        jobsCompleted: 0,
        clientsActive: 0,
        priorClientsActive: 0,
        boardsTouched: 0,
        busiestClient: null,
        turnaroundAvgDays: null,
        turnaroundSample: 0,
        jobTypeSlices: [],
      },
    };
  }

  // Paginate records and client_360_daily_snapshot
  const activeRecords: Array<{
    id: string;
    title: string | null;
    board_id: string;
    workspace_id: string;
    group_id: string | null;
    status: string | null;
    archived_at: string | null;
    created_at: string | null;
    due_date: string | null;
  }> = [];
  for (let offset = 0; offset < 15000; offset += 1000) {
    const { data: recPage } = await supabase
      .from("records")
      .select(
        "id, title, board_id, workspace_id, group_id, status, archived_at, created_at, due_date",
      )
      .in("board_id", activeBoardIds)
      .eq("status", "active")
      .is("archived_at", null)
      .range(offset, offset + 999);
    if (!recPage || recPage.length === 0) break;
    activeRecords.push(...(recPage as typeof activeRecords));
    if (recPage.length < 1000) break;
  }

  const allSnapshots: Array<{
    record_id: string;
    board_id: string;
    job_date: string | null;
    due_date: string | null;
    completed_date: string | null;
    client_id: string | null;
    status: string | null;
    job_type: string | null;
    volume: number | null;
  }> = [];
  for (let offset = 0; offset < 15000; offset += 1000) {
    const { data: snapPage } = await supabase
      .from("client_360_daily_snapshot")
      .select(
        "record_id, board_id, job_date, due_date, completed_date, client_id, status, job_type, volume",
      )
      .eq("organization_id", organizationId)
      .range(offset, offset + 999);
    if (!snapPage || snapPage.length === 0) break;
    allSnapshots.push(...(snapPage as typeof allSnapshots));
    if (snapPage.length < 1000) break;
  }

  const snapByRecordId = new Map(
    allSnapshots.map((s) => [String(s.record_id), s]),
  );

  // Collect candidate column IDs across active boards
  const candidateColIds: string[] = [];
  for (const bId of activeBoardIds) {
    for (const c of colsByBoard.get(bId) ?? []) {
      if (
        DUE_COL_NAMES.has(c.normLabel) ||
        RECEIVED_COL_NAMES.has(c.normLabel) ||
        COMPLETED_COL_NAMES.has(c.normLabel) ||
        CLIENT_COL_NAMES.has(c.normLabel) ||
        ITEM_FALLBACK_COL_NAMES.has(c.normLabel) ||
        BATCH_COL_NAMES.has(c.normLabel) ||
        TYPE_COL_NAMES.has(c.normLabel) ||
        STATUS_COL_NAMES.has(c.normLabel) ||
        ASSIGNEE_COL_NAMES.has(c.normLabel) ||
        PRIORITY_COL_NAMES.has(c.normLabel)
      ) {
        candidateColIds.push(c.id);
      }
    }
  }

  const allCells: Array<{
    record_id: string;
    column_id: string;
    board_id: string;
    value: unknown;
    value_text: string | null;
  }> = [];
  if (candidateColIds.length > 0) {
    for (let offset = 0; offset < 15000; offset += 1000) {
      const { data: page } = await supabase
        .from("cell_values")
        .select("record_id, column_id, board_id, value, value_text")
        .in("column_id", candidateColIds)
        .range(offset, offset + 999);
      if (!page || page.length === 0) break;
      allCells.push(...(page as typeof allCells));
      if (page.length < 1000) break;
    }
  }

  const colPopCount = new Map<string, number>();
  const cellByRecAndCol = new Map<
    string,
    { value: unknown; value_text: string | null }
  >();
  for (const cv of allCells) {
    const hasVal =
      (cv.value !== null && cv.value !== undefined && cv.value !== "") ||
      (cv.value_text !== null && cv.value_text.trim() !== "");
    if (hasVal) {
      colPopCount.set(cv.column_id, (colPopCount.get(cv.column_id) ?? 0) + 1);
      cellByRecAndCol.set(`${cv.record_id}:${cv.column_id}`, {
        value: cv.value,
        value_text: cv.value_text,
      });
    }
  }

  interface BoardFieldSpec {
    dueCol: { id: string; label: string } | null;
    receivedCols: Array<{ id: string; label: string }>;
    completedCols: Array<{ id: string; label: string }>;
    clientCols: Array<{ id: string; label: string }>;
    itemCols: Array<{ id: string; label: string }>;
    batchCols: Array<{ id: string; label: string }>;
    typeCols: Array<{ id: string; label: string }>;
    statusCols: Array<{ id: string; label: string }>;
    assigneeCols: Array<{ id: string; label: string }>;
    priorityCols: Array<{ id: string; label: string }>;
  }

  const boardSpecs = new Map<string, BoardFieldSpec>();
  const boardsWithoutDueDate: Array<{ board_id: string; board_name: string }> = [];
  const boardsWithCompletionDate: Array<{
    board_id: string;
    board_name: string;
    column_label: string;
  }> = [];

  for (const b of allBoards) {
    const bId = String(b.id);
    const boardCols = colsByBoard.get(bId) ?? [];
    const cols = boardCols.slice().sort((a, z) => {
      const popDiff =
        (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      return popDiff !== 0 ? popDiff : a.sortOrder - z.sortOrder;
    });

    const dueCandidates = cols
      .filter((c) => DUE_COL_NAMES.has(c.normLabel))
      .sort((a, z) => {
        const rank = (lbl: string) =>
          lbl === "due date"
            ? 1
            : lbl === "deadline"
              ? 2
              : lbl === "delivery date"
                ? 3
                : lbl === "target date"
                  ? 4
                  : lbl === "due"
                    ? 5
                    : 6;
        const rDiff = rank(a.normLabel) - rank(z.normLabel);
        if (rDiff !== 0) return rDiff;
        return (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      });

    const dueCol = dueCandidates[0]
      ? { id: dueCandidates[0].id, label: dueCandidates[0].label }
      : null;

    const completedCols = cols.filter((c) =>
      COMPLETED_COL_NAMES.has(c.normLabel),
    );

    const typeCols = cols
      .filter((c) => TYPE_COL_NAMES.has(c.normLabel))
      .sort((a, z) => {
        const rank = (lbl: string) =>
          lbl === "type of job" || lbl === "job type"
            ? 1
            : lbl === "type" || lbl === "job category" || lbl === "requirement"
              ? 2
              : 3;
        const rDiff = rank(a.normLabel) - rank(z.normLabel);
        if (rDiff !== 0) return rDiff;
        return (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      });

    const statusCols = cols
      .filter((c) => STATUS_COL_NAMES.has(c.normLabel))
      .sort((a, z) => {
        const rank = (lbl: string) =>
          lbl === "status" ? 1 : lbl === "upload status" ? 2 : lbl === "tat" ? 3 : 4;
        const rDiff = rank(a.normLabel) - rank(z.normLabel);
        if (rDiff !== 0) return rDiff;
        return (colPopCount.get(z.id) ?? 0) - (colPopCount.get(a.id) ?? 0);
      });

    boardSpecs.set(bId, {
      dueCol,
      receivedCols: cols.filter((c) => RECEIVED_COL_NAMES.has(c.normLabel)),
      completedCols,
      clientCols: cols.filter((c) => CLIENT_COL_NAMES.has(c.normLabel)),
      itemCols: cols.filter((c) => ITEM_FALLBACK_COL_NAMES.has(c.normLabel)),
      batchCols: cols.filter((c) => BATCH_COL_NAMES.has(c.normLabel)),
      typeCols,
      statusCols,
      assigneeCols: cols.filter((c) => ASSIGNEE_COL_NAMES.has(c.normLabel)),
      priorityCols: cols.filter((c) => PRIORITY_COL_NAMES.has(c.normLabel)),
    });

    if (boardCols.length > 0 && String(b.name) !== "Manage workspace") {
      if (!dueCol) {
        boardsWithoutDueDate.push({ board_id: bId, board_name: String(b.name) });
      }
      if (completedCols.length > 0) {
        boardsWithCompletionDate.push({
          board_id: bId,
          board_name: String(b.name),
          column_label: completedCols[0].label,
        });
      }
    }
  }

  const readFirstText = (
    recId: string,
    cols: Array<{ id: string }>,
  ): string | null => {
    for (const c of cols) {
      const cell = cellByRecAndCol.get(`${recId}:${c.id}`);
      if (cell) {
        const txt = extractCellText(cell.value, cell.value_text, optionLabelMap);
        if (txt) return txt;
      }
    }
    return null;
  };

  const readFirstDate = (
    recId: string,
    cols: Array<{ id: string }>,
  ): string | null => {
    for (const c of cols) {
      const cell = cellByRecAndCol.get(`${recId}:${c.id}`);
      if (cell) {
        const dt = extractCellDateISO(cell.value, cell.value_text);
        if (dt) return dt;
      }
    }
    return null;
  };

  const seenRecordIds = new Set<string>();
  const allItems: OverviewDrilldownItem[] = [];

  for (const rec of activeRecords) {
    const recId = String(rec.id);
    if (seenRecordIds.has(recId)) continue;
    seenRecordIds.add(recId);

    const bId = String(rec.board_id);
    const board = boardMap.get(bId);
    const spec = boardSpecs.get(bId);
    if (!board || !spec) continue;

    const snap = snapByRecordId.get(recId);

    const rawClient = readFirstText(recId, spec.clientCols);
    const rawItemName = readFirstText(recId, spec.itemCols);
    const rawBatch = readFirstText(recId, spec.batchCols);
    const snapClient = snap?.client_id
      ? canonicalClientById.get(String(snap.client_id)) ?? null
      : null;

    // Prefer genuine Client / Item Name cell values over a single-character test placeholder
    const resolvedClient =
      (rawClient && rawClient.length > 1 ? rawClient : null) ??
      rawItemName ??
      rawClient ??
      snapClient ??
      null;

    const jobType =
      readFirstText(recId, spec.typeCols) ??
      (snap?.job_type ? String(snap.job_type).trim() : null) ??
      null;

    const status =
      readFirstText(recId, spec.statusCols) ??
      (snap?.status
        ? optionLabelMap.get(String(snap.status)) ?? String(snap.status)
        : null) ??
      null;

    const assigneeName = readFirstText(recId, spec.assigneeCols);
    const priority = readFirstText(recId, spec.priorityCols);

    const snapJobDate = snap?.job_date ? String(snap.job_date).slice(0, 10) : null;
    const receivedAt = snapJobDate ?? readFirstDate(recId, spec.receivedCols);

    const snapCompletedDate = snap?.completed_date
      ? String(snap.completed_date).slice(0, 10)
      : null;
    const completedDate =
      snapCompletedDate ?? readFirstDate(recId, spec.completedCols);

    let turnaroundDays: number | null = null;
    if (receivedAt && completedDate) {
      const diff = diffCalendarDays(completedDate, receivedAt);
      if (diff >= 0) {
        turnaroundDays = diff;
      }
    }

    const dueDate =
      (spec.dueCol ? readFirstDate(recId, [spec.dueCol]) : null) ??
      (rec.due_date ? String(rec.due_date).slice(0, 10) : null) ??
      (snap?.due_date ? String(snap.due_date).slice(0, 10) : null);

    const statusNorm = (status ?? "").trim().toLowerCase();
    const isFinished =
      FINISHED_STATUS_SET.has(statusNorm) || Boolean(completedDate);

    const rawTitle = String(rec.title ?? "").trim();
    const isGenericImportTitle =
      !rawTitle || /^imported row \d+$/i.test(rawTitle);
    const jobName = isGenericImportTitle
      ? [resolvedClient ?? rawItemName, rawBatch].filter(Boolean).join(" — ") ||
        jobType ||
        rawTitle ||
        "Untitled job"
      : rawTitle;

    const { daysFromToday, bucket } = computeDueBucket(dueDate, todayIST);

    const assignedToMe = Boolean(
      assigneeName &&
        ((currentUserId && assigneeName === currentUserId) ||
          (currentUserEmail &&
            assigneeName.toLowerCase().includes(currentUserEmail)) ||
          (currentUserName &&
            assigneeName.toLowerCase().includes(currentUserName))),
    );

    allItems.push({
      item_id: recId,
      job_name: jobName,
      client: resolvedClient,
      workspace_id: String(rec.workspace_id),
      workspace_name: wsMap.get(String(rec.workspace_id)) ?? "Workspace",
      board_id: bId,
      board_slug: (board.slug as string | null) ?? null,
      board_name: String(board.name),
      group_name: rec.group_id ? groupMap.get(String(rec.group_id)) ?? null : null,
      job_type: jobType,
      status: status ?? (completedDate ? "Uploaded" : "In Progress"),
      assignee_name: assigneeName,
      received_at: receivedAt,
      completed_date: completedDate,
      turnaround_days: turnaroundDays,
      due_date: dueDate,
      days_from_today: daysFromToday,
      bucket,
      priority,
      sku_volume: Number(snap?.volume ?? 1),
      is_finished: isFinished,
      assigned_to_me: assignedToMe,
    });
  }

  // Filter items whose received_at is in [window.from, window.to]
  const periodItems = allItems
    .filter(
      (item) =>
        item.received_at !== null &&
        item.received_at >= window.from &&
        item.received_at <= window.to,
    )
    .sort((a, b) => (b.received_at ?? "").localeCompare(a.received_at ?? ""));

  const todayItems = allItems.filter(
    (item) =>
      item.received_at === todayIST ||
      (!item.is_finished && item.due_date === todayIST),
  );
  const overdueItems = allItems.filter(
    (item) =>
      !item.is_finished &&
      item.days_from_today !== null &&
      item.days_from_today < 0,
  );
  const upcomingItems = allItems.filter(
    (item) =>
      !item.is_finished &&
      item.days_from_today !== null &&
      item.days_from_today > 0 &&
      item.days_from_today <= 7,
  );

  // Compute resolved summary over periodItems + prior period
  const priorWin = priorPeriod(window);
  const priorItems = allItems.filter(
    (item) =>
      item.received_at !== null &&
      item.received_at >= priorWin.from &&
      item.received_at <= priorWin.to,
  );
  const priorClientCounts = new Map<string, number>();
  for (const item of priorItems) {
    if (item.client) {
      priorClientCounts.set(
        item.client,
        (priorClientCounts.get(item.client) ?? 0) + 1,
      );
    }
  }

  const clientCounts = new Map<string, number>();
  const boardSet = new Set<string>();
  const typeCounts = new Map<string, number>();
  let turnaroundSum = 0;
  let turnaroundSample = 0;
  let jobsCompletedCount = 0;

  for (const item of periodItems) {
    boardSet.add(item.board_id);
    if (item.client) {
      clientCounts.set(item.client, (clientCounts.get(item.client) ?? 0) + 1);
    }
    if (item.is_finished) {
      jobsCompletedCount++;
    }
    if (item.turnaround_days !== null) {
      turnaroundSum += item.turnaround_days;
      turnaroundSample++;
    }
    const typeKey = item.job_type?.trim() || "Unclassified";
    typeCounts.set(typeKey, (typeCounts.get(typeKey) ?? 0) + 1);
  }

  // Rank busiest client (preferring multi-character real client names when tied)
  const sortedClients = Array.from(clientCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0].length === 1 && b[0].length > 1) return 1;
    if (b[0].length === 1 && a[0].length > 1) return -1;
    return a[0].localeCompare(b[0]);
  });

  const busiestClient = sortedClients[0]
    ? {
        name: sortedClients[0][0],
        count: sortedClients[0][1],
        priorCount: priorClientCounts.get(sortedClients[0][0]) ?? 0,
      }
    : null;

  const totalPeriodJobs = periodItems.length;
  const jobTypeSlices = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, jobs]) => ({
      key: label === "Unclassified" ? "" : label,
      label,
      jobs,
      percentage: totalPeriodJobs > 0 ? (jobs / totalPeriodJobs) * 100 : 0,
    }));

  return {
    range: {
      id: window.id,
      label: window.label,
      from: window.from,
      to: window.to,
      days: window.days,
    },
    today: todayIST,
    periodItems,
    todayItems,
    overdueItems,
    upcomingItems,
    boardsWithoutDueDate,
    boardsWithCompletionDate,
    resolvedSummary: {
      jobsReceived: totalPeriodJobs,
      jobsCompleted: jobsCompletedCount,
      clientsActive: clientCounts.size,
      priorClientsActive: priorClientCounts.size,
      boardsTouched: boardSet.size,
      busiestClient,
      turnaroundAvgDays:
        turnaroundSample > 0
          ? Number((turnaroundSum / turnaroundSample).toFixed(1))
          : null,
      turnaroundSample,
      jobTypeSlices,
    },
  };
}
