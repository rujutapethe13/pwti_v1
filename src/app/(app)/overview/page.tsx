"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  CheckCheck,
  ListChecks,
  Clock,
  Activity,
  Zap,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TimeRangeSelector } from "@/features/overview/time-range-selector";
import { StatCardsSection } from "@/features/overview/stat-cards-section";
import { DailyListsSection } from "@/features/overview/daily-lists-section";
import { VolumeTrendSection } from "@/features/overview/volume-trend-section";
import { VolumeBreakdownSection } from "@/features/overview/volume-breakdown-section";
import {
  DEFAULT_TIME_RANGE_ID,
  isDateKey,
  resolveSelectedTimeRange,
  timeRangeQueryString,
  type CustomRange,
  type TimeRangeId,
} from "@/features/overview/time-range";
import { useWorkspace } from "@/lib/workspace-context";
import { useUser } from "@/lib/user-context";
import { BoardSelector, type OverviewBoard } from "@/features/overview/board-selector";
import { Skeleton } from "@/components/shared/skeleton";

const iconMap: Record<string, typeof CheckCheck> = {
  CheckCheck,
  ListChecks,
  Clock,
  Activity,
  Zap,
};

interface RangeEcho {
  id: string;
  label: string;
  from: string;
  to: string;
  days: number;
  granularity: "day" | "week" | "month";
}

interface WorkloadItem {
  team: string;
  jobs: number;
  percentage: number;
}

interface ActivityEvent {
  id: string;
  icon: string;
  title: string;
  detail: string;
  timestamp: string;
}

interface OverviewResponse {
  range: RangeEcho;
  workloadByTeam: WorkloadItem[];
  userName: string | null;
  activityFeed: ActivityEvent[];
  activityMissing: boolean;
  error?: string;
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Hour of the day (0-23) in the given IANA time zone. */
function hourInZone(timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "numeric",
  }).format(new Date());
  const h = Number(hour);
  return Number.isFinite(h) ? h : new Date().getHours();
}

function greetingForHour(h: number): string {
  if (h >= 5 && h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function RelativeTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dateLabel = useMemo(() => {
    return now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [now]);

  const timeLabel = useMemo(() => {
    return now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, [now]);

  return (
    <span className="text-muted-foreground text-xs font-medium tracking-wide">
      {dateLabel.toUpperCase()} &middot; {timeLabel}
    </span>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="bg-muted mt-0.5 h-7 w-7 shrink-0 animate-pulse rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            <div className="bg-muted h-3 w-48 animate-pulse rounded" />
            <div className="bg-muted h-3 w-16 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkloadSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="bg-muted h-3 w-20 animate-pulse rounded" />
          <div className="bg-muted h-2 w-full animate-pulse rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message, icon: Icon }: { message: string; icon: typeof Activity }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center py-8 text-center">
      <Icon className="mb-2 size-8 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-destructive flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle className="mb-2 size-8" />
      <p className="mb-2 text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1 size-3" />
        Retry
      </Button>
    </div>
  );
}

function OverviewPage() {
  const { activeWorkspace } = useWorkspace();
  const boards = useMemo<OverviewBoard[]>(
    () => (activeWorkspace?.content ?? [])
      .filter((item) => item.type === "board" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id))
      .map((item) => ({ id: item.id, name: item.name })),
    [activeWorkspace],
  );
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [breakdownBoardIds, setBreakdownBoardIds] = useState<string[]>([]);
  useEffect(() => {
    const all = boards.map((board) => board.id);
    const read = (key: string) => {
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null");
        return Array.isArray(saved) ? saved.filter((id) => all.includes(id)) : all;
      } catch {
        return all;
      }
    };
    setSelectedBoardIds(read(`overview-workload-boards-${activeWorkspace?.id ?? ""}`));
    setBreakdownBoardIds(read(`overview-breakdown-boards-${activeWorkspace?.id ?? ""}`));
  }, [boards, activeWorkspace?.id]);
  const updateWorkloadBoards = (ids: string[]) => {
    setSelectedBoardIds(ids);
    localStorage.setItem(`overview-workload-boards-${activeWorkspace?.id ?? ""}`, JSON.stringify(ids));
  };
  const updateBreakdownBoards = (ids: string[]) => {
    setBreakdownBoardIds(ids);
    localStorage.setItem(`overview-breakdown-boards-${activeWorkspace?.id ?? ""}`, JSON.stringify(ids));
  };
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [rangeId, setRangeId] = useState<TimeRangeId>(DEFAULT_TIME_RANGE_ID);
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const { settings } = useUser();
  const timeZone = settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Seed the greeting with the last known first name so returning visitors see
  // a name on first paint (never a dummy), then reconcile with the real profile.
  const [seedName, setSeedName] = useState("");
  useEffect(() => {
    try {
      setSeedName(localStorage.getItem("overview-first-name") ?? "");
    } catch {
      setSeedName("");
    }
  }, []);

  // The greeting word and the date line share one timezone source: the user's
  // saved setting, falling back to the browser's local time zone. Computed on
  // the client only, so there is no UTC/server-time value to hydrate against.
  const [mounted, setMounted] = useState(false);
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const refresh = () => setGreeting(greetingForHour(hourInZone(timeZone)));
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [mounted, timeZone]);

  const workspaceName = activeWorkspace?.name;

  // The display name: real profile/auth name first, then the cached first name
  // from an earlier visit. Never a dummy — null renders nothing.
  const userName = (data?.userName ?? seedName) || null;

  // A custom range only counts once both bounds are real dates, so a half-filled
  // picker cannot narrow the window to a single day by accident.
  const effectiveCustomRange = useMemo<CustomRange | null>(() => {
    if (!customRange) return null;
    if (!isDateKey(customRange.from) || !isDateKey(customRange.to)) return null;
    return customRange;
  }, [customRange]);

  // The resolved window is sent to the query layer so every section is
  // re-queried for the selected range — nothing is sliced client-side.
  const rangeQuery = useMemo(
    () => timeRangeQueryString(resolveSelectedTimeRange(rangeId, effectiveCustomRange)),
    [rangeId, effectiveCustomRange],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const boardQuery = selectedBoardIds.length ? `&boards=${selectedBoardIds.join(",")}` : "&boards=";
      const res = await fetch(`/api/overview?${rangeQuery}&range=${rangeId}${boardQuery}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch overview data");
      }
      const json = await res.json();
      if (json.userName) {
        try {
          localStorage.setItem("overview-first-name", json.userName);
        } catch {
          // localStorage unavailable or over quota: skip caching.
        }
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [rangeQuery, rangeId, selectedBoardIds]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rangeCaption = useMemo(() => {
    const active = data?.range;
    if (!active) return null;
    const from = new Date(`${active.from}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const to = new Date(`${active.to}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${from} – ${to}`;
  }, [data]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-6 py-10 sm:px-8 lg:px-12">
      {/* ── Greeting Block ─────────────────────── */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {workspaceName && (
            <nav className="text-muted-foreground flex items-center gap-1 text-xs">
              <span>{workspaceName}</span>
              <ChevronRight className="size-3" aria-hidden="true" />
              <span className="text-foreground">Overview</span>
            </nav>
          )}
          <RelativeTime />
          <h1 className="metric-figure text-foreground mt-2 text-4xl sm:text-5xl">
            {mounted ? (
              <>
                {greeting}
                {userName ? `, ${capitalize(userName)}.` : "."}
              </>
            ) : (
              <span
                className="bg-muted animate-pulse rounded inline-block h-7 w-48 sm:w-64"
                aria-hidden="true"
              />
            )}
          </h1>
          <p className="text-muted-foreground text-sm">
            Here&apos;s what&apos;s happening across your studio ·{" "}
            {data?.range.label.toLowerCase() ?? "last 7 days"}.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
          <TimeRangeSelector
            value={rangeId}
            onChange={setRangeId}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            disabled={isLoading}
            className="w-full justify-between sm:w-auto"
          />
          {rangeCaption && (
            <p className="text-muted-foreground text-xs">{rangeCaption}</p>
          )}
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
            <Plus className="size-4" />
            New job
          </Button>
        </div>
      </div>

      {/* ── Stat cards (own loading / empty / error states) ── */}
      <StatCardsSection rangeId={rangeId} customRange={effectiveCustomRange} />

      {/* ── Volume trend (own loading / empty / error states) ── */}
      <VolumeTrendSection rangeId={rangeId} customRange={effectiveCustomRange} />

      {/* ── Volume breakdown by job type (own states) ── */}
      <VolumeBreakdownSection
        rangeId={rangeId}
        customRange={effectiveCustomRange}
        boards={boards}
        selectedBoardIds={breakdownBoardIds}
        onBoardChange={updateBreakdownBoards}
      />

      {/* ── Today's jobs / Overdue / Upcoming ──────────────────────────
          Always "now"-relative: these three lists ignore the range selector
          above, and each panel owns its loading, empty and error state. ── */}
      <DailyListsSection />

      {/* ── Two-Column: Activity + Volume/Workload ────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Studio Activity */}
        <Card className="border-border/60 p-6 shadow-none lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-foreground text-base font-medium tracking-tight">
                Studio activity
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Recent events across your workspace
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              aria-label="Refresh activity"
              title="Refresh"
              onClick={loadData}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          <div className="mt-5 space-y-0">
            {isLoading ? (
              <ActivitySkeleton />
            ) : error ? (
              <ErrorState message={error} onRetry={loadData} />
            ) : data?.activityMissing ? (
              <div className="text-muted-foreground py-8 text-center">
                <Activity className="mx-auto mb-2 size-8 opacity-50" />
                <p className="text-sm">
                  Activity feed unavailable — audit log table not configured
                </p>
              </div>
            ) : data?.activityFeed.length === 0 ? (
              <EmptyState message="No activity yet" icon={Activity} />
            ) : (
              data!.activityFeed.map((event: ActivityEvent, i: number) => {
                const Icon = iconMap[event.icon] ?? Activity;
                return (
                  <div key={event.id}>
                    <div className="flex items-start gap-3 py-3">
                      <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
                        <Icon
                          className="text-muted-foreground size-3.5"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm font-medium">
                          {event.title}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {event.detail}
                        </p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {event.timestamp}
                      </span>
                    </div>
                    {i < data!.activityFeed.length - 1 && <Separator />}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Workload by board: the data model assigns each row to a board, not a team. */}
          <Card className="border-border/60 flex-1 p-6 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-foreground text-base font-medium tracking-tight">Workload by board</h2>
              <BoardSelector boards={boards} selectedIds={selectedBoardIds} onChange={updateWorkloadBoards} />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {selectedBoardIds.length} boards · distribution in selected range
            </p>
            <div className="mt-5 space-y-4">
              {isLoading ? (
                <WorkloadSkeleton />
              ) : error ? (
                <ErrorState message={error} onRetry={loadData} />
              ) : data?.workloadByTeam.length === 0 ? (
                <EmptyState message={selectedBoardIds.length === 0 ? "No boards selected" : "No board data"} icon={Users} />
              ) : (
                data!.workloadByTeam.map((team: WorkloadItem) => (
                  <div key={team.team} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-foreground min-w-0 truncate">
                        {team.team}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {team.jobs} {team.jobs === 1 ? "job" : "jobs"}
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-highlight/70 h-full rounded-full transition-all duration-300"
                        style={{ width: `${team.percentage}%` }}
                        role="progressbar"
                        aria-valuenow={team.percentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default OverviewPage;
