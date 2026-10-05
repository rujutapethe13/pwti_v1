"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

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
import { formatCount, type StatCard, type StatCardsResult } from "@/features/overview/stat-cards";
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

function StatCardTile({ card }: { card: StatCard }) {
  return (
    <Card className="border-border/60 flex flex-col p-6 shadow-none">
      <p className="metric-eyebrow">{card.label}</p>

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
export function StatCardsSection({ rangeId, customRange }: StatCardsSectionProps) {
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
      {data?.cards.map((card) => (
        <StatCardTile key={card.id} card={card} />
      ))}
    </div>
  );
}
