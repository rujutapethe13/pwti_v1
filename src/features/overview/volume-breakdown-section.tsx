"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PieChart as PieChartIcon,
  RefreshCw,
  X,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { OverviewDrilldownItem } from "@/features/overview/overview-drilldown-service";
import { cn } from "@/lib/utils";
import { BoardSelector, type OverviewBoard } from "@/features/overview/board-selector";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const EMPTY_BOARD_IDS: string[] = [];

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
        {formatVolume(slice.volume)} volume (one per job row) · {formatVolume(slice.jobs)}{" "}
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
  boards?: OverviewBoard[];
  selectedBoardIds?: string[];
  onBoardChange?: (ids: string[]) => void;
  /** Additive: board-resolved items for this range to enrich job types & power click-to-drilldown */
  drilldownItems?: OverviewDrilldownItem[];
}

/**
 * Where the volume in the selected range actually came from, broken down by job
 * type.
 */
export function VolumeBreakdownSection({
  rangeId,
  customRange,
  className,
  height = 240,
  boards = [],
  selectedBoardIds: selectedBoardIdsProp,
  onBoardChange: onBoardChangeProp,
  drilldownItems,
}: VolumeBreakdownSectionProps) {
  const selectedBoardIds = selectedBoardIdsProp ?? EMPTY_BOARD_IDS;
  const onBoardChange = onBoardChangeProp ?? (() => undefined);
  const hasBoardFilter = selectedBoardIdsProp !== undefined;
  const rangeQuery = useMemo(
    () => timeRangeQueryString(resolveSelectedTimeRange(rangeId, customRange)),
    [rangeId, customRange],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BreakdownPayload | null>(null);
  const [selectedSliceLabel, setSelectedSliceLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const boardQuery = selectedBoardIds.length
        ? `&boards=${selectedBoardIds.join(",")}`
        : "&boards=";
      const res = await fetch(
        `/api/overview/breakdown?${rangeQuery}&range=${rangeId}${boardQuery}`,
        {
          cache: "no-store",
        },
      );
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
  }, [rangeQuery, rangeId, selectedBoardIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopedDrilldownItems = useMemo(() => {
    if (!drilldownItems) return [];
    if (hasBoardFilter && selectedBoardIds.length > 0) {
      return drilldownItems.filter((item) => selectedBoardIds.includes(item.board_id));
    }
    return drilldownItems;
  }, [drilldownItems, hasBoardFilter, selectedBoardIds]);

  // Enrich payload when snapshot lacked job_type mappings on boards with "Type of Job" columns
  const effectivePayload = useMemo<BreakdownPayload | null>(() => {
    if (!data) return null;
    const onlyUnclassified =
      !data.grouping.available || data.items.every((item) => !item.key.trim());
    if (!onlyUnclassified || scopedDrilldownItems.length === 0) {
      return data;
    }
    const counts = new Map<string, number>();
    let hasRealType = false;
    for (const item of scopedDrilldownItems) {
      const key = item.job_type?.trim() ?? "";
      if (key) hasRealType = true;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (!hasRealType) return data;

    const enrichedItems = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        volume: count,
        jobs: count,
      }));

    return {
      ...data,
      grouping: {
        ...data.grouping,
        available: true,
      },
      total: {
        volume: scopedDrilldownItems.length,
        jobs: scopedDrilldownItems.length,
      },
      items: enrichedItems,
    };
  }, [data, scopedDrilldownItems]);

  const breakdown = useMemo(
    () => (effectivePayload ? toBreakdownSlices(effectivePayload) : null),
    [effectivePayload],
  );

  const selectedSliceItems = useMemo(() => {
    if (!selectedSliceLabel || scopedDrilldownItems.length === 0) return [];
    return scopedDrilldownItems.filter((item) => {
      const label = item.job_type?.trim() || UNCLASSIFIED_LABEL;
      return label === selectedSliceLabel;
    });
  }, [scopedDrilldownItems, selectedSliceLabel]);

  const rangeLabel = data?.range.label.toLowerCase() ?? "the selected period";
  const unclassified = breakdown?.slices.find((s) => s.isUnclassified) ?? null;

  const summary =
    isLoading || !breakdown
      ? `Loading type of job breakdown · ${rangeLabel}`
      : `${formatVolume(breakdown.totalVolume)} volume · ${breakdown.categoryCount} ${
          breakdown.categoryCount === 1 ? "job type" : "job types"
        }${
          selectedBoardIds.length > 0
            ? ` · ${selectedBoardIds.length} board${selectedBoardIds.length === 1 ? "" : "s"}`
            : ""
        } · ${rangeLabel}`;

  const toggleSlice = (label: string) => {
    if (!drilldownItems) return;
    setSelectedSliceLabel((prev) => (prev === label ? null : label));
  };

  return (
    <Card className={cn("border-border/60 p-6 shadow-none", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-base font-medium tracking-tight">
            <PieChartIcon
              className="text-muted-foreground/70 size-4 shrink-0"
              aria-hidden="true"
            />
            Type of job
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">{summary}</p>
        </div>

        <div className="flex items-center gap-2">
          {hasBoardFilter && (
            <BoardSelector
              boards={boards}
              selectedIds={selectedBoardIds}
              onChange={onBoardChange}
            />
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
            title={
              hasBoardFilter && selectedBoardIds.length === 0
                ? "No boards selected"
                : "No volume in this period"
            }
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
                    onClick={(sliceData: { label?: string; name?: string }) => {
                      const lbl = sliceData?.label ?? sliceData?.name;
                      if (lbl) {
                        toggleSlice(String(lbl));
                      }
                    }}
                  >
                    {breakdown!.slices.map((slice) => (
                      <Cell
                        key={slice.key}
                        fill={slice.color}
                        className={drilldownItems ? "cursor-pointer" : undefined}
                        onClick={() => toggleSlice(slice.label)}
                      />
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
            <ul className="flex min-w-0 flex-col justify-center gap-2.5">
              {breakdown!.slices.map((slice) => {
                const isSelected = selectedSliceLabel === slice.label;
                return (
                  <li key={slice.key}>
                    <div
                      role={drilldownItems ? "button" : undefined}
                      tabIndex={drilldownItems ? 0 : undefined}
                      onClick={drilldownItems ? () => toggleSlice(slice.label) : undefined}
                      onKeyDown={
                        drilldownItems
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleSlice(slice.label);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        drilldownItems && "hover:bg-accent/60 cursor-pointer",
                        isSelected && "bg-primary/10 ring-primary/30 ring-1",
                      )}
                    >
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
                      {drilldownItems && (
                        <span className="text-muted-foreground shrink-0">
                          {isSelected ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Additive inline job list when a job type slice or legend row is clicked */}
      {selectedSliceLabel && drilldownItems && (
        <div className="border-primary/40 bg-muted/20 mt-5 overflow-hidden rounded-lg border">
          <div className="border-border/60 bg-muted/40 flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span>Type of job: {selectedSliceLabel}</span>
              <Badge variant="secondary" className="text-[11px]">
                {selectedSliceItems.length}{" "}
                {selectedSliceItems.length === 1 ? "job" : "jobs"}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setSelectedSliceLabel(null)}
              aria-label="Close job type details"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {selectedSliceItems.length === 0 ? (
            <p className="text-muted-foreground px-4 py-4 text-xs">
              No individual board rows matched this category in the selected board filter.
            </p>
          ) : (
            <div className="divide-border/60 max-h-64 divide-y overflow-y-auto">
              {selectedSliceItems.map((item) => (
                <div
                  key={item.item_id}
                  className="hover:bg-accent/40 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate font-medium">
                      {item.job_name}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {item.client ?? "—"} · {item.board_name} · Received{" "}
                      {item.received_at ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {item.status ?? "In Progress"}
                    </Badge>
                    <Link
                      href={`/${item.board_slug ?? item.board_id}?record=${item.item_id}`}
                      className="border-border bg-background hover:bg-accent inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium"
                    >
                      Open
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
