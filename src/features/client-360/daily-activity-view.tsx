"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  Briefcase,
  Building2,
  AlertTriangle,
  TrendingUp,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { fetchClient360DailyActivityAction } from "./daily-activity-action";
import type { Client360DailyActivity } from "./types";
import { formatPeriodLabel, getTodayISO } from "./date-format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
} from "recharts";

const DEFAULT_DAYS_IN_SELECTOR = 30;

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateInputDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}-${month}-${year}`;
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

type DailyActivityViewVariant = "client-360" | "dashboard";

interface Client360DailyActivityViewProps {
  clientId?: string;
  variant?: DailyActivityViewVariant;
}

export function Client360DailyActivityView({
  clientId,
  variant = "client-360",
}: Client360DailyActivityViewProps) {
  const isDashboard = variant === "dashboard";
  const daysInSelector = isDashboard ? 16 : DEFAULT_DAYS_IN_SELECTOR;
  const today = getTodayISO();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Client360DailyActivity | null>(null);
  const [daySelectorStartIdx, setDaySelectorStartIdx] = useState(0);
  const initialLoaded = useRef(false);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActivity = useCallback(
    async (date: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchClient360DailyActivityAction({
          selectedDate: date,
          clientId,
        });
        if (res.error) {
          toast.error(res.error);
          setError(res.error);
          return;
        }
        if (res.data) {
          setData(res.data);
          setSelectedDate(res.data.selectedDate);
        }
      } catch {
        toast.error("Failed to load daily activity");
        setError("Failed to load daily activity");
      } finally {
        setLoading(false);
      }
    },
    [clientId],
  );

  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    void fetchActivity(today);
  }, [fetchActivity, today, clientId]);

  useEffect(() => {
    if (!data) return;
    const selectedIdx = data.daily_breakdown.findIndex((d) => d.date === selectedDate);
    if (selectedIdx >= 0) {
      const maxStart = Math.max(0, data.daily_breakdown.length - daysInSelector);
      const newStart = Math.min(
        Math.max(0, selectedIdx - Math.floor(daysInSelector / 2)),
        maxStart,
      );
      setDaySelectorStartIdx(newStart);
    }
  }, [data, daysInSelector, selectedDate]);

  const handleDateChange = (date: string) => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = setTimeout(() => {
      void fetchActivity(date);
    }, 150);
  };

  const handleRefresh = () => {
    void fetchActivity(selectedDate);
  };

  const handleDaySelectorClick = (date: string) => {
    void fetchActivity(date);
  };

  const handleArrowNav = (direction: "left" | "right") => {
    if (!data) return;
    const maxStart = Math.max(0, data.daily_breakdown.length - daysInSelector);
    if (direction === "left") {
      setDaySelectorStartIdx((prev) => Math.max(0, prev - daysInSelector));
    } else {
      setDaySelectorStartIdx((prev) => Math.min(maxStart, prev + daysInSelector));
    }
  };

  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setSelectedDate(val);
      handleDateChange(val);
    }
  };

  const visibleDays =
    data?.daily_breakdown.slice(
      daySelectorStartIdx,
      daySelectorStartIdx + daysInSelector,
    ) || [];
  const maxDailyTotal = data
    ? Math.max(...data.daily_breakdown.map((d) => d.total), 1)
    : 1;
  const topClientCount = data?.clients.length ? data.clients[0].count : 0;
  const selectedDayTotal =
    data?.daily_breakdown.find((day) => day.date === selectedDate)?.total ?? 0;

  const periodLabel = data ? formatPeriodLabel(selectedDate, selectedDate) : "—";
  const statAccent = {
    tealText: isDashboard ? "text-[#0073ea]" : "text-[hsl(var(--soft-teal-text))]",
    tealBg: isDashboard ? "bg-[#e6f1fd]" : "bg-[hsl(var(--soft-teal-bg))]",
    tealGradient: isDashboard ? "from-[#e6f1fd]" : "from-[hsl(var(--soft-teal-bg))]",
    tealBorder: isDashboard ? "border-[#0073ea]" : "border-[hsl(var(--soft-teal-text))]",
    amberText: isDashboard ? "text-[#0073ea]" : "text-[hsl(var(--soft-amber-text))]",
    amberBg: isDashboard ? "bg-[#e6f1fd]" : "bg-[hsl(var(--soft-amber-bg))]",
    amberGradient: isDashboard ? "from-[#e6f1fd]" : "from-[hsl(var(--soft-amber-bg))]",
    amberBorder: isDashboard
      ? "border-[#0073ea]"
      : "border-[hsl(var(--soft-amber-text))]",
    lavenderText: isDashboard
      ? "text-[#0073ea]"
      : "text-[hsl(var(--soft-lavender-text))]",
    lavenderBg: isDashboard ? "bg-[#e6f1fd]" : "bg-[hsl(var(--soft-lavender-bg))]",
    lavenderGradient: isDashboard
      ? "from-[#e6f1fd]"
      : "from-[hsl(var(--soft-lavender-bg))]",
    lavenderBorder: isDashboard
      ? "border-[#0073ea]"
      : "border-[hsl(var(--soft-lavender-text))]",
    coralText: isDashboard ? "text-[#0073ea]" : "text-[hsl(var(--soft-coral-text))]",
    coralBg: isDashboard ? "bg-[#e6f1fd]" : "bg-[hsl(var(--soft-coral-bg))]",
    coralGradient: isDashboard ? "from-[#e6f1fd]" : "from-[hsl(var(--soft-coral-bg))]",
    coralBorder: isDashboard
      ? "border-[#0073ea]"
      : "border-[hsl(var(--soft-coral-text))]",
  };

  return (
    <div className="space-y-6">
      {isDashboard && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
            <p className="text-muted-foreground truncate text-sm">
              Showing:{" "}
              <span className="text-foreground font-medium">
                {formatFullDate(data?.selectedDate ?? selectedDate)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-40 justify-start text-left font-normal"
                  type="button"
                >
                  <CalendarDays className="text-muted-foreground mr-2 h-4 w-4 shrink-0" />
                  <span className="text-muted-foreground truncate">
                    {formatDateInputDisplay(selectedDate)}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={handleDatePickerChange}
                  max={today}
                  className="w-full cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label="Select date"
                />
              </PopoverContent>
            </Popover>
            </div>
        </div>
      )}

      <div className="relative">
        <div
          className="scrollbar-hide flex items-end gap-1 overflow-x-auto pb-2"
          role="listbox"
          aria-label="Day selector"
        >
          <button
            type="button"
            onClick={() => handleArrowNav("left")}
            className="border-border bg-card text-muted-foreground hover:bg-accent flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-colors"
            aria-label="Previous days"
            disabled={daySelectorStartIdx === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {visibleDays.map((day) => {
            const isSelected = day.date === selectedDate;
            const barHeight = Math.max(4, (day.total / maxDailyTotal) * 60);
            return (
              <button
                key={day.date}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleDaySelectorClick(day.date)}
                className={cn(
                  "flex flex-shrink-0 flex-col items-center gap-1 px-2 py-1.5 transition-all",
                  isSelected
                    ? isDashboard
                      ? "border-[#0073ea] bg-[#e6f1fd]"
                      : "border-[hsl(var(--soft-teal-text))] bg-[hsl(var(--soft-teal-bg))]"
                    : "text-muted-foreground hover:text-foreground",
                  isSelected && "rounded-md border-[2px] border-dashed",
                )}
                style={{ minWidth: "36px" }}
              >
                <span className="text-[10px] font-medium">{getDayOfWeek(day.date)}</span>
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    isSelected
                      ? isDashboard
                        ? "bg-[#0073ea]"
                        : "bg-[hsl(var(--soft-teal-text))]"
                      : "bg-muted",
                  )}
                  style={{ height: `${barHeight}px` }}
                />
                <span className="font-mono text-[10px]">{day.total}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => handleArrowNav("right")}
            className="border-border bg-card text-muted-foreground hover:bg-accent flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-colors"
            aria-label="Next days"
            disabled={
              !!data &&
              daySelectorStartIdx >=
                Math.max(0, data.daily_breakdown.length - daysInSelector)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {!isDashboard && (
          <div className="absolute top-0 right-0">
            <input
              type="date"
              value={selectedDate}
              onChange={handleDatePickerChange}
              max={today}
              className="border-border bg-background w-40 rounded-md border px-3 py-1.5 text-sm"
              aria-label="Select date"
            />
          </div>
        )}
      </div>

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}

      {/* ── Daily Activity content ───────────────────────────────────── */}
      {data && !error ? (
        <>
          {!isDashboard && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="text-muted-foreground h-4 w-4" />
                <h2 className="text-base font-medium">{periodLabel}</h2>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
          )}

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="relative overflow-hidden">
              <div
                className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.tealGradient} rounded-bl-[2rem] to-transparent`}
              />
              <CardContent className="relative p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Jobs received</p>
                    <p className="text-3xl font-bold tracking-tight">{data.total_jobs}</p>
                  </div>
                  <div className={`rounded-full p-2 ${statAccent.tealBg}`}>
                    <Briefcase className={`h-5 w-5 ${statAccent.tealText}`} />
                  </div>
                </div>
                <div
                  className={`absolute right-2 bottom-2 border-t border-r ${statAccent.tealBorder} h-4 w-4`}
                />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.amberGradient} rounded-bl-[2rem] to-transparent`}
              />
              <CardContent className="relative p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Clients active</p>
                    <p className="text-3xl font-bold tracking-tight">
                      {data.clients_active}
                    </p>
                  </div>
                  <div className={`rounded-full p-2 ${statAccent.amberBg}`}>
                    <Users className={`h-5 w-5 ${statAccent.amberText}`} />
                  </div>
                </div>
                <div
                  className={`absolute right-2 bottom-2 border-t border-r ${statAccent.amberBorder} h-4 w-4`}
                />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.lavenderGradient} rounded-bl-[2rem] to-transparent`}
              />
              <CardContent className="relative p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Boards touched</p>
                    <p className="text-3xl font-bold tracking-tight">
                      {data.boards_touched}
                    </p>
                  </div>
                  <div className={`rounded-full p-2 ${statAccent.lavenderBg}`}>
                    <Building2 className={`h-5 w-5 ${statAccent.lavenderText}`} />
                  </div>
                </div>
                <div
                  className={`absolute right-2 bottom-2 border-t border-r ${statAccent.lavenderBorder} h-4 w-4`}
                />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div
                className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.coralGradient} rounded-bl-[2rem] to-transparent`}
              />
              <CardContent className="relative p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-sm">Busiest client</p>
                    <p className="truncate text-3xl font-bold tracking-tight">
                      {data.busiest_client?.client_name ?? "—"}
                    </p>
                    {data.busiest_client && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {data.busiest_client.count} jobs
                      </p>
                    )}
                  </div>
                  <div className={`rounded-full p-2 ${statAccent.coralBg}`}>
                    <Target className={`h-5 w-5 ${statAccent.coralText}`} />
                  </div>
                </div>
                <div
                  className={`absolute right-2 bottom-2 border-t border-r ${statAccent.coralBorder} h-4 w-4`}
                />
              </CardContent>
            </Card>
          </div>

          {/* Per-client breakdown grid */}
          {data.total_jobs === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <CalendarDays className="text-muted-foreground/40 mb-3 h-10 w-10" />
                <h3 className="text-base font-medium">No jobs recorded for this day</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Try selecting a different date or refreshing.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{formatFullDate(selectedDate)}</h3>
                <span className="text-muted-foreground text-sm">
                  {data.clients.length} client{data.clients.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data.clients.map((client) => {
                  const widthPct =
                    isDashboard && data.total_jobs > 0
                      ? (client.count / data.total_jobs) * 100
                      : topClientCount > 0
                        ? (client.count / topClientCount) * 100
                        : 0;
                  return (
                    <Card key={client.client_id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {client.client_name}
                          </p>
                          {!isDashboard && (
                            <p className="text-muted-foreground text-xs">
                              {client.client_id}
                            </p>
                          )}
                        </div>
                        <span className="text-foreground shrink-0 text-2xl font-bold">
                          {client.count}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${isDashboard ? "bg-[#0073ea]" : "bg-[hsl(var(--soft-teal-text))]"}`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <p className="text-muted-foreground mt-1 text-right text-[10px]">
                          {widthPct.toFixed(0)}%{" "}
                          {isDashboard ? "of daily volume" : "of busiest"}
                        </p>
                      </div>
                    </Card>
                  );
                })}
                {isDashboard &&
                  Array.from(
                    { length: (4 - (data.clients.length % 4)) % 4 },
                    (_, index) => (
                      <div
                        key={`empty-client-${index}`}
                        className="border-border bg-muted/40 rounded-xl border"
                        aria-hidden="true"
                      />
                    ),
                  )}
              </div>
            </>
          )}

          {/* Volume trend chart */}
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Volume trend</h3>
                  <p className="text-muted-foreground text-xs">
                    Jobs received per day, selected day highlighted
                  </p>
                </div>
                <TrendingUp className="text-muted-foreground h-5 w-5" />
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.daily_breakdown.map((d) => ({
                      ...d,
                      label: formatDateLabel(d.date),
                      isSelected: d.date === selectedDate,
                    }))}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
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
                      height={24}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                      formatter={(value, name) => [
                        String(value ?? ""),
                        String(name ?? ""),
                      ]}
                      labelFormatter={(label) =>
                        formatFullDate(
                          data.daily_breakdown.find(
                            (d) => formatDateLabel(d.date) === String(label),
                          )?.date || String(label),
                        )
                      }
                    />
                    <ReferenceLine
                      x={formatDateLabel(selectedDate)}
                      y={0}
                      width="100%"
                      height="100%"
                      stroke={isDashboard ? "#0073ea" : "hsl(var(--soft-teal-text))"}
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      label={{
                        position: "top",
                        fill: isDashboard ? "#0073ea" : "hsl(var(--soft-teal-text))",
                        fontSize: 10,
                        value: "Selected",
                      }}
                    />
                    <ReferenceDot
                      x={formatDateLabel(selectedDate)}
                      y={selectedDayTotal}
                      r={5}
                      fill={isDashboard ? "#0073ea" : "hsl(var(--soft-teal-text))"}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{
                        r: 6,
                        strokeWidth: 2,
                        fill: isDashboard ? "#0073ea" : "hsl(var(--soft-teal-text))",
                        stroke: "hsl(var(--background))",
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-muted-foreground mt-2 text-center text-[11px]">
                {formatFullDate(data.start)} → {formatFullDate(data.end)}, all sources
                combined
              </p>
            </CardContent>
          </Card>

          {/* Unmapped boards notice */}
          {data.unmapped_boards > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {data.unmapped_boards} board{data.unmapped_boards !== 1 ? "s" : ""}{" "}
                aren&apos;t included in these numbers yet &mdash; job date not configured
              </span>
            </div>
          )}
        </>
      ) : null}

      {/* ── Error state ─────────────────────────────────────────────── */}
      {error && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-3 h-10 w-10 text-destructive/40" />
            <h3 className="text-base font-medium">Couldn&apos;t load activity data</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void fetchActivity(selectedDate)}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Initial empty state (no data, no error, not loading) ─── */}
      {!data && !loading && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <Building2 className="text-muted-foreground/40 mb-2 h-10 w-10" />
            <p className="text-sm font-medium">No daily activity data</p>
            <p className="text-muted-foreground text-xs">
              Try selecting a date or refreshing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
