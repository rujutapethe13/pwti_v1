"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Clock,
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
import { fetchActivityAction, fetchClient360DailyActivityAction } from "./daily-activity-action";
import { ActivityDrilldownPanel } from "./activity-drilldown-panel";
import type { ActivityData, ActivityMode, Client360DailyActivity } from "./types";
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
const MODE_STORAGE_KEY = "pwti_activity_mode_v2";

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

/**
 * Compute strictly ascending Y-axis ticks (0, 20, 40, 60, 80 or scaled step)
 * so Recharts never renders out-of-order tick labels.
 */
function buildAscendingYAxisTicks(maxVal: number): number[] {
  const safeMax = Math.max(maxVal, 4);
  const rawStep = Math.ceil(safeMax / 4);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
  const residual = rawStep / magnitude;
  const niceMultiplier =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = Math.max(1, niceMultiplier * magnitude);
  return [0, step, step * 2, step * 3, step * 4];
}

type DailyActivityViewVariant = "client-360" | "dashboard";
type ReceivedCountMetric = "rows" | "skus";
type ActiveKpiCard =
  | "jobs_received"
  | "clients_active"
  | "boards_touched"
  | "busiest_client"
  | "due_today"
  | "overdue"
  | "upcoming"
  | "no_due_date";

interface Client360DailyActivityViewProps {
  clientId?: string;
  variant?: DailyActivityViewVariant;
  /** Feature flag: enables the Received | Due mode switch (default: true) */
  enableDueMode?: boolean;
  /** Feature flag: enables the inline Day details panel below KPI cards (default: true) */
  enableDrilldownPanel?: boolean;
}

export function Client360DailyActivityView({
  clientId,
  variant = "client-360",
  enableDueMode = true,
  enableDrilldownPanel = true,
}: Client360DailyActivityViewProps) {
  const isDashboard = variant === "dashboard";
  const daysInSelector = isDashboard ? 16 : DEFAULT_DAYS_IN_SELECTOR;
  const today = getTodayISO();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Client360DailyActivity | null>(null);
  const [tasksData, setTasksData] = useState<ActivityTasksResponse | null>(null);
  const [daySelectorStartIdx, setDaySelectorStartIdx] = useState(0);

  // Additive state for Due mode, row-vs-SKU count metric, and inline Day details panel
  const [activityMode, setActivityMode] = useState<ActivityMode>("received");
  const [receivedMetric, setReceivedMetric] = useState<ReceivedCountMetric>("rows");
  const [arrivedFromMyWork, setArrivedFromMyWork] = useState(false);
  const [activeCard, setActiveCard] = useState<ActiveKpiCard | null>("jobs_received");

  const initialLoaded = useRef(false);
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drilldownCard, setDrilldownCard] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<ActivityData | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const loadDrilldown = useCallback(async (mode: ActivityMode, date: string) => {
    setDrilldownLoading(true);
    const result = await fetchActivityAction({ mode, selectedDate: date });
    if (result.error) toast.error(result.error);
    else setDrilldownData(result.data);
    setDrilldownLoading(false);
  }, []);

  const handleActivityModeChange = (mode: ActivityMode) => {
    setActivityMode(mode);
    setDrilldownCard(mode === "due" ? "due" : null);
    void loadDrilldown(mode, selectedDate);
  };

  const handleDrilldownCard = (card: string) => {
    setDrilldownCard((current) => current === card ? null : card);
    if (!drilldownData || drilldownData.mode !== activityMode || drilldownData.selectedDate !== selectedDate) {
      void loadDrilldown(activityMode, selectedDate);
    }
  };

  // Detect arrival from My Work (?from=my-work) or saved mode preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromMyWork =
      params.get("from") === "my-work" || params.get("source") === "my-work";
    const modeParam = params.get("mode");
    if (fromMyWork) {
      setArrivedFromMyWork(true);
      if (enableDueMode) {
        setActivityMode("due");
        setActiveCard("due_today");
      }
      return;
    }
    if (modeParam === "due" && enableDueMode) {
      setActivityMode("due");
      setActiveCard("due_today");
      return;
    }
    try {
      const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === "due" && enableDueMode) {
        setActivityMode("due");
        setActiveCard("due_today");
      } else if (saved === "received") {
        setActivityMode("received");
        setActiveCard("jobs_received");
      }
    } catch {
      // Ignore storage access errors
    }
  }, [enableDueMode]);

  const handleModeChange = (nextMode: ActivityMode) => {
    setActivityMode(nextMode);
    setActiveCard(nextMode === "due" ? "due_today" : "jobs_received");
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, nextMode);
    } catch {
      // Ignore storage access errors
    }
  };

  const fetchActivity = useCallback(
    async (date: string, modeOverride?: ActivityMode) => {
      const currentMode = modeOverride ?? activityMode;
      setLoading(true);
      setError(null);
      try {
        const [res, tasksRes] = await Promise.all([
          fetchClient360DailyActivityAction({
            selectedDate: date,
            clientId,
          }),
          fetchActivityTasksAction({
            selectedDate: date,
            mode: currentMode,
          }),
        ]);
        if (res.error) {
          toast.error(res.error);
          setError(res.error);
          return;
        }
        if (res.data) {
          setData(res.data);
          setSelectedDate(res.data.selectedDate ?? date);
        } else {
          setData(null);
        }
        if (tasksRes.data) {
          setTasksData(tasksRes.data);
        }
      } catch {
        toast.error("Failed to load daily activity");
        setError("Failed to load daily activity");
      } finally {
        setLoading(false);
      }
    },
    [activityMode, clientId],
  );

  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    void fetchActivity(today);
  }, [fetchActivity, today, clientId]);

  // Active daily series based on mode and received count metric
  const activeDailyBreakdown = useMemo(() => {
    if (activityMode === "due" && tasksData?.daily_breakdown?.length) {
      return tasksData.daily_breakdown;
    }
    if (!data) return [];
    if (receivedMetric === "rows" && data.row_daily_breakdown?.length) {
      return data.row_daily_breakdown;
    }
    return data.daily_breakdown;
  }, [activityMode, data, receivedMetric, tasksData]);

  useEffect(() => {
    if (!activeDailyBreakdown.length) return;
    const selectedIdx = activeDailyBreakdown.findIndex(
      (d) => d.date === selectedDate,
    );
    if (selectedIdx >= 0) {
      const maxStart = Math.max(0, activeDailyBreakdown.length - daysInSelector);
      const newStart = Math.min(
        Math.max(0, selectedIdx - Math.floor(daysInSelector / 2)),
        maxStart,
      );
      setDaySelectorStartIdx(newStart);
    }
  }, [activeDailyBreakdown, daysInSelector, selectedDate]);

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
    setSelectedDate(date);
    void fetchActivity(date);
  };

  const handleJumpToToday = () => {
    setSelectedDate(today);
    void fetchActivity(today);
  };

  const handleArrowNav = (direction: "left" | "right") => {
    if (!activeDailyBreakdown.length) return;
    const maxStart = Math.max(0, activeDailyBreakdown.length - daysInSelector);
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

  const handleCardClick = (cardKey: ActiveKpiCard) => {
    if (!enableDrilldownPanel) return;
    setActiveCard((prev) => (prev === cardKey ? null : cardKey));
  };

  const visibleDays = activeDailyBreakdown.slice(
    daySelectorStartIdx,
    daySelectorStartIdx + daysInSelector,
  );
  const maxDailyTotal = activeDailyBreakdown.length
    ? Math.max(...activeDailyBreakdown.map((d) => d.total), 1)
    : 1;

  // Received-mode numbers: supports both per-row job entry (1 row with Type of Job = 1 job) and legacy SKU volume
  const activeReceivedTotal =
    receivedMetric === "rows"
      ? (data?.row_total_jobs ?? data?.total_jobs ?? 0)
      : (data?.total_jobs ?? 0);
  const activeReceivedClients =
    receivedMetric === "rows"
      ? (data?.row_clients ?? data?.clients ?? [])
      : (data?.clients ?? []);
  const activeReceivedBusiest =
    receivedMetric === "rows"
      ? (data?.row_busiest_client ?? data?.busiest_client ?? null)
      : (data?.busiest_client ?? null);

  const topClientCount = activeReceivedClients.length
    ? activeReceivedClients[0].count
    : 0;
  const selectedDayTotal =
    activeDailyBreakdown.find((day) => day.date === selectedDate)?.total ?? 0;

  const yAxisTicks = useMemo(
    () => buildAscendingYAxisTicks(maxDailyTotal),
    [maxDailyTotal],
  );
  const yAxisMax = yAxisTicks[yAxisTicks.length - 1] ?? 4;

  const periodLabel = data ? formatPeriodLabel(selectedDate, selectedDate) : "—";
  const statAccent = {
    tealText: isDashboard ? "text-[#0073ea] dark:text-blue-400" : "text-[hsl(var(--soft-teal-text))]",
    tealBg: isDashboard ? "bg-[#e6f1fd] dark:bg-blue-500/15" : "bg-[hsl(var(--soft-teal-bg))]",
    tealGradient: isDashboard ? "from-[#e6f1fd] dark:from-blue-500/15" : "from-[hsl(var(--soft-teal-bg))]",
    tealBorder: isDashboard ? "border-[#0073ea] dark:border-blue-400/50" : "border-[hsl(var(--soft-teal-text))]",
    amberText: isDashboard ? "text-[#0073ea] dark:text-blue-400" : "text-[hsl(var(--soft-amber-text))]",
    amberBg: isDashboard ? "bg-[#e6f1fd] dark:bg-blue-500/15" : "bg-[hsl(var(--soft-amber-bg))]",
    amberGradient: isDashboard ? "from-[#e6f1fd] dark:from-blue-500/15" : "from-[hsl(var(--soft-amber-bg))]",
    amberBorder: isDashboard
      ? "border-[#0073ea] dark:border-blue-400/50"
      : "border-[hsl(var(--soft-amber-text))]",
    lavenderText: isDashboard
      ? "text-[#0073ea] dark:text-blue-400"
      : "text-[hsl(var(--soft-lavender-text))]",
    lavenderBg: isDashboard ? "bg-[#e6f1fd] dark:bg-blue-500/15" : "bg-[hsl(var(--soft-lavender-bg))]",
    lavenderGradient: isDashboard
      ? "from-[#e6f1fd] dark:from-blue-500/15"
      : "from-[hsl(var(--soft-lavender-bg))]",
    lavenderBorder: isDashboard
      ? "border-[#0073ea] dark:border-blue-400/50"
      : "border-[hsl(var(--soft-lavender-text))]",
    coralText: isDashboard ? "text-[#0073ea] dark:text-blue-400" : "text-[hsl(var(--soft-coral-text))]",
    coralBg: isDashboard ? "bg-[#e6f1fd] dark:bg-blue-500/15" : "bg-[hsl(var(--soft-coral-bg))]",
    coralGradient: isDashboard ? "from-[#e6f1fd] dark:from-blue-500/15" : "from-[hsl(var(--soft-coral-bg))]",
    coralBorder: isDashboard
      ? "border-[#0073ea] dark:border-blue-400/50"
      : "border-[hsl(var(--soft-coral-text))]",
  };

  const dueSummary = tasksData?.due_summary ?? {
    due_selected_day: 0,
    overdue: 0,
    upcoming: 0,
    upcoming_next_7_days: 0,
    next_due_date: null,
    no_due_date: 0,
    clients_active: 0,
    boards_touched: 0,
  };

  const isPanelOpen = enableDrilldownPanel && activeCard !== null && tasksData !== null;
  const todayInChartRange = activeDailyBreakdown.some((d) => d.date === today);

  return (
    <div className="space-y-6">
      {isDashboard && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
            <p className="text-muted-foreground truncate text-sm">
              Showing:{" "}
              <span className="text-foreground font-medium">
                {formatFullDate(data?.selectedDate ?? selectedDate)}
              </span>
            </p>
            {selectedDate !== today && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleJumpToToday}
                className="h-7 px-2.5 text-xs"
              >
                Jump to today
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-muted flex rounded-md p-1" role="group" aria-label="Activity mode">
              {(["received", "due"] as ActivityMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleActivityModeChange(mode)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium capitalize",
                    activityMode === mode && "bg-background shadow",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Refresh daily activity"
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
                  max={activityMode === "received" ? today : undefined}
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
            const isToday = day.date === today;
            const barHeight = Math.max(4, (day.total / maxDailyTotal) * 60);
            return (
              <button
                key={day.date}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleDaySelectorClick(day.date)}
                title={`${formatFullDate(day.date)}: ${day.total}`}
                className={cn(
                  "relative flex flex-shrink-0 flex-col items-center gap-1 px-2 py-1.5 transition-all",
                  isSelected
                    ? isDashboard
                      ? "border-[#0073ea] bg-[#e6f1fd] dark:border-blue-400 dark:bg-blue-500/15"
                      : "border-[hsl(var(--soft-teal-text))] bg-[hsl(var(--soft-teal-bg))]"
                    : "text-muted-foreground hover:text-foreground",
                  isSelected && "rounded-md border-[2px] border-dashed",
                  !isSelected && isToday && "rounded-md ring-1 ring-amber-500/60",
                )}
                style={{ minWidth: "36px" }}
              >
                <span className="text-[10px] font-medium">
                  {isToday ? "Today" : getDayOfWeek(day.date)}
                </span>
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    isSelected
                      ? isDashboard
                        ? "bg-[#0073ea]"
                        : "bg-[hsl(var(--soft-teal-text))]"
                      : isToday
                        ? "bg-amber-500/70"
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
              activeDailyBreakdown.length > 0 &&
              daySelectorStartIdx >=
                Math.max(0, activeDailyBreakdown.length - daysInSelector)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {selectedDate !== today && (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent ml-1 flex h-8 flex-shrink-0 items-center rounded-md border px-2.5 text-xs font-medium transition-colors"
            >
              Today
            </button>
          )}
        </div>
        {!isDashboard && (
          <div className="absolute top-0 right-0 flex items-center gap-2">
            {enableDueMode && (
              <div className="border-border bg-muted/40 inline-flex items-center rounded-lg border p-0.5">
                <button
                  type="button"
                  onClick={() => handleModeChange("received")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    activityMode === "received"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Received
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("due")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    activityMode === "due"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Due
                </button>
              </div>
            )}
            <input
              type="date"
              value={selectedDate}
              onChange={handleDatePickerChange}
              max={activityMode === "received" ? today : undefined}
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
          {activityMode === "received" && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card onClick={() => handleDrilldownCard("jobs")} className={cn("relative cursor-pointer overflow-hidden", drilldownCard === "jobs" && "ring-2 ring-primary")}>
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
                  className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.tealGradient} rounded-bl-[2rem] to-transparent`}
                />
              </CardContent>
            </Card>

            <Card onClick={() => handleDrilldownCard("clients")} className={cn("relative cursor-pointer overflow-hidden", drilldownCard === "clients" && "ring-2 ring-primary")}>
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

            <Card onClick={() => handleDrilldownCard("boards")} className={cn("relative cursor-pointer overflow-hidden", drilldownCard === "boards" && "ring-2 ring-primary")}>
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

            <Card onClick={() => handleDrilldownCard("busiest")} className={cn("relative cursor-pointer overflow-hidden", drilldownCard === "busiest" && "ring-2 ring-primary")}>
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
                    {data.busiest_client && (<>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {data.busiest_client.count} jobs
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {receivedMetric === "rows"
                          ? `${data.row_total_jobs ?? 0} job row${(data.row_total_jobs ?? 0) !== 1 ? "s" : ""} · ${data.total_jobs} SKUs`
                          : `${data.total_jobs} SKUs · ${data.row_total_jobs ?? 0} job row${(data.row_total_jobs ?? 0) !== 1 ? "s" : ""}`}
                      </p>
                    </>
                    )}
                  </div>
                    <div className={`rounded-full p-2 ${statAccent.tealBg}`}>
                      <Briefcase className={`h-5 w-5 ${statAccent.tealText}`} />
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
          </div>}

          {drilldownCard && drilldownData && !drilldownLoading && (
            <ActivityDrilldownPanel
              data={drilldownData}
              selectedDate={selectedDate}
              mode={activityMode}
              card={drilldownCard}
            />
          )}

              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("clients_active")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("clients_active");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "clients_active" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
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

              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("boards_touched")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("boards_touched");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "boards_touched" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
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

              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("busiest_client")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("busiest_client");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "busiest_client" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
                <div
                  className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.coralGradient} rounded-bl-[2rem] to-transparent`}
                />
                <CardContent className="relative p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-muted-foreground text-sm">Busiest client</p>
                      <p className="truncate text-3xl font-bold tracking-tight">
                        {activeReceivedBusiest?.client_name ?? "—"}
                      </p>
                      {activeReceivedBusiest && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {activeReceivedBusiest.count}{" "}
                          {receivedMetric === "rows"
                            ? `job${activeReceivedBusiest.count !== 1 ? "s" : ""}`
                            : "jobs"}
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
          </>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("due_today")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("due_today");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "due_today" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
                <div
                  className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.tealGradient} rounded-bl-[2rem] to-transparent`}
                />
                <CardContent className="relative p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">
                        {selectedDate === today
                          ? "Due today"
                          : `Due on ${formatDateLabel(selectedDate)}`}
                      </p>
                      <p className="text-3xl font-bold tracking-tight">
                        {dueSummary.due_selected_day}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Open tasks due on selected day
                      </p>
                    </div>
                    <div className={`rounded-full p-2 ${statAccent.tealBg}`}>
                      <Clock className={`h-5 w-5 ${statAccent.tealText}`} />
                    </div>
                  </div>
                  <div
                    className={`absolute right-2 bottom-2 border-t border-r ${statAccent.tealBorder} h-4 w-4`}
                  />
                </CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("overdue")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("overdue");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "overdue" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
                <div
                  className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.coralGradient} rounded-bl-[2rem] to-transparent`}
                />
                <CardContent className="relative p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">Overdue</p>
                      <p className="text-3xl font-bold tracking-tight text-red-600 dark:text-red-400">
                        {dueSummary.overdue}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Open tasks due before today
                      </p>
                    </div>
                    <div className={`rounded-full p-2 ${statAccent.coralBg}`}>
                      <AlertTriangle className={`h-5 w-5 ${statAccent.coralText}`} />
                    </div>
                  </div>
                  <div
                    className={`absolute right-2 bottom-2 border-t border-r ${statAccent.coralBorder} h-4 w-4`}
                  />
                </CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("upcoming")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("upcoming");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "upcoming" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
                <div
                  className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.amberGradient} rounded-bl-[2rem] to-transparent`}
                />
                <CardContent className="relative p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">Upcoming</p>
                      <p className="text-3xl font-bold tracking-tight">
                        {dueSummary.upcoming}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Next 7 days: {dueSummary.upcoming_next_7_days}
                        {dueSummary.next_due_date
                          ? ` · Next: ${formatDateLabel(dueSummary.next_due_date)}`
                          : ""}
                      </p>
                    </div>
                    <div className={`rounded-full p-2 ${statAccent.amberBg}`}>
                      <TrendingUp className={`h-5 w-5 ${statAccent.amberText}`} />
                    </div>
                  </div>
                  <div
                    className={`absolute right-2 bottom-2 border-t border-r ${statAccent.amberBorder} h-4 w-4`}
                  />
                </CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => handleCardClick("no_due_date")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick("no_due_date");
                  }
                }}
                className={cn(
                  "relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
                  activeCard === "no_due_date" &&
                    "ring-2 ring-[#0073ea] dark:ring-[#0073ea]",
                )}
              >
                <div
                  className={`absolute top-0 right-0 h-12 w-12 bg-gradient-to-br ${statAccent.lavenderGradient} rounded-bl-[2rem] to-transparent`}
                />
                <CardContent className="relative p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">No due date</p>
                      <p className="text-3xl font-bold tracking-tight">
                        {dueSummary.no_due_date}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {dueSummary.clients_active} clients · {dueSummary.boards_touched} boards
                      </p>
                    </div>
                    <div className={`rounded-full p-2 ${statAccent.lavenderBg}`}>
                      <Briefcase className={`h-5 w-5 ${statAccent.lavenderText}`} />
                    </div>
                  </div>
                  <div
                    className={`absolute right-2 bottom-2 border-t border-r ${statAccent.lavenderBorder} h-4 w-4`}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Inline Day details panel (opens below KPI cards, pushing chart down without hiding it) */}
          {isPanelOpen && tasksData && (
            <ActivityDrilldownPanel
              data={tasksData}
              selectedDate={selectedDate}
              mode={activityMode}
              card={activeCard}
              defaultOnlyMine={arrivedFromMyWork}
              onClose={() => setActiveCard(null)}
            />
          )}

          {/* Per-client breakdown grid (Received mode) */}
          {activityMode === "received" && (
            <>
              {activeReceivedTotal === 0 ? (
                !isPanelOpen && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                      <CalendarDays className="text-muted-foreground/40 mb-3 h-10 w-10" />
                      <h3 className="text-base font-medium">
                        No jobs recorded for this day
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Try selecting a different date or refreshing.
                      </p>
                    </CardContent>
                  </Card>
                )
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      {formatFullDate(selectedDate)}
                    </h3>
                    <span className="text-muted-foreground text-sm">
                      {activeReceivedClients.length} client
                      {activeReceivedClients.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {activeReceivedClients.map((client) => {
                      const widthPct =
                        isDashboard && activeReceivedTotal > 0
                          ? (client.count / activeReceivedTotal) * 100
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
                        { length: (4 - (activeReceivedClients.length % 4)) % 4 },
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
            </>
          )}

          {/* Volume trend chart (always visible below panel) */}
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Volume trend</h3>
                  <p className="text-muted-foreground text-xs">
                    {activityMode === "due"
                      ? "Open tasks due per day, selected day highlighted"
                      : "Jobs received per day, selected day highlighted"}
                  </p>
                </div>
                <TrendingUp className="text-muted-foreground h-5 w-5" />
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={activeDailyBreakdown.map((d) => ({
                      ...d,
                      label: formatDateLabel(d.date),
                      isSelected: d.date === selectedDate,
                    }))}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    onClick={(chartState) => {
                      const clickedLabel = chartState?.activeLabel;
                      if (!clickedLabel) return;
                      const matched = activeDailyBreakdown.find(
                        (d) => formatDateLabel(d.date) === String(clickedLabel),
                      );
                      if (matched) {
                        handleDaySelectorClick(matched.date);
                      }
                    }}
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
                      domain={[0, yAxisMax]}
                      ticks={yAxisTicks}
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
                          activeDailyBreakdown.find(
                            (d) => formatDateLabel(d.date) === String(label),
                          )?.date || String(label),
                        )
                      }
                    />
                    {todayInChartRange && selectedDate !== today && (
                      <ReferenceLine
                        x={formatDateLabel(today)}
                        stroke="#f59e0b"
                        strokeDasharray="3 3"
                        strokeWidth={1.5}
                        label={{
                          position: "top",
                          fill: "#f59e0b",
                          fontSize: 10,
                          value: "Today",
                        }}
                      />
                    )}
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
                        value: selectedDate === today ? "Today (Selected)" : "Selected",
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
                {formatFullDate(data?.start ?? selectedDate)} → {formatFullDate(data?.end ?? selectedDate)}, all sources
                combined
              </p>
            </CardContent>
          </Card>

          {/* Unmapped boards notice */}
          {data?.unmapped_boards && data.unmapped_boards > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {data.unmapped_boards} board{data.unmapped_boards !== 1 ? "s" : ""}{" "}
                aren&apos;t included in these numbers yet &mdash; job date not configured
              </span>
            </div>
          )}

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
