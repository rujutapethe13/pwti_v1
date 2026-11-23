import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLiveJobScope, isCompletedUploaded } from "@/features/client-360/live-job-scope";
import { getTodayIST } from "@/features/client-360/live-job-scope";
import {
  addDays,
  buildBoardHref,
  getDailyListPanelMeta,
  sortPanelItems,
  UPCOMING_HORIZON_DAYS,
  type DailyListItem,
  type DailyListPanelId,
  type DailyListPanelPayload,
} from "@/features/overview/daily-lists";

const PANEL_LIMIT = 50;

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export interface FetchDailyListPanelOptions {
  organizationId: string;
  panel: DailyListPanelId;
  now?: Date;
  boardIds?: string[] | null;
}

export async function fetchDailyListPanel(
  _supabase: SupabaseClient,
  { organizationId, panel, boardIds = null }: FetchDailyListPanelOptions,
): Promise<DailyListPanelPayload & { generatedAt: string; todayIST: string; boardsWithoutDueDateList: Array<{ board_id: string; board_name: string }> }> {
  const scope = await getLiveJobScope(organizationId);
  const today = scope.todayIST;
  const todayDate = new Date(`${today}T00:00:00`);
  const horizonDate = toDateKey(addDays(todayDate, UPCOMING_HORIZON_DAYS));
  const meta = getDailyListPanelMeta(panel);

  let jobs = scope.jobs;
  if (boardIds && boardIds.length > 0) {
    const allowed = new Set(boardIds);
    jobs = jobs.filter((j) => allowed.has(j.board_id));
  }

  const isOpen = (j: (typeof jobs)[number]) => !isCompletedUploaded(j) && j.status_class !== "completed";

  let filtered = jobs.filter((j) => {
    if (panel === "today") {
      return j.received_date === today || j.due_date === today;
    }
    if (panel === "overdue") {
      return isOpen(j) && j.due_date != null && j.due_date < today;
    }
    // upcoming
    return isOpen(j) && j.due_date != null && j.due_date > today && j.due_date <= horizonDate;
  });

  const truncated = filtered.length > PANEL_LIMIT;
  filtered = filtered.slice(0, PANEL_LIMIT);

  const items: DailyListItem[] = filtered.map((j) => {
    const matched: ("job_date" | "due_date")[] = [];
    if (panel === "today") {
      if (j.received_date === today) matched.push("job_date");
      if (j.due_date === today) matched.push("due_date");
      if (matched.length === 0 && j.due_date === today) matched.push("due_date");
    } else {
      if (j.due_date) matched.push("due_date");
    }
    return {
      record_id: j.record_id,
      item_name: j.title || j.record_id,
      status: j.status,
      job_date: j.received_date,
      due_date: j.due_date,
      matched,
      board_id: j.board_id,
      board_name: j.board_name,
      board_slug: j.board_slug ?? j.board_id,
      workspace_id: j.workspace_id,
      workspace_name: j.workspace_name,
      href: buildBoardHref(j.board_slug ?? j.board_id, j.board_id),
    };
  });

  return {
    panel,
    title: meta.title,
    description: meta.description,
    anchorDate: today,
    horizonDate: panel === "upcoming" ? horizonDate : null,
    items: sortPanelItems(items, panel),
    truncated,
    boardsWithoutDueDate: scope.boardsWithoutDueDate.length,
    generatedAt: scope.generatedAt,
    todayIST: scope.todayIST,
    boardsWithoutDueDateList: scope.boardsWithoutDueDate,
  };
}
