import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkAndRefreshSnapshotIfNeeded } from "@/features/client-360/daily-activity-service";
import { toDateKey } from "@/features/overview/time-range";
import {
  addDays,
  buildBoardHref,
  businessToday,
  getDailyListPanelMeta,
  matchPanel,
  matchedDateFields,
  readDayKey,
  sortPanelItems,
  UPCOMING_HORIZON_DAYS,
  type DailyListItem,
  type DailyListPanelId,
  type DailyListPanelPayload,
  type DailyListSnapshotRow,
} from "@/features/overview/daily-lists";

/** Upper bound on rows returned per panel; the UI is told when more exist. */
const PANEL_LIMIT = 50;

const SNAPSHOT_COLUMNS =
  "record_id, board_id, workspace_id, job_date, due_date, status, is_pending";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "unknown error");
  }
  return String(error);
}

/**
 * The panel window, expressed as PostgREST filters:
 *
 *   - today    : job_date = today OR due_date = today. No status filter — the
 *                panel reports what is on the books today, done or not.
 *   - overdue  : due_date < today, is_pending = true.
 *   - upcoming : today < due_date <= horizon, is_pending = true.
 *
 * `is_pending` is the only evidence available that a job is not complete; a row
 * the snapshot could not resolve is left out rather than assumed to be open.
 */
function buildPanelQuery(
  supabase: SupabaseClient,
  organizationId: string,
  panel: DailyListPanelId,
  today: string,
  horizonDate: string,
) {
  const base = supabase
    .from("client_360_daily_snapshot")
    .select(SNAPSHOT_COLUMNS)
    .eq("organization_id", organizationId);

  switch (panel) {
    case "today":
      return base.or(`job_date.eq.${today},due_date.eq.${today}`);
    case "overdue":
      return base.not("due_date", "is", null).lt("due_date", today).eq("is_pending", true);
    case "upcoming":
      return base
        .not("due_date", "is", null)
        .gt("due_date", today)
        .lte("due_date", horizonDate)
        .eq("is_pending", true);
  }
}

function asRows(data: unknown): DailyListSnapshotRow[] {
  if (!Array.isArray(data)) return [];
  return data as DailyListSnapshotRow[];
}

/**
 * Boards in the organization with no due-date field mapped. Reported so a short
 * Overdue/Upcoming list is never mistaken for "nothing is outstanding" when the
 * real cause is missing configuration. Returns null when it cannot be measured.
 */
async function countBoardsWithoutDueDate(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number | null> {
  try {
    const [boardsResult, mappingsResult] = await Promise.all([
      supabase
        .from("boards")
        .select("id")
        .eq("organization_id", organizationId)
        .neq("status", "archived"),
      supabase
        .from("client_360_field_mappings")
        .select("board_id")
        .eq("organization_id", organizationId)
        .eq("field_type", "due_date"),
    ]);

    if (boardsResult.error || !boardsResult.data) return null;

    const mapped = new Set(
      (mappingsResult.data ?? []).map((row) => String(row.board_id)),
    );
    return (boardsResult.data as Array<{ id: string }>).filter(
      (board) => !mapped.has(String(board.id)),
    ).length;
  } catch (err) {
    // Supplementary only — it must never blank out the panel itself.
    console.warn("[Overview] Could not count boards without a due date:", err);
    return null;
  }
}

export interface FetchDailyListPanelOptions {
  organizationId: string;
  panel: DailyListPanelId;
  /** Injectable clock, so "now" is testable. */
  now?: Date;
}

/**
 * Loads one daily activity panel.
 *
 * Every value comes from the database. A failed query throws so the panel can
 * show an error and a retry — there is no fallback list, no synthetic row, and
 * an item whose record has since disappeared is dropped rather than rendered as
 * a dangling link.
 */
export async function fetchDailyListPanel(
  supabase: SupabaseClient,
  { organizationId, panel, now = new Date() }: FetchDailyListPanelOptions,
): Promise<DailyListPanelPayload> {
  const todayDate = businessToday(now);
  const today = toDateKey(todayDate);
  const horizonDate = toDateKey(addDays(todayDate, UPCOMING_HORIZON_DAYS));
  const meta = getDailyListPanelMeta(panel);

  // Records written moments ago only reach the snapshot after a refresh.
  await checkAndRefreshSnapshotIfNeeded(supabase);

  const { data, error } = await buildPanelQuery(
    supabase,
    organizationId,
    panel,
    today,
    horizonDate,
  ).limit(PANEL_LIMIT + 1);

  if (error) {
    throw new Error(
      `Failed to load ${meta.title.toLowerCase()}: ${errorMessage(error)}`,
    );
  }

  // The window above is a pre-filter; re-check every row against the same rule
  // the rest of the app uses so the panel can only ever contain what it claims.
  const rows = asRows(data)
    .filter((row) => matchPanel(row, today, horizonDate) === panel)
    .slice(0, PANEL_LIMIT);

  const boardsWithoutDueDate = await countBoardsWithoutDueDate(
    supabase,
    organizationId,
  );

  if (rows.length === 0) {
    return {
      panel,
      title: meta.title,
      description: meta.description,
      anchorDate: today,
      horizonDate: panel === "upcoming" ? horizonDate : null,
      items: [],
      truncated: false,
      boardsWithoutDueDate,
    };
  }

  const recordIds = Array.from(new Set(rows.map((row) => row.record_id)));
  const boardIds = Array.from(new Set(rows.map((row) => row.board_id)));

  const [recordsResult, boardsResult] = await Promise.all([
    supabase.from("records").select("id, title").in("id", recordIds),
    supabase
      .from("boards")
      .select("id, name, slug, workspace_id")
      .in("id", boardIds),
  ]);

  if (recordsResult.error) {
    throw new Error(
      `Failed to load ${meta.title.toLowerCase()}: ${errorMessage(recordsResult.error)}`,
    );
  }
  if (boardsResult.error) {
    throw new Error(
      `Failed to load ${meta.title.toLowerCase()}: ${errorMessage(boardsResult.error)}`,
    );
  }

  const boards = (boardsResult.data ?? []) as Array<{
    id: string;
    name: string | null;
    slug: string | null;
    workspace_id: string | null;
  }>;
  const boardById = new Map(boards.map((board) => [String(board.id), board]));

  const workspaceIds = Array.from(
    new Set(
      boards
        .map((board) => board.workspace_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  let workspaceNames = new Map<string, string>();
  if (workspaceIds.length > 0) {
    const { data: workspaceRows, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);

    if (workspaceError) {
      throw new Error(
        `Failed to load ${meta.title.toLowerCase()}: ${errorMessage(workspaceError)}`,
      );
    }
    workspaceNames = new Map(
      (workspaceRows ?? []).map((row) => [String(row.id), String(row.name ?? "")]),
    );
  }

  const recordById = new Map(
    ((recordsResult.data ?? []) as Array<{ id: string; title: string | null }>).map(
      (record) => [String(record.id), record],
    ),
  );

  const items: DailyListItem[] = [];
  for (const row of rows) {
    const record = recordById.get(row.record_id);
    const board = boardById.get(row.board_id);
    // The snapshot can outlive a deleted record or board; an item that links to
    // nothing is worse than omitting it, so it is skipped rather than faked.
    if (!record || !board) {
      console.warn(
        `[Overview] ${panel}: snapshot row ${row.record_id} on board ${row.board_id} no longer resolves — skipped`,
      );
      continue;
    }

    const workspaceId =
      board.workspace_id ??
      (typeof row.workspace_id === "string" ? row.workspace_id : null);

    items.push({
      record_id: row.record_id,
      item_name:
        typeof record.title === "string" && record.title.trim().length > 0
          ? record.title
          : row.record_id,
      status:
        typeof row.status === "string" && row.status.length > 0
          ? row.status
          : null,
      job_date: readDayKey(row.job_date),
      due_date: readDayKey(row.due_date),
      matched: matchedDateFields(row, today),
      board_id: row.board_id,
      board_name: board.name,
      board_slug: board.slug ?? row.board_id,
      workspace_id: workspaceId,
      workspace_name: workspaceId
        ? (workspaceNames.get(workspaceId) ?? null)
        : null,
      href: buildBoardHref(board.slug ?? row.board_id, row.board_id),
    });
  }

  return {
    panel,
    title: meta.title,
    description: meta.description,
    anchorDate: today,
    horizonDate: panel === "upcoming" ? horizonDate : null,
    items: sortPanelItems(items, panel),
    truncated: asRows(data).length > PANEL_LIMIT,
    boardsWithoutDueDate,
  };
}
