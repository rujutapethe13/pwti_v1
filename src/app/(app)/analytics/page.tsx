"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  analyticsMetrics,
  throughputData,
  workMixData,
  type AnalyticsMetric,
  type ThroughputPoint,
  type WorkMixItem,
} from "@/lib/mock-data";

const timeRanges = [
  { value: "today", label: "Today" },
  { value: "last30", label: "Last 30 days" },
  { value: "last90", label: "Last 90 days" },
  { value: "year", label: "Past year" },
] as const;

function MetricCard({
  metric,
}: {
  metric: AnalyticsMetric;
}) {
  const TrendIcon =
    metric.deltaDirection === "up"
      ? TrendingUp
      : metric.deltaDirection === "down"
        ? TrendingDown
        : Minus;
  const trendColor =
    metric.deltaDirection === "up"
      ? "text-success"
      : metric.deltaDirection === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <Card className="p-5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">
        {metric.label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {metric.value}
      </p>
      <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", trendColor)}>
        <TrendIcon className="size-3.5" />
        <span>{metric.delta}</span>
      </div>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="p-5 shadow-sm">
      <div className="h-3 w-28 rounded bg-muted animate-pulse" />
      <div className="mt-3 h-8 w-20 rounded bg-muted animate-pulse" />
      <div className="mt-2 h-3 w-32 rounded bg-muted animate-pulse" />
    </Card>
  );
}

function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<string>("last30");
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(t);
  }, [timeRange]);

  const chartData = useMemo<ThroughputPoint[]>(() => {
    const rangeMap: Record<string, number> = {
      today: 1,
      last30: 10,
      last90: 21,
      year: 30,
    };
    const points = rangeMap[timeRange] ?? 10;
    const total = throughputData.length;
    const step = Math.max(1, Math.ceil(total / points));
    return throughputData.filter((_, i) => i % step === 0 || i === total - 1).slice(0, points);
  }, [timeRange]);

  const startDate = useMemo(() => {
    const rangeMap: Record<string, string> = {
      today: "Jun 17",
      last30: "May 19",
      last90: "Mar 20",
      year: "Jun 18, 2025",
    };
    return rangeMap[timeRange] ?? "May 19";
  }, [timeRange]);

  const endDate = useMemo(() => {
    const rangeMap: Record<string, string> = {
      today: "Jun 17",
      last30: "Jun 17",
      last90: "Jun 17",
      year: "Jun 17",
    };
    return rangeMap[timeRange] ?? "Jun 17";
  }, [timeRange]);

  const centerPct = useMemo(() => {
    const total = workMixData.reduce((s, w) => s + w.percentage, 0);
    return total > 0 ? Math.round(total / workMixData.length * 100 / 100 * 100) : 0;
  }, []);

  const mixCenterLabel = useMemo(() => {
    return `${workMixData.length} categories`;
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header ─────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-normal leading-tight text-foreground sm:text-4xl">
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Studio performance metrics and trends
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {timeRanges.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Metrics Row ──────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          analyticsMetrics.map((metric: AnalyticsMetric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))
        )}
      </div>

      {/* ── Two-Column: Throughput + Work Mix ────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Throughput */}
        <Card className="lg:col-span-2 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Throughput
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{startDate}</span>
              <span>→</span>
              <span>{endDate}</span>
            </div>
          </div>
          <div className="mt-4" style={{ height: 260 }}>
            {isLoading ? (
              <div className="h-full w-full rounded bg-muted animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                    height={20}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="throughput"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Work Mix */}
        <Card className="p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Work mix
          </h2>
          <p className="text-xs text-muted-foreground">
            Distribution by category
          </p>
          <div className="relative mt-4 flex items-center justify-center" style={{ height: 180 }}>
            {isLoading ? (
              <div className="h-full w-full rounded-full bg-muted animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workMixData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="percentage"
                    stroke="none"
                  >
                    {workMixData.map((_: WorkMixItem, index: number) => (
                      <Cell key={`cell-${index}`} fill={workMixData[index % workMixData.length].color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-foreground">
                {workMixData.length}
              </span>
              <span className="text-xs text-muted-foreground">
                {mixCenterLabel}
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {workMixData.map((item: WorkMixItem) => (
              <div key={item.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-foreground">
                    {item.category}
                  </span>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsPage;
