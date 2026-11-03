"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Search,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDaysAwayBadgeText } from "@/features/client-360/activity-drilldown-panel";
import type {
  OverviewDrilldownItem,
  OverviewDrilldownPayload,
} from "@/features/overview/overview-drilldown-service";
import type { StatCardId } from "@/features/overview/stat-cards";

export type OverviewDrilldownTarget =
  | StatCardId
  | "today_list"
  | "overdue_list"
  | "upcoming_list";

type OverviewGroupBy =
  | "job_type"
  | "client"
  | "board"
  | "status"
  | "workspace"
  | "none";

export interface OverviewDrilldownPanelProps {
  data: OverviewDrilldownPayload;
  activeTarget: OverviewDrilldownTarget;
  selectedDateFilter?: string | null;
  onClearDateFilter?: () => void;
  onClose: () => void;
}

function defaultGroupByForTarget(target: OverviewDrilldownTarget): OverviewGroupBy {
  switch (target) {
    case "clientsActive":
    case "busiestClient":
      return "client";
    case "boardsTouched":
    case "avgTurnaround":
      return "board";
    case "jobsCompleted":
      return "status";
    default:
      return "job_type";
  }
}

function getGroupKey(item: OverviewDrilldownItem, groupBy: OverviewGroupBy): string {
  switch (groupBy) {
    case "client":
      return item.client || "Unassigned Client";
    case "board":
      return item.board_name || "Board";
    case "status":
      return item.status || "In Progress";
    case "workspace":
      return item.workspace_name || "Workspace";
    case "job_type":
      return item.job_type || "Unclassified";
    case "none":
    default:
      return "All jobs";
  }
}

export function OverviewDrilldownPanel({
  data,
  activeTarget,
  selectedDateFilter = null,
  onClearDateFilter,
  onClose,
}: OverviewDrilldownPanelProps) {
  // Search is always empty by default and never persisted
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "open">("all");
  const [busiestScope, setBusiestScope] = useState<"top" | "all">("top");
  const [groupBy, setGroupBy] = useState<OverviewGroupBy>(() =>
    defaultGroupByForTarget(activeTarget),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSearchQuery("");
    setOnlyMine(false);
    setStatusFilter(activeTarget === "jobsCompleted" ? "all" : "all");
    setBusiestScope("top");
    setGroupBy(defaultGroupByForTarget(activeTarget));
    setCollapsedGroups(new Set());
  }, [activeTarget, selectedDateFilter]);

  const topClientName = data.resolvedSummary.busiestClient?.name ?? null;

  const baseItems = useMemo(() => {
    if (activeTarget === "today_list") return data.todayItems;
    if (activeTarget === "overdue_list") return data.overdueItems;
    if (activeTarget === "upcoming_list") return data.upcomingItems;

    let items = data.periodItems;
    if (selectedDateFilter) {
      items = items.filter((item) => item.received_at === selectedDateFilter);
    }
    if (activeTarget === "busiestClient" && busiestScope === "top" && topClientName) {
      items = items.filter((item) => item.client === topClientName);
    }
    return items;
  }, [
    activeTarget,
    busiestScope,
    data.overdueItems,
    data.periodItems,
    data.todayItems,
    data.upcomingItems,
    selectedDateFilter,
    topClientName,
  ]);

  const filteredItems = useMemo(() => {
    return baseItems.filter((item) => {
      if (onlyMine && !item.assigned_to_me) return false;
      if (statusFilter === "completed" && !item.is_finished) return false;
      if (statusFilter === "open" && item.is_finished) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          item.job_name,
          item.client,
          item.board_name,
          item.group_name,
          item.job_type,
          item.status,
          item.assignee_name,
          item.received_at,
          item.completed_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baseItems, onlyMine, searchQuery, statusFilter]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, OverviewDrilldownItem[]>();
    for (const item of filteredItems) {
      const key = getGroupKey(item, groupBy);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredItems, groupBy]);

  const panelTitle = useMemo(() => {
    if (selectedDateFilter) {
      return `Jobs received on ${selectedDateFilter}`;
    }
    switch (activeTarget) {
      case "jobsReceived":
        return `Jobs received (${data.range.from} → ${data.range.to})`;
      case "jobsCompleted":
        return `Jobs completed & status breakdown (${data.range.from} → ${data.range.to})`;
      case "clientsActive":
        return `Active clients & their jobs (${data.resolvedSummary.clientsActive} clients)`;
      case "boardsTouched":
        return `Boards touched in period (${data.resolvedSummary.boardsTouched} boards)`;
      case "busiestClient":
        return topClientName
          ? `Busiest client: ${topClientName} (${data.resolvedSummary.busiestClient?.count ?? 0} jobs)`
          : "Busiest client breakdown";
      case "avgTurnaround":
        return "Turnaround time breakdown (Upload / Completion Date − Receive Date)";
      case "today_list":
        return `Today's jobs (${data.today})`;
      case "overdue_list":
        return "Overdue open tasks & board due-date coverage";
      case "upcoming_list":
        return "Upcoming open tasks (next 7 days)";
      default:
        return "Overview details";
    }
  }, [activeTarget, data.range.from, data.range.to, data.resolvedSummary, data.today, selectedDateFilter, topClientName]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCsv = () => {
    const headers = [
      "Job Name",
      "Client",
      "Workspace",
      "Board",
      "Group",
      "Type of Job",
      "Status",
      "Assignee",
      "Received Date",
      "Completion / Upload Date",
      "Turnaround (Days)",
      "Due Date",
      "Days Away",
    ];
    const escapeCsv = (val: string | number | null | undefined) => {
      const s = String(val ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows = filteredItems.map((item) => [
      item.job_name,
      item.client ?? "",
      item.workspace_name,
      item.board_name,
      item.group_name ?? "",
      item.job_type ?? "Unclassified",
      item.status ?? "",
      item.assignee_name ?? "",
      item.received_at ?? "",
      item.completed_date ?? "",
      item.turnaround_days !== null ? item.turnaround_days : "",
      item.due_date ?? "",
      formatDaysAwayBadgeText(item.days_from_today).text,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `overview-${activeTarget}-${data.range.from}-to-${data.range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-primary/40 bg-card overflow-hidden border-2 shadow-sm">
      {/* Header */}
      <div className="bg-primary/5 border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-foreground text-sm font-semibold">{panelTitle}</h3>
          <Badge variant="default" className="text-xs">
            {filteredItems.length} {filteredItems.length === 1 ? "job" : "jobs"}
          </Badge>
          {selectedDateFilter && onClearDateFilter && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={onClearDateFilter}
            >
              Date: {selectedDateFilter}
              <X className="size-3" />
            </Button>
          )}
          {activeTarget === "busiestClient" && topClientName && (
            <div className="border-border bg-background inline-flex items-center rounded-md border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setBusiestScope("top")}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  busiestScope === "top"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {topClientName} only
              </button>
              <button
                type="button"
                onClick={() => setBusiestScope("all")}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  busiestScope === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All clients ({data.resolvedSummary.clientsActive})
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleExportCsv}
            disabled={filteredItems.length === 0}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Close details panel"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Contextual summary banner for Turnaround or Overdue boards */}
      {activeTarget === "avgTurnaround" && (
        <div className="border-border/60 bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5 text-xs">
          <span>
            {data.resolvedSummary.turnaroundAvgDays !== null ? (
              <>
                Average turnaround across{" "}
                <strong>{data.resolvedSummary.turnaroundSample}</strong>{" "}
                {data.resolvedSummary.turnaroundSample === 1 ? "job" : "jobs"} with a
                recorded upload/completion date:{" "}
                <strong className="text-foreground">
                  {data.resolvedSummary.turnaroundAvgDays} days
                </strong>{" "}
                (Upload Date − Receive Date Post Production).
              </>
            ) : (
              "No jobs in this date range have both a Receive Date and an Upload/Completion Date."
            )}
          </span>
          <span className="text-muted-foreground">
            {data.boardsWithCompletionDate.length} boards have an Upload/Completion Date
            column
          </span>
        </div>
      )}

      {activeTarget === "overdue_list" && data.boardsWithoutDueDate.length > 0 && (
        <div className="border-border/60 bg-amber-500/10 flex flex-col gap-1.5 border-b px-5 py-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              {data.boardsWithoutDueDate.length} boards do not have a dedicated Due Date
              column (their open items are placed in &ldquo;No due date&rdquo;, never
              guessed):
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {data.boardsWithoutDueDate.map((b) => (
              <Link
                key={b.board_id}
                href={`/${b.board_id}`}
                className="border-border bg-background hover:bg-accent inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px]"
              >
                {b.board_name}
                <ExternalLink className="size-2.5 opacity-60" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search, Group By & Quick Filters */}
      <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search job, client, board, type..."
              className="border-border bg-background h-8 w-56 rounded-md border pr-3 pl-8 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as OverviewGroupBy)}
              className="border-border bg-background h-8 rounded-md border px-2.5 text-xs focus:outline-none"
            >
              <option value="job_type">Type of job</option>
              <option value="client">Client</option>
              <option value="board">Board</option>
              <option value="status">Status</option>
              <option value="workspace">Workspace</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === "completed" ? "all" : "completed"))
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              statusFilter === "completed"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            Completed / Uploaded only
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === "open" ? "all" : "open"))}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              statusFilter === "open"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            In progress only
          </button>
          <button
            type="button"
            onClick={() => setOnlyMine((prev) => !prev)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              onlyMine
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            Assigned to me
          </button>
        </div>
      </div>

      {/* Grouped Rows or Single Empty State */}
      {filteredItems.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center py-10 text-center">
          <p className="text-foreground text-sm font-medium">
            No matching jobs for this selection
          </p>
          <p className="mt-1 text-xs">
            Try clearing the search/filter or selecting a wider date range (e.g. Last 30
            days or All time).
          </p>
        </div>
      ) : (
        <div className="divide-border/70 max-h-[460px] divide-y overflow-y-auto">
          {groupedItems.map(([groupKey, rows]) => {
            const isCollapsed = collapsedGroups.has(groupKey);
            return (
              <div key={groupKey}>
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  className="bg-muted/30 hover:bg-muted/50 flex w-full items-center justify-between px-5 py-2 text-left text-xs font-semibold transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    <span>{groupKey}</span>
                  </span>
                  <Badge variant="secondary" className="text-[11px]">
                    {rows.length} {rows.length === 1 ? "job" : "jobs"}
                  </Badge>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-border/60 text-muted-foreground border-b text-[11px] uppercase">
                          <th className="px-5 py-2 font-medium">Job / Item</th>
                          <th className="px-3 py-2 font-medium">Client</th>
                          <th className="px-3 py-2 font-medium">Board</th>
                          <th className="px-3 py-2 font-medium">Type of Job</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Received</th>
                          <th className="px-3 py-2 font-medium">Uploaded / Due</th>
                          <th className="px-3 py-2 font-medium">Turnaround / Badge</th>
                          <th className="px-5 py-2 text-right font-medium">Open</th>
                        </tr>
                      </thead>
                      <tbody className="divide-border/50 divide-y">
                        {rows.map((row) => {
                          const daysBadge = row.completed_date
                            ? formatDaysAwayBadgeText(row.days_from_today)
                            : { text: "Not uploaded", tone: "neutral" as const };
                          const openHref = `/${row.board_slug ?? row.board_id}?record=${row.item_id}`;
                          return (
                            <tr
                              key={row.item_id}
                              className="hover:bg-accent/40 transition-colors"
                            >
                              <td className="px-5 py-2.5 font-medium">
                                <div className="max-w-[220px] truncate" title={row.job_name}>
                                  {row.job_name}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {row.client ?? <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-medium">{row.board_name}</span>
                                {row.group_name && (
                                  <span className="text-muted-foreground ml-1 text-[11px]">
                                    ({row.group_name})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {row.job_type ? (
                                  <Badge variant="outline" className="text-[11px]">
                                    {row.job_type}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">
                                    Unclassified
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    row.is_finished
                                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                  )}
                                >
                                  {row.is_finished ? (
                                    <CheckCircle2 className="size-3" />
                                  ) : (
                                    <Clock className="size-3" />
                                  )}
                                  {row.status ?? (row.is_finished ? "Done" : "In Progress")}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">
                                {row.received_at ?? "—"}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">
                                {row.completed_date
                                  ? `Uploaded ${row.completed_date}`
                                  : "Not uploaded"}
                              </td>
                              <td className="px-3 py-2.5">
                                {row.turnaround_days !== null ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                                    {row.turnaround_days}d turnaround
                                  </span>
                                ) : (
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                      daysBadge.tone === "overdue"
                                        ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                        : daysBadge.tone === "today"
                                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                          : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {daysBadge.text}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-2.5 text-right">
                                <Link
                                  href={openHref}
                                  className="border-border bg-background hover:bg-accent inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors"
                                >
                                  Open
                                  <ExternalLink className="size-3" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
