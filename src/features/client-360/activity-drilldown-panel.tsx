"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ActivityData, ActivityGroupBy, ActivityItem } from "./types";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  ReferenceDot, ReferenceLine,
} from "recharts";

const GROUPS: Array<{ value: ActivityGroupBy; label: string }> = [
  { value: "workspace", label: "Workspace" },
  { value: "board", label: "Board" },
  { value: "client", label: "Client" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
  { value: "job_type", label: "Type of job" },
  { value: "due_bucket", label: "Due bucket" },
  { value: "none", label: "None" },
];

export function formatDaysAwayBadgeText(daysFromToday: number | null | undefined): {
  text: string;
  tone: "overdue" | "today" | "upcoming" | "none";
} {
  if (daysFromToday === null || daysFromToday === undefined) {
    return { text: "No due date", tone: "none" };
  }
  if (daysFromToday < 0) {
    const days = Math.abs(daysFromToday);
    return {
      text: `Overdue by ${days} day${days === 1 ? "" : "s"}`,
      tone: "overdue",
    };
  }
  if (daysFromToday === 0) {
    return { text: "Due today", tone: "today" };
  }
  return {
    text: `Due in ${daysFromToday} day${daysFromToday === 1 ? "" : "s"}`,
    tone: "upcoming",
  };
}

function groupKey(item: ActivityItem, groupBy: ActivityGroupBy): string {
  if (groupBy === "workspace") return item.workspace_name;
  if (groupBy === "board") return item.board_name;
  if (groupBy === "client") return item.client ?? "No client";
  if (groupBy === "assignee") return item.assignee_name ?? "Unassigned";
  if (groupBy === "status") return item.status ?? "No status";
  if (groupBy === "job_type") return item.job_type ?? "No type";
  if (groupBy === "due_bucket") return item.bucket;
  return "All jobs";
}

export function ActivityDrilldownPanel({
  data,
  selectedDate,
  mode,
  card,
}: {
  data: ActivityData;
  selectedDate: string;
  mode: "received" | "due";
  card: string;
}) {
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<ActivityGroupBy>(
    mode === "due" ? "due_bucket" : "workspace",
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setQuery("");
    setGroupBy(mode === "due" ? "due_bucket" : "workspace");
    setExpanded(new Set());
  }, [mode, selectedDate, card]);

  const items = useMemo(() => data.items.filter((item) => {
    if (mode === "received" && item.received_at.slice(0, 10) !== selectedDate) return false;
    if (mode === "due" && item.due_date !== selectedDate) return false;
    if (query) {
      const needle = query.toLowerCase();
      if (![item.job_name, item.client, item.workspace_name, item.board_name]
        .some((value) => value?.toLowerCase().includes(needle))) return false;
    }
    return true;
  }), [data.items, mode, query, selectedDate]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ActivityItem[]>();
    for (const item of items) {
      const key = groupKey(item, groupBy);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [groupBy, items]);

  const exportCsv = () => {
    const header = ["Job", "Client", "Workspace", "Board", "Status", "Assignee", "Received", "Due"];
    const rows = items.map((item) => [
      item.job_name, item.client ?? "", item.workspace_name, item.board_name,
      item.status ?? "", item.assignee_name ?? "", item.received_at, item.due_date ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {mode === "due" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Due today", items.length],
            ["Overdue", data.items.filter((item) => !item.is_finished && (item.days_from_today ?? 0) < 0).length],
            ["Upcoming", data.items.filter((item) => !item.is_finished && (item.days_from_today ?? 0) > 0).length],
            ["No due date", data.items.filter((item) => !item.is_finished && !item.due_date).length],
          ].map(([label, value]) => (
            <Card key={String(label)}><CardContent className="p-4">
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      {mode === "due" && (
        <Card><CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div><h3 className="text-lg font-semibold">Due volume</h3><p className="text-muted-foreground text-xs">Open tasks per due day, today highlighted</p></div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily_breakdown} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(value: string) => value.slice(5)} />
                <YAxis ticks={[0, 20, 40, 60, 80]} domain={[0, 80]} allowDataOverflow={false} />
                <Tooltip />
                <ReferenceLine x={data.today} stroke="hsl(var(--soft-teal-text))" strokeDasharray="4 4" label="Today" />
                <ReferenceDot
                  x={data.today}
                  y={data.daily_breakdown.find((day) => day.date === data.today)?.total ?? 0}
                  r={5}
                  fill="hsl(var(--soft-teal-text))"
                />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--soft-teal-text))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>
      )}
      <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">
            Day details <span className="text-muted-foreground text-sm">({items.length})</span>
          </h3>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1 size-4" />Export CSV
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search jobs, clients, boards..."
              className="border-input bg-background w-full rounded-md border py-2 pl-8 pr-2 text-sm"
            />
          </div>
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as ActivityGroupBy)}
            className="border-input bg-background rounded-md border px-2 text-sm"
          >
            {GROUPS.map((group) => (
              <option key={group.value} value={group.value}>Group by {group.label}</option>
            ))}
          </select>
        </div>
        {groups.map(([name, group]) => (
          <section key={name}>
            <button
              type="button"
              className="flex w-full items-center gap-2 border-b py-2 text-left font-medium"
              onClick={() => setExpanded((old) => {
                const next = new Set(old);
                if (next.has(name)) next.delete(name); else next.add(name);
                return next;
              })}
            >
              <ChevronDown className={cn("size-4 transition", !expanded.has(name) && "-rotate-90")} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="text-muted-foreground text-sm">{group.length} {mode === "due" ? "tasks" : "jobs"}</span>
            </button>
            {expanded.has(name) && group.map((item) => (
              <div key={item.item_id} className="flex flex-wrap items-center gap-3 border-b py-3 text-sm">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{item.job_name}</p>
                  <p className="text-muted-foreground">{item.client ?? "-"} - {item.workspace_name} - {item.board_name}</p>
                </div>
                <span>{item.status ?? "-"}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/${item.board_slug ?? item.board_id}?record=${encodeURIComponent(item.item_id)}`, "_self")}
                >
                  <ExternalLink className="mr-1 size-3" />Open
                </Button>
              </div>
            ))}
          </section>
        ))}
        {items.length === 0 && <p className="text-muted-foreground text-sm">No matching jobs.</p>}
      </CardContent>
    </Card>
    </div>
  );
}
