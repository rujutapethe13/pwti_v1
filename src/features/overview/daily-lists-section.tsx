"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CalendarCheck2,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import {
  DAILY_LIST_PANELS,
  getDailyListPanelMeta,
  type DailyListItem,
  type DailyListPanelId,
  type DailyListPanelPayload,
} from "@/features/overview/daily-lists";

const PANEL_ICONS: Record<DailyListPanelId, LucideIcon> = {
  today: CalendarCheck2,
  overdue: AlertTriangle,
  upcoming: CalendarClock,
};

const PANEL_EMPTY_COPY: Record<DailyListPanelId, { title: string; description: string }> =
  {
    today: {
      title: "Nothing scheduled for today",
      description: "No job was received or falls due on this day.",
    },
    overdue: {
      title: "Nothing overdue",
      description: "No open job has a due date in the past.",
    },
    upcoming: {
      title: "Nothing due this week",
      description: "No open job falls due in the next 7 days.",
    },
  };

const SKELETON_ROWS = 4;

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateLine(item: DailyListItem): string {
  if (item.matched.includes("due_date") && item.due_date) {
    return `Due ${formatDayLabel(item.due_date)}`;
  }
  if (item.matched.includes("job_date") && item.job_date) {
    return `Received ${formatDayLabel(item.job_date)}`;
  }
  if (item.due_date) return `Due ${formatDayLabel(item.due_date)}`;
  if (item.job_date) return `Received ${formatDayLabel(item.job_date)}`;
  return "";
}

function ListItem({ item }: { item: DailyListItem }) {
  const boardLabel = item.board_name ?? item.board_id;
  const workspaceLabel = item.workspace_name ?? item.workspace_id;

  return (
    <li>
      <Link
        href={item.href}
        className="group hover:bg-accent/60 focus-visible:bg-accent -mx-3 block rounded-md px-3 py-3 transition-colors focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-foreground min-w-0 truncate text-sm font-medium">
            {item.item_name}
          </p>
          {item.status && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {item.status}
            </Badge>
          )}
        </div>

        <p className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs">
          <span className="truncate">{boardLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{workspaceLabel}</span>
          <ExternalLink
            className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
            aria-hidden="true"
          />
        </p>

        {dateLine(item) && (
          <p className="text-muted-foreground/80 mt-1 text-[11px]">{dateLine(item)}</p>
        )}
      </Link>
    </li>
  );
}

interface DailyListPanelProps {
  panelId: DailyListPanelId;
}

/**
 * A single "now"-relative list. It fetches only its own panel, so it owns its
 * loading, empty and error state and a failure here leaves the other two lists
 * — and the rest of the page — untouched.
 */
function DailyListPanel({ panelId }: DailyListPanelProps) {
  const Icon = PANEL_ICONS[panelId];
  const emptyCopy = PANEL_EMPTY_COPY[panelId];
  const meta = getDailyListPanelMeta(panelId);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DailyListPanelPayload | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview/daily-lists?panel=${panelId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load ${meta.title.toLowerCase()}`);
      }
      setData((await res.json()) as DailyListPanelPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load this list");
    } finally {
      setIsLoading(false);
    }
  }, [panelId, meta.title]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];

  return (
    <Card className="border-border/60 flex flex-col p-6 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-medium tracking-tight">
            <Icon
              className="text-muted-foreground/70 size-4 shrink-0"
              aria-hidden="true"
            />
            {meta.title}
          </h2>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {meta.description}
          </p>
        </div>
        {!isLoading && !error && data && (
          <span className="metric-figure text-muted-foreground shrink-0 text-lg">
            {items.length}
          </span>
        )}
      </div>

      <div className="mt-5 flex-1">
        {isLoading ? (
          <Skeleton.List rows={SKELETON_ROWS} />
        ) : error ? (
          <ErrorState
            variant="inline"
            title={`${meta.title} unavailable`}
            message={error}
            onRetry={() => void load()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={Icon}
            title={emptyCopy.title}
            description={emptyCopy.description}
          />
        ) : (
          <ul className="divide-border/70 divide-y">
            {items.map((item) => (
              <ListItem key={`${item.board_id}-${item.record_id}`} item={item} />
            ))}
          </ul>
        )}
      </div>

      {!isLoading &&
        !error &&
        data &&
        panelId !== "today" &&
        data.boardsWithoutDueDate !== null &&
        data.boardsWithoutDueDate > 0 && (
          <p className="border-border/70 text-muted-foreground mt-5 flex items-start gap-2 border-t pt-4 text-[11px] leading-snug">
            <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden="true" />
            <span>
              {data.boardsWithoutDueDate}{" "}
              {data.boardsWithoutDueDate === 1 ? "board has" : "boards have"} no due-date
              field in this workspace, so this list may be incomplete.
            </span>
          </p>
        )}

      {!isLoading && !error && data?.truncated && (
        <p className="border-border/70 text-muted-foreground mt-5 border-t pt-4 text-[11px]">
          Showing the first {items.length} items — more match this list.
        </p>
      )}
    </Card>
  );
}

/**
 * Today's jobs, Overdue and Upcoming.
 *
 * Always relative to the current moment and independent of the Overview range
 * selector: changing the range does not re-query or re-scope these lists.
 */
export function DailyListsSection() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {DAILY_LIST_PANELS.map((panelId) => (
        <DailyListPanel key={panelId} panelId={panelId} />
      ))}
    </div>
  );
}
