"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  Download,
  ExternalLink,
  Filter,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ActivityGroupBy,
  ActivityMode,
  ActivityTaskRow,
  ActivityTasksResponse,
} from "./types";

const GROUP_OPTIONS: Array<{ value: ActivityGroupBy; label: string }> = [
  { value: "due_bucket", label: "Due bucket" },
  { value: "workspace", label: "Workspace" },
  { value: "board", label: "Board" },
  { value: "client", label: "Client" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
  { value: "job_type", label: "Type of job" },
  { value: "none", label: "None" },
];

const DUE_BUCKET_ORDER = [
  "Overdue",
  "Due today",
  "Tomorrow",
  "This week",
  "Later",
  "No due date",
];

export function formatDaysAwayBadgeText(daysFromToday: number | null): {
  text: string;
  tone: "overdue" | "today" | "upcoming" | "none";
} {
  if (daysFromToday === null || daysFromToday === undefined) {
    return { text: "No due date", tone: "none" };
  }
  if (daysFromToday === 0) {
    return { text: "Due today", tone: "today" };
  }
  if (daysFromToday === 1) {
    return { text: "Due tomorrow", tone: "upcoming" };
  }
  if (daysFromToday > 1) {
    return { text: `In ${daysFromToday} days`, tone: "upcoming" };
  }
  if (daysFromToday === -1) {
    return { text: "1 day overdue", tone: "overdue" };
  }
  return { text: `${Math.abs(daysFromToday)} days overdue`, tone: "overdue" };
}

function getGroupKey(item: ActivityTaskRow, groupBy: ActivityGroupBy): string {
  switch (groupBy) {
    case "due_bucket":
      return item.bucket || "No due date";
    case "workspace":
      return item.workspace_name || "Workspace";
    case "board":
      return item.board_name || "Board";
    case "client":
      return item.client || "—";
    case "assignee":
      return item.assignee_name || "Unassigned";
    case "status":
      return item.status || "—";
    case "job_type":
      return item.job_type || "—";
    case "none":
    default:
      return "All items";
  }
}

export interface ActivityDrilldownPanelProps {
  data: ActivityTasksResponse;
  selectedDate: string;
  mode: ActivityMode;
  card: string | null;
  defaultOnlyMine?: boolean;
  onClose?: () => void;
}

export function ActivityDrilldownPanel({
  data,
  selectedDate,
  mode,
  card,
  defaultOnlyMine = false,
  onClose,
}: ActivityDrilldownPanelProps) {
  // Search is ALWAYS empty by default and never persisted across visits
  const [searchQuery, setSearchQuery] = useState("");
  // Quick filters: ALL OFF by default; "Assigned to me" turns on ONLY when arriving from My work
  const [onlyMine, setOnlyMine] = useState<boolean>(defaultOnlyMine);
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [dueThisWeek, setDueThisWeek] = useState<boolean>(false);
  const [groupBy, setGroupBy] = useState<ActivityGroupBy>(
    mode === "due" ? "due_bucket" : "workspace",
  );
  const [dueSortDir, setDueSortDir] = useState<"asc" | "desc">("asc");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSearchQuery("");
    setOverdueOnly(false);
    setDueThisWeek(false);
    setOnlyMine(defaultOnlyMine);
    setGroupBy(mode === "due" ? "due_bucket" : "workspace");
    setCollapsedGroups(new Set());
  }, [mode, selectedDate, defaultOnlyMine]);

  const filteredItems = useMemo(() => {
    const base = data.items.filter((item) => {
      if (mode === "received") {
        if (item.received_at !== selectedDate) return false;
      } else {
        if (item.is_finished) return false;
        if (card === "due_today" && item.due_date !== selectedDate) return false;
        if (card === "overdue" && !(item.days_from_today !== null && item.days_from_today < 0)) {
          return false;
        }
        if (card === "upcoming" && !(item.days_from_today !== null && item.days_from_today > 0)) {
          return false;
        }
        if ((card === "no_due" || card === "no_due_date") && item.due_date !== null) return false;
      }

      if (onlyMine && !item.assigned_to_me) return false;
      if (overdueOnly && !(item.days_from_today !== null && item.days_from_today < 0)) {
        return false;
      }
      if (
        dueThisWeek &&
        !(item.days_from_today !== null && item.days_from_today >= 0 && item.days_from_today <= 7)
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const needle = searchQuery.trim().toLowerCase();
        const matches = [
          item.job_name,
          item.client,
          item.workspace_name,
          item.board_name,
          item.group_name,
          item.job_type,
          item.status,
          item.assignee_name,
          item.priority,
        ].some((val) => val?.toLowerCase().includes(needle));
        if (!matches) return false;
      }

      return true;
    });

    // Sort: Overdue (oldest first), then Due today, then Upcoming by nearest date (or reversed when desc)
    return base.slice().sort((a, b) => {
      if (a.due_date && b.due_date) {
        if (a.due_date !== b.due_date) {
          return dueSortDir === "asc"
            ? a.due_date.localeCompare(b.due_date)
            : b.due_date.localeCompare(a.due_date);
        }
      } else if (a.due_date && !b.due_date) {
        return -1;
      } else if (!a.due_date && b.due_date) {
        return 1;
      }
      return a.job_name.localeCompare(b.job_name);
    });
  }, [data.items, mode, selectedDate, card, onlyMine, overdueOnly, dueThisWeek, searchQuery, dueSortDir]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityTaskRow[]>();
    if (groupBy === "due_bucket") {
      for (const b of DUE_BUCKET_ORDER) {
        map.set(b, []);
      }
    }
    for (const item of filteredItems) {
      const key = getGroupKey(item, groupBy);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [filteredItems, groupBy]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleExportCsv = () => {
    const header = [
      "Task / Job",
      "Client",
      "Workspace",
      "Board",
      "Group",
      "Type of job",
      "Status",
      "Assignee",
      "Received date",
      "Due date",
      "Days away",
      "Bucket",
      "Priority",
    ];
    const rows = filteredItems.map((item) => [
      item.job_name,
      item.client ?? "—",
      item.workspace_name,
      item.board_name,
      item.group_name ?? "—",
      item.job_type ?? "—",
      item.status ?? "—",
      item.assignee_name ?? "—",
      item.received_at ?? "—",
      item.due_date ?? "—",
      formatDaysAwayBadgeText(item.days_from_today).text,
      item.bucket,
      item.priority ?? "—",
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${mode}-${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const unitLabel =
    mode === "due"
      ? filteredItems.length === 1
        ? "task"
        : "tasks"
      : filteredItems.length === 1
        ? "job"
        : "jobs";

  return (
    <Card className="border-border shadow-xs">
      <CardContent className="space-y-4 p-4">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Day details</h3>
            <span
              data-testid="day-details-count-badge"
              className="rounded-full bg-[#e6f1fd] px-2.5 py-0.5 text-xs font-semibold text-[#0073ea] dark:bg-blue-500/20 dark:text-blue-300"
            >
              {filteredItems.length} {unitLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDueSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title="Sort rows by due date"
            >
              <ArrowUpDown className="mr-1.5 size-3.5" />
              Due date ({dueSortDir === "asc" ? "Oldest first" : "Newest first"})
            </Button>

            <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-1.5 size-3.5" />
              Export CSV
            </Button>

            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onClose}
                aria-label="Close day details"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Search + Quick Filters + Group By */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs, clients, boards, job types..."
              aria-label="Search day details"
              className="border-input bg-background w-full rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#0073ea]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
            <Filter className="text-muted-foreground mr-0.5 size-3.5" />
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              aria-pressed={onlyMine}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                onlyMine
                  ? "border-[#0073ea] bg-[#e6f1fd] text-[#0073ea] dark:bg-blue-500/20 dark:text-blue-300"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Assigned to me
            </button>
            <button
              type="button"
              onClick={() => setOverdueOnly((v) => !v)}
              aria-pressed={overdueOnly}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                overdueOnly
                  ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Overdue only
            </button>
            <button
              type="button"
              onClick={() => setDueThisWeek((v) => !v)}
              aria-pressed={dueThisWeek}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                dueThisWeek
                  ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              Due this week
            </button>
          </div>

          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as ActivityGroupBy)}
            aria-label="Group by"
            className="border-input bg-background rounded-md border px-2.5 py-1.5 text-xs font-medium"
          >
            {GROUP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Group by: {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Single Empty State inside the panel */}
        {filteredItems.length === 0 ? (
          <div
            data-testid="day-details-empty-state"
            className="border-border flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center"
          >
            <CalendarDays className="text-muted-foreground/40 mb-2.5 size-9" />
            <h4 className="text-sm font-medium">
              {mode === "due" ? "Nothing due on this day" : "No jobs recorded for this day"}
            </h4>
            <p className="text-muted-foreground mt-1 text-xs">
              Try selecting a different date on the strip or clearing active filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(([groupName, groupItems]) => {
              const isCollapsed = collapsedGroups.has(groupName);
              const groupUnit =
                mode === "due"
                  ? groupItems.length === 1
                    ? "task"
                    : "tasks"
                  : groupItems.length === 1
                    ? "job"
                    : "jobs";

              const headerToneClass =
                groupName === "Overdue"
                  ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
                  : groupName === "Due today"
                    ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-border bg-muted/50 text-foreground";

              return (
                <div key={groupName} className="border-border overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupName)}
                    className={cn(
                      "flex w-full items-center justify-between border-b px-3 py-2 text-left text-xs font-semibold transition-colors",
                      headerToneClass,
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          isCollapsed && "-rotate-90",
                        )}
                      />
                      <span>{groupName}</span>
                    </span>
                    <span className="bg-background text-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                      {groupItems.length} {groupUnit}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="divide-border divide-y">
                      {groupItems.map((item) => {
                        const badge = formatDaysAwayBadgeText(item.days_from_today);
                        const badgeClass =
                          badge.tone === "overdue"
                            ? "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300"
                            : badge.tone === "today"
                              ? "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "border-border bg-muted text-muted-foreground";

                        return (
                          <div
                            key={item.item_id}
                            className="hover:bg-muted/30 flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-xs"
                          >
                            <div className="min-w-[220px] flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-foreground font-semibold">
                                  {item.job_name}
                                </span>
                                {item.job_type && (
                                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                    {item.job_type}
                                  </span>
                                )}
                                {item.priority && (
                                  <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0073ea] dark:text-blue-300">
                                    {item.priority}
                                  </span>
                                )}
                              </div>
                              <p className="text-muted-foreground mt-0.5 text-[11px]">
                                <span className="text-foreground font-medium">
                                  {item.client ?? "—"}
                                </span>
                                {" • "}
                                {item.workspace_name} → {item.board_name}
                                {item.group_name ? ` (${item.group_name})` : ""}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="border-border bg-background rounded border px-2 py-0.5 text-[11px]">
                                {item.status ?? "—"}
                              </span>
                              <span className="text-muted-foreground text-[11px]">
                                {item.assignee_name ?? "—"}
                              </span>
                              <span className="text-muted-foreground text-[11px]">
                                Rcvd: {item.received_at ?? "—"}
                              </span>
                              <span className="text-muted-foreground text-[11px]">
                                Due: {item.due_date ?? "—"}
                              </span>
                              <span
                                data-testid="days-away-badge"
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                  badgeClass,
                                )}
                              >
                                {badge.text}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  const target = `/${item.board_slug ?? item.board_id}?record=${encodeURIComponent(item.item_id)}`;
                                  window.location.assign(target);
                                }}
                              >
                                <ExternalLink className="mr-1 size-3" />
                                Open
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
