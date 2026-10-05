"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import type { VolumeGranularity } from "@/features/overview/volume-buckets";
import {
  toVolumeTrendPoints,
  type VolumeMetric,
  type VolumeTrendPayload,
} from "@/features/overview/volume-trend";
import { cn } from "@/lib/utils";

const METRICS: ReadonlyArray<{
  id: VolumeMetric;
  label: string;
  shortLabel: string;
}> = [
  { id: "received", label: "Jobs received", shortLabel: "Received" },
  { id: "completed", label: "Jobs completed", shortLabel: "Completed" },
];

/** How each bucket size is described in the UI — never inferred from the label. */
const GRANULARITY_COPY: Record<VolumeGranularity, string> = {
  day: "daily buckets",
  week: "weekly buckets",
  month: "monthly buckets",
};

const BUCKET_COUNT: Record<VolumeGranularity, string> = {
  day: "1 day",
  week: "1 week",
  month: "1 month",
};

function formatTotal(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * An unambiguous label for the tooltip. A day bucket's own label is only a
 * weekday, so the date is spelled out; a month bucket's key is a year-month,
 * which already reads as a full date once the day is filled in.
 */
function fullBucketLabel(key: string, fallback: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const parsed = new Date(`${key}-01T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
  }
  const parsed = new Date(`${key}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ChartDatum {
  /** Unique bucket key — the x-axis identity, since labels repeat across a range. */
  key: string;
  /** Short label for the axis tick, e.g. "Thu" or "Sep 21". */
  axisLabel: string;
  /** Unambiguous label for the tooltip, e.g. "Thu, Sep 24, 2026". */
  fullLabel: string;
  value: number;
  received: number;
  completed: number;
  isToday: boolean;
}

interface TooltipEntry {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}

function TrendTooltip({
  active,
  payload,
  metric,
}: TooltipEntry & { metric: VolumeMetric }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const metricLabel = METRICS.find((m) => m.id === metric)?.shortLabel ?? metric;
  const secondary = metric === "received" ? point.completed : point.received;

  return (
    <div className="border-border bg-card rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="text-foreground font-medium">
        {point.fullLabel}
        {point.isToday ? " · today" : ""}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {metricLabel}:{" "}
        <span className="text-foreground font-semibold">{point.value}</span>
      </p>
      <p className="text-muted-foreground">
        {metric === "received" ? "Completed" : "Received"}: {secondary}
      </p>
    </div>
  );
}

function emptyTrendDescription(
  data: VolumeTrendPayload | null,
  metric: VolumeMetric,
): string {
  if (!data) return "Nothing to show for the selected period.";

  const base = `Nothing was ${metric === "received" ? "received" : "completed"} between ${data.range.from} and ${data.range.to}.`;
  const { dated, undated } = countOutsideRange(data.coverage);
  if (dated === 0 && undated === 0) return base;

  const parts: string[] = [];
  if (dated > 0) {
    parts.push(
      `${formatTotal(dated)} ${dated === 1 ? "item exists" : "items exist"} outside this range`,
    );
  }
  if (undated > 0) {
    parts.push(
      `${formatTotal(undated)} ${undated === 1 ? "item has" : "items have"} no received date`,
    );
  }
  return `${base} ${parts.join(", and ")}.`;
}

interface VolumeTrendSectionProps {
  rangeId: TimeRangeId;
  /** Bounds for a "Custom range" selection. */
  customRange?: CustomRange | null;
  className?: string;
  height?: number;
}

/**
 * Jobs over time, for the range chosen in the Overview header.
 *
 * The default metric is jobs *received*: it is the one every board can answer,
 * because it only needs a job-date column. Jobs *completed* needs a real
 * completion-date column, so the toggle that switches to it is rendered only when
 * the server reports at least one board maps one — otherwise the chart would show
 * a flat zero line that reads as "nothing got done" when it really means "this
 * workspace does not record completion dates".
 *
 * Bucketing follows the window: daily up to a month, weekly to four months,
 * monthly beyond, so a year never tries to draw 365 points. "Today" is marked
 * only when the buckets are days and today falls inside the window — on a weekly
 * or monthly axis there is no single day to point at.
 *
 * Data comes from `/api/overview/volume-trend`, which groups real snapshot rows
 * in the database query; nothing here is generated client-side. The section owns
 * its loading, empty and error states, so a failure leaves the rest of the page
 * intact.
 */
export function VolumeTrendSection({
  rangeId,
  customRange,
  className,
  height = 240,
}: VolumeTrendSectionProps) {
  const rangeQuery = useMemo(
    () => timeRangeQueryString(resolveSelectedTimeRange(rangeId, customRange)),
    [rangeId, customRange],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VolumeTrendPayload | null>(null);
  const [metric, setMetric] = useState<VolumeMetric>("received");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/overview/volume-trend?${rangeQuery}&range=${rangeId}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load volume trend");
      }
      setData((await res.json()) as VolumeTrendPayload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load volume trend");
    } finally {
      setIsLoading(false);
    }
  }, [rangeQuery, rangeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A workspace that lost its completion-date column must not keep showing a
  // completed series it can no longer source.
  const activeMetric: VolumeMetric =
    metric === "completed" && data && !data.completedDateAvailable ? "received" : metric;

  const trend = useMemo(
    () => (data ? toVolumeTrendPoints(data, activeMetric) : null),
    [data, activeMetric],
  );

  const granularity = data?.range.granularity ?? "day";
  const copy = GRANULARITY_COPY[granularity];
  // Today is only markable when the axis is days and today is inside the window.
  const todayKey = data?.range.today ?? null;
  const todayInRange =
    granularity === "day" &&
    todayKey !== null &&
    data !== null &&
    todayKey >= data.range.from &&
    todayKey <= data.range.to
      ? todayKey
      : null;

  const chartData: ChartDatum[] = useMemo(() => {
    if (!trend) return [];
    return trend.points.map((point) => ({
      key: point.key,
      axisLabel: point.label,
      fullLabel: fullBucketLabel(point.key, point.label),
      value: activeMetric === "received" ? point.received : point.completed,
      received: point.received,
      completed: point.completed,
      isToday: point.key === todayInRange,
    }));
  }, [trend, activeMetric, todayInRange]);

  // Ticks are keyed by the unique bucket key, then relabelled: bucket labels
  // repeat across a range (every "Thu" in a month), so they cannot identify a
  // point on their own.
  const axisLabels = useMemo(
    () => new Map(chartData.map((point) => [point.key, point.axisLabel])),
    [chartData],
  );

  const renderTick = useCallback(
    (key: string) => axisLabels.get(key) ?? key,
    [axisLabels],
  );

  const total = chartData.reduce((sum, point) => sum + point.value, 0);
  const rangeLabel = data?.range.label.toLowerCase() ?? "the selected period";
  const canToggle = data?.completedDateAvailable === true;
  const metricLabel =
    METRICS.find((m) => m.id === activeMetric)?.label ?? "Jobs received";

  return (
    <Card className={cn("border-border/60 p-6 shadow-none", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-medium tracking-tight">
            <TrendingUp
              className="text-muted-foreground/70 size-4 shrink-0"
              aria-hidden="true"
            />
            Volume trend
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {isLoading || !data
              ? `Loading ${metricLabel.toLowerCase()} · ${rangeLabel}`
              : `${formatTotal(total)} ${activeMetric === "received" ? "received" : "completed"} · ${rangeLabel} · ${copy}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isLoading && !error && data && (
            <div className="bg-muted/70 flex items-center gap-0.5 rounded-full p-0.5">
              {METRICS.map((option) => {
                // The completed toggle only appears when completion dates exist.
                if (option.id === "completed" && !canToggle) return null;
                const isActive = option.id === activeMetric;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMetric(option.id)}
                    aria-pressed={isActive}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.shortLabel}
                  </button>
                );
              })}
            </div>
          )}
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
      </div>

      <div className="mt-6" style={{ height }} aria-busy={isLoading}>
        {isLoading ? (
          <Skeleton.Base className="h-full w-full" />
        ) : error ? (
          <ErrorState
            variant="inline"
            title="Volume trend unavailable"
            message={error}
            onRetry={() => void load()}
          />
        ) : trend?.isEmpty ? (
          <EmptyState
            compact
            icon={Activity}
            title="No jobs in this period"
            description={emptyTrendDescription(data, activeMetric)}
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="volume-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="hsl(var(--highlight))"
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--highlight))"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="key"
                tickFormatter={renderTick}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                minTickGap={16}
                height={20}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                content={<TrendTooltip metric={activeMetric} />}
                cursor={{ stroke: "hsl(var(--border))" }}
              />
              {todayInRange && (
                <ReferenceLine
                  x={todayInRange}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 2"
                  label={{
                    value: "Today",
                    position: "top",
                    fill: "hsl(var(--muted-foreground))",
                    fontSize: 10,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--highlight))"
                strokeWidth={2}
                fill="url(#volume-trend-fill)"
                dot={
                  chartData.length <= 40 ? { r: 2, fill: "hsl(var(--highlight))" } : false
                }
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {!isLoading && !error && data && (
        <p className="border-border/70 text-muted-foreground mt-5 border-t pt-4 text-[11px] leading-snug">
          Each point is {BUCKET_COUNT[granularity]} of {rangeLabel}.
          {todayInRange ? " Today is marked with a dashed line." : ""}
          {canToggle
            ? ""
            : " No board here maps a completion-date column, so completed volume cannot be counted."}
        </p>
      )}
    </Card>
  );
}
