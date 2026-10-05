/**
 * Daily activity lists — pure query rules for the three "now"-relative panels.
 *
 * These panels are deliberately NOT scoped by the Overview range selector: they
 * always describe the current moment (today, whatever is already past due, and
 * the next `UPCOMING_HORIZON_DAYS` days). Only the dates the database returns
 * are filtered here, and `matchPanel` is the single source of truth for which
 * panel a snapshot row belongs to — the SQL window and this function must agree,
 * so the service re-checks every row it gets back instead of trusting the query.
 */

import { isDateKey } from "@/features/overview/time-range";

export const DAILY_LIST_PANELS = ["today", "overdue", "upcoming"] as const;

export type DailyListPanelId = (typeof DAILY_LIST_PANELS)[number];

/** "Upcoming" looks `UPCOMING_HORIZON_DAYS` days ahead, starting tomorrow. */
export const UPCOMING_HORIZON_DAYS = 7;

/** Which recorded date made a row land in a panel. */
export type DailyListDateField = "job_date" | "due_date";

/** A `client_360_daily_snapshot` row, as far as these panels are concerned. */
export interface DailyListSnapshotRow {
  record_id: string;
  board_id: string;
  workspace_id?: string | null;
  job_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  is_pending?: boolean | null;
}

/** One list item, carrying the board and workspace it came from. */
export interface DailyListItem {
  record_id: string;
  item_name: string;
  status: string | null;
  job_date: string | null;
  due_date: string | null;
  /** Recorded dates that qualified this row for the panel. */
  matched: DailyListDateField[];
  board_id: string;
  board_name: string | null;
  board_slug: string;
  workspace_id: string | null;
  workspace_name: string | null;
  /** Link back to the board the item lives on. */
  href: string;
}

export interface DailyListPanelPayload {
  panel: DailyListPanelId;
  title: string;
  description: string;
  /** The `YYYY-MM-DD` day the panel is anchored to ("now" in the business TZ). */
  anchorDate: string;
  /** Last day included in "upcoming"; null for the other panels. */
  horizonDate: string | null;
  items: DailyListItem[];
  /** True when more rows exist than were returned. */
  truncated: boolean;
  /**
   * Boards in this organization with no due-date field configured. Non-zero
   * means "overdue"/"upcoming" can be incomplete, which the UI must say out
   * loud rather than presenting a short list as the whole truth.
   */
  boardsWithoutDueDate: number | null;
}

const PANEL_META: Record<
  DailyListPanelId,
  { title: string; description: string }
> = {
  today: {
    title: "Today's jobs",
    description: "Received or due today",
  },
  overdue: {
    title: "Overdue",
    description: "Past its due date and not complete",
  },
  upcoming: {
    title: "Upcoming",
    description: `Due in the next ${UPCOMING_HORIZON_DAYS} days and not complete`,
  },
};

export function isDailyListPanelId(value: unknown): value is DailyListPanelId {
  return (
    typeof value === "string" &&
    (DAILY_LIST_PANELS as readonly string[]).includes(value)
  );
}

export function getDailyListPanelMeta(panel: DailyListPanelId): {
  title: string;
  description: string;
} {
  return PANEL_META[panel];
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Midnight of the current business day, matching the rest of Client 360. */
export function businessToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A date column value, or null when it is absent or not a real `YYYY-MM-DD`. */
export function readDayKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isDateKey(trimmed) ? trimmed : null;
}

/**
 * "Not complete" is only asserted when the snapshot says so. A null
 * `is_pending` means the board has no resolvable status, which is not the same
 * as "pending" — such rows are left out of Overdue and Upcoming rather than
 * guessed into them.
 */
export function isPendingRow(row: DailyListSnapshotRow): boolean {
  return row.is_pending === true;
}

export function matchedDateFields(
  row: DailyListSnapshotRow,
  today: string,
): DailyListDateField[] {
  const matched: DailyListDateField[] = [];
  if (readDayKey(row.job_date) === today) matched.push("job_date");
  if (readDayKey(row.due_date) === today) matched.push("due_date");
  return matched;
}

/**
 * The panel a row belongs to, or null when it belongs to none.
 *
 * Today wins over the other two: a job due today that is still open is a
 * today's job, not an overdue one.
 */
export function matchPanel(
  row: DailyListSnapshotRow,
  today: string,
  horizonDate: string,
): DailyListPanelId | null {
  if (matchedDateFields(row, today).length > 0) {
    return "today";
  }

  const dueDate = readDayKey(row.due_date);
  if (dueDate === null || !isPendingRow(row)) return null;

  if (dueDate < today) return "overdue";
  if (dueDate > today && dueDate <= horizonDate) return "upcoming";

  return null;
}

/** Board links are slug-based; a board without a slug falls back to its id. */
export function buildBoardHref(slug: string, boardId: string): string {
  return `/${encodeURIComponent(slug || boardId)}`;
}

function compareDates(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

/**
 * Panel ordering:
 *   today    — due today first, then received today; oldest date first.
 *   overdue  — most overdue first.
 *   upcoming — soonest first.
 * Ties fall back to the item name so the list is stable between requests.
 */
export function sortPanelItems(
  items: DailyListItem[],
  panel: DailyListPanelId,
): DailyListItem[] {
  return [...items].sort((a, b) => {
    if (panel === "today") {
      const aDueToday = a.matched.includes("due_date") ? 0 : 1;
      const bDueToday = b.matched.includes("due_date") ? 0 : 1;
      if (aDueToday !== bDueToday) return aDueToday - bDueToday;
    }

    const primary =
      panel === "today"
        ? compareDates(a.due_date, b.due_date) || compareDates(a.job_date, b.job_date)
        : compareDates(a.due_date, b.due_date);
    if (primary !== 0) return primary;

    return (
      a.item_name.localeCompare(b.item_name) ||
      a.record_id.localeCompare(b.record_id)
    );
  });
}
