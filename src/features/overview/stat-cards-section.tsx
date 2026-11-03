"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import {
  countOutsideRange,
  resolveSelectedTimeRange,
  timeRangeQueryString,
  type CustomRange,
  type TimeRangeId,
} from "@/features/overview/time-range";
import {
  buildCountTrend,
  formatCount,
  type StatCard,
  type StatCardId,
  type StatCardsResult,
} from "@/features/overview/stat-cards";
import type { OverviewDrilldownPayload } from "@/features/overview/overview-drilldown-service";
import { cn } from "@/lib/utils";

const SKELETON_CARD_COUNT = 6;

function StatCardsSkeleton() {
  return (
    <>
      {Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
        <Card key={i} className="border-border/60 p-6 shadow-none" aria-hidden="true">
          <Skeleton.Base className="h-2.5 w-20" />
          <Skeleton.Base className="mt-5 h-11 w-24" />
          <Skeleton.Base className="mt-5 h-2.5 w-full" />
        </Card>
      ))}
    </>
  );
}

/**
 * Sentiment is carried by one accent, not by a colour per card. A positive
 * trend reads in the highlight green, a negative one in the destructive red,
 * and everything else stays muted so the eye is only pulled to real movement.
 */
const sentimentClasses = {
  good: "text-highlight",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
} as const;

function StatCardTile({
  card,
  isActive = false,
  onSelect,
}: {
  card: StatCard;
  isActive?: boolean;
  onSelect?: (id: StatCardId) => void;
}) {
  const interactive = Boolean(onSelect);
  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onSelect?.(card.id) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(card.id);
              }
            }
          : undefined
      }
      className={cn(
        "border-border/60 flex flex-col p-6 shadow-none transition-all",
        interactive &&
          "hover:border-primary/60 cursor-pointer hover:-translate-y-0.5 hover:shadow-sm",
        isActive && "border-primary bg-primary/[0.03] ring-primary/30 ring-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="metric-eyebrow">{card.label}</p>
        {interactive && (
          <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[11px] font-medium">
            {isActive ? (
              <>
                Hide <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                Details <ChevronDown className="size-3" />
              </>
            )}
          </span>
        )}
      </div>

      {card.unavailable ? (
        <>
          <p className="text-muted-foreground/70 mt-4 text-lg font-medium">
            Not available
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            {card.unavailableReason}
          </p>
        </>
      ) : (
        <>
          <p className="metric-figure text-foreground mt-4 text-4xl sm:text-[2.75rem]">
            {card.value}
          </p>
          {card.detail && (
            <p className="text-muted-foreground mt-3 truncate text-sm">{card.detail}</p>
          )}
        </>
      )}

      {/* The definition of the number sits below the comparison, separated by a
          hairline, so the figure is read before the fine print. */}
      <div className="border-border/70 mt-auto border-t pt-4">
        <p
          className={cn(
            "text-xs font-medium tabular-nums",
            sentimentClasses[card.trend.sentiment],
          )}
        >
          {card.trend.label}
        </p>
        <p className="text-muted-foreground/80 mt-1 text-[11px] leading-snug">
          {card.caption}
        </p>
      </div>
    </Card>
  );
}

/**
 * Describes an empty window honestly.
 *
 * "No data in this period" on its own is indistinguishable from an empty
 * workspace, which is what made a full board look dead. When the coverage block
 * shows the workspace holds items the window cannot reach, that is stated with
 * the real count.
 */
function emptyRangeDescription(data: StatCardsResult): string {
  const window = `between ${data.range.from} and ${data.range.to}`;
  const { dated, undated } = countOutsideRange(data.coverage);

  if (dated === 0 && undated === 0) {
    return `Nothing was received ${window}.`;
  }

  const parts: string[] = [];
  if (dated > 0) {
    parts.push(
      `${formatCount(dated)} ${dated === 1 ? "item exists" : "items exist"} outside this range`,
    );
  }
  if (undated > 0) {
    parts.push(
      `${formatCount(undated)} ${undated === 1 ? "item has" : "items have"} no received date`,
    );
  }
  return `Nothing was received ${window}. ${parts.join(", and ")}.`;
}

interface StatCardsSectionProps {
  rangeId: TimeRangeId;
  /** Bounds for a "Custom range" selection. */
  customRange?: CustomRange | null;
  /** Additive: currently selected stat card for inline drilldown */
  activeCardId?: StatCardId | null;
  /** Additive: click callback to open inline drilldown panel */
  onSelectCard?: (cardId: StatCardId) => void;
  /** Additive: board-resolved summary to enrich unmapped client/turnaround details */
  resolvedSummary?: OverviewDrilldownPayload["resolvedSummary"] | null;
}

/**
 * Overview stat cards, self-contained.
 *
 * Fetches `/api/overview/stats` for the selected range and owns its own loading,
 * empty and error states, so a failure in this section is reported here and does
 * not take the rest of the page down with it. Values come only from the database;
 * nothing is substituted when a metric is missing — a card that cannot be
 * measured says so instead of showing a number.
 *
 * When the selected window is empty but the workspace holds data elsewhere, the
 * empty state says how many items sit outside the range rather than implying the
 * workspace is empty.
 */
export function StatCardsSection({
  rangeId,
  customRange,
  activeCardId = null,
  onSelectCard,
  resolvedSummary = null,
}: StatCardsSectionProps) {
  const rangeQuery = useMemo(
    () => timeRangeQueryString(resolveSelectedTimeRange(rangeId, customRange)),
    [rangeId, customRange],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatCardsResult | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview/stats?${rangeQuery}&range=${rangeId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load stat cards");
      }
      setData((await res.json()) as StatCardsResult);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load stat cards");
    } finally {
      setIsLoading(false);
    }
  }, [rangeQuery, rangeId]);

  useEffect(() => {
    load();
  }, [load]);

  const displayCards = useMemo(() => {
    if (!data?.cards) return [];
    if (!resolvedSummary) return data.cards;

    return data.cards.map((card) => {
      const days = data.range.days;

      if (card.id === "clientsActive") {
        return {
          ...card,
          unavailable: false,
          value: formatCount(resolvedSummary.clientsActive),
          trend: buildCountTrend(
            resolvedSummary.clientsActive,
            resolvedSummary.priorClientsActive,
            { days },
          ),
        };
      }
      if (card.id === "busiestClient" && resolvedSummary.busiestClient) {
        return {
          ...card,
          unavailable: false,
          value: formatCount(resolvedSummary.busiestClient.count),
          detail: resolvedSummary.busiestClient.name,
          caption: `Most jobs received by one client · ${resolvedSummary.busiestClient.name}`,
          trend: buildCountTrend(
            resolvedSummary.busiestClient.count,
            resolvedSummary.busiestClient.priorCount,
            { days },
          ),
        };
      }
      if (card.id === "avgTurnaround" && resolvedSummary.turnaroundAvgDays !== null) {
        return {
          ...card,
          unavailable: false,
          value: `${resolvedSummary.turnaroundAvgDays.toFixed(1)}d`,
          detail: `Across ${resolvedSummary.turnaroundSample} ${
            resolvedSummary.turnaroundSample === 1 ? "job" : "jobs"
          } with Uploaded date (${resolvedSummary.turnaroundExcluded} excluded)`,
          trend: {
            ...buildCountTrend(
              resolvedSummary.turnaroundAvgDays,
              resolvedSummary.priorTurnaroundAvgDays,
              { days, lowerIsBetter: true },
            ),
          },
          caption: "Mean days from Received to Uploaded",
        };
      }
      if (card.id === "jobsCompleted") {
        return {
          ...card,
          unavailable: false,
          value: formatCount(resolvedSummary.jobsCompleted),
          detail: `${resolvedSummary.completedWithUpload} with Uploaded date`,
          caption: "Jobs with status Done",
          trend: buildCountTrend(resolvedSummary.jobsCompleted, resolvedSummary.priorJobsCompleted, { days }),
        };
      }
      if (card.id === "jobsReceived") {
        return {
          ...card,
          value: formatCount(resolvedSummary.jobsReceived),
          trend: buildCountTrend(resolvedSummary.jobsReceived, resolvedSummary.priorJobsReceived, { days }),
        };
      }
      if (card.id === "boardsTouched") {
        return {
          ...card,
          value: formatCount(resolvedSummary.boardsTouched),
          trend: buildCountTrend(resolvedSummary.boardsTouched, resolvedSummary.priorBoardsTouched, { days }),
        };
      }
      return card;
    });
  }, [data, resolvedSummary]);

  if (error) {
    return (
      <ErrorState
        variant="inline"
        title="Stat cards unavailable"
        message={error}
        onRetry={load}
      />
    );
  }

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-5 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Loading stat cards"
      >
        <StatCardsSkeleton />
      </div>
    );
  }

  if (data?.isEmpty) {
    return (
      <EmptyState
        compact
        icon={BarChart3}
        title="No data in this period"
        description={emptyRangeDescription(data)}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
      {displayCards.map((card) => (
        <StatCardTile
          key={card.id}
          card={card}
          isActive={activeCardId === card.id}
          onSelect={onSelectCard}
        />
      ))}
    </div>
  );
}
