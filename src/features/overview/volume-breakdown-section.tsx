"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PieChart as PieChartIcon, RefreshCw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import {
  resolveSelectedTimeRange,
  timeRangeQueryString,
  type CustomRange,
  type TimeRangeId,
} from "@/features/overview/time-range";
import {
  formatPercent,
  OTHER_LABEL,
  toBreakdownSlices,
  UNCLASSIFIED_LABEL,
  type BreakdownPayload,
  type BreakdownSlice,
} from "@/features/overview/volume-breakdown";
import { cn } from "@/lib/utils";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function formatVolume(value: number): string {
  return NUMBER_FORMAT.format(value);
}

interface SliceTooltipEntry {
  active?: boolean;
  payload?: Array<{ payload: BreakdownSlice }>;
}

function BreakdownTooltip({ active, payload }: SliceTooltipEntry) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;

  return (
    <div className="border-border bg-card rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-foreground font-medium">{slice.label}</p>
      <p className="text-muted-foreground mt-0.5">
        {formatPercent(slice.percentage)} of volume
      </p>
      <p className="text-muted-foreground">
        {formatVolume(slice.volume)} volume · {formatVolume(slice.jobs)}{" "}
        {slice.jobs === 1 ? "job" : "jobs"}
      </p>
    </div>
  );
}

interface VolumeBreakdownSectionProps {
  rangeId: TimeRangeId;
  /** Bounds for a "Custom range" selection. */
  customRange?: CustomRange | null;
  className?: string;
  height?: number;
}

/**
 * Where the volume in the selected range actually came from, broken down by job
 * type.
 *
 * Job type is the grouping field because it is the one with real data here: an
 * audit found a populated "Job Type" dropdown, only two boards (one of them a
 * system board), and no client column at all. The percentages in the legend are
 * computed from the counts the database returned for the selected window, so the
 * numbers always describe the range the rest of the page is describing.
 *
 * Two honesty rules shape what is drawn:
 *
 *  - Records with no job type are never folded into a real category. They get
 *    their own "Unclassified" row, so the slices still add up to the real total
 *    and the gap is visible rather than hidden.
 *  - When no board maps a job-type column, the section says so. A single
 *    100%-wide slice would otherwise read as a meaningful breakdown when it is
 *    really just "we don't know".
 *
 * Data comes from `/api/overview/breakdown`, which aggregates real snapshot rows
 * in the database query; nothing is generated client-side. The section owns its
 * loading, empty and error states, so a failure leaves the rest of the page
 * intact.
 */
export function VolumeBreakdownSection({
  rangeId,
  customRange,
  className,
  height = 240,
}: VolumeBreakdownSectionProps) {
  const rangeQuery = useMemo(
    () => timeRangeQueryString(resolveSelectedTimeRange(rangeId, customRange)),
    [rangeId, customRange],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BreakdownPayload | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview/breakdown?${rangeQuery}&range=${rangeId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load volume breakdown");
      }
      setData((await res.json()) as BreakdownPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load volume breakdown");
    } finally {
      setIsLoading(false);
    }
  }, [rangeQuery, rangeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const breakdown = useMemo(() => (data ? toBreakdownSlices(data) : null), [data]);

  const rangeLabel = data?.range.label.toLowerCase() ?? "the selected period";
  const unclassified = breakdown?.slices.find((s) => s.isUnclassified) ?? null;

  const summary =
    isLoading || !breakdown
      ? `Loading volume by job type · ${rangeLabel}`
      : `${formatVolume(breakdown.totalVolume)} volume · ${rangeLabel} · ${breakdown.categoryCount} ${
          breakdown.categoryCount === 1 ? "job type" : "job types"
        }`;

  return (
    <Card className={cn("border-border/60 p-6 shadow-none", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-medium tracking-tight">
            <PieChartIcon
              className="text-muted-foreground/70 size-4 shrink-0"
              aria-hidden="true"
            />
            Volume by job type
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">{summary}</p>
        </div>

        {!isLoading && !error && data && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => void load()}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="mt-6" style={{ minHeight: height }} aria-busy={isLoading}>
        {isLoading ? (
          <Skeleton.Base className="w-full" style={{ height }} />
        ) : error ? (
          <ErrorState
            variant="inline"
            title="Volume breakdown unavailable"
            message={error}
            onRetry={() => void load()}
          />
        ) : breakdown?.isEmpty ? (
          <EmptyState
            compact
            icon={PieChartIcon}
            title="No volume in this period"
            description={`Nothing was received between ${data?.range.from} and ${data?.range.to}.`}
          />
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div style={{ height }} className="relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown!.slices}
                    dataKey="volume"
                    nameKey="label"
                    innerRadius="62%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {breakdown!.slices.map((slice) => (
                      <Cell key={slice.key} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<BreakdownTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                aria-hidden="true"
              >
                <span className="metric-figure text-foreground text-3xl">
                  {formatVolume(breakdown!.totalVolume)}
                </span>
                <span className="text-muted-foreground mt-2 text-[11px]">
                  total volume
                </span>
              </div>
            </div>

            {/* The legend is real text, not SVG: the percentages are the point of
                this chart, and they have to be readable and selectable. */}
            <ul className="flex min-w-0 flex-col justify-center gap-3.5">
              {breakdown!.slices.map((slice) => (
                <li key={slice.key} className="flex items-center gap-3 text-sm">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">
                    {slice.label}
                  </span>
                  <span className="text-foreground shrink-0 tabular-nums">
                    {formatPercent(slice.percentage)}
                  </span>
                  <span className="text-muted-foreground/80 w-12 shrink-0 text-right text-xs tabular-nums">
                    {formatVolume(slice.volume)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!isLoading && !error && breakdown && !breakdown.isEmpty && (
        <div className="border-border/70 mt-5 space-y-1.5 border-t pt-4">
          {breakdown.grouping.available ? (
            <>
              <p className="text-muted-foreground text-[11px] leading-snug">
                Shares are of the {formatVolume(breakdown.totalVolume)} volume received
                between {data?.range.from} and {data?.range.to}.
                {breakdown.rolledUp
                  ? ` Smaller job types are grouped under ${OTHER_LABEL}.`
                  : ""}
              </p>
              {unclassified ? (
                <p className="text-muted-foreground text-[11px] leading-snug">
                  {formatVolume(unclassified.volume)} volume across{" "}
                  {formatVolume(unclassified.jobs)}{" "}
                  {unclassified.jobs === 1 ? "job" : "jobs"} has no job type recorded, so
                  it is shown as {UNCLASSIFIED_LABEL} rather than folded into a real
                  category.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-[11px] leading-snug">
              No board here maps a job-type column, so every job in this range reads as{" "}
              {UNCLASSIFIED_LABEL}. Add a job-type column to a board to get a real
              breakdown.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
