"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Clock,
  RefreshCw,
  Users,
  Briefcase,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Client360SnapshotTrendChart } from "./snapshot-trend-chart";
import { fetchClient360SnapshotAction } from "./snapshot-action";
import type { Client360Snapshot } from "./types";
import { formatPeriodLabel, getTodayISO, getWeekAgoISO } from "./date-format";

type Mode = "day" | "range";

// ── Main snapshot view ─────────────────────────────────────────────────────
export function Client360SnapshotViewImpl() {
  return <Client360SnapshotView />;
}

// ── Snapshot view (Day / Range) ─────────────────────────────────────────────
export function Client360SnapshotView() {
  const today = getTodayISO();
  const weekAgo = getWeekAgoISO();

  const [mode, setMode] = useState<Mode>("day");
  const [day, setDay] = useState<string>(today);
  const [start, setStart] = useState<string>(weekAgo);
  const [end, setEnd] = useState<string>(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Client360Snapshot | null>(null);

  const isDayMode = mode === "day";
  const initialLoaded = useRef(false);

  const fetchSnapshot = useCallback(async (params?: { start?: string; end?: string }) => {
    setLoading(true);
    try {
      const snapshot = await fetchClient360SnapshotAction(params);
      if (snapshot.error) {
        toast.error(snapshot.error);
        return;
      }
      setData(snapshot.data);
    } catch {
      toast.error("Failed to load snapshot");
    } finally {
      setLoading(false);
    }
  }, []);

  // Default state on load: single-day mode for today, calling the API with no
  // params so the server applies its own today default.
  useEffect(() => {
    if (initialLoaded.current) return;
    initialLoaded.current = true;
    void fetchSnapshot({});
  }, [fetchSnapshot]);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    void fetchSnapshot(next === "day" ? { start: day, end: day } : { start, end });
  };

  const handleDayChange = (value: string) => {
    setDay(value);
    void fetchSnapshot({ start: value, end: value });
  };

  const handleStartChange = (value: string) => {
    setStart(value);
    void fetchSnapshot({ start: value, end });
  };

  const handleEndChange = (value: string) => {
    setEnd(value);
    void fetchSnapshot({ start, end: value });
  };

  const handleRefresh = () => {
    void fetchSnapshot(isDayMode ? { start: day, end: day } : { start, end });
  };

  const periodLabel = isDayMode
    ? formatPeriodLabel(day, day)
    : formatPeriodLabel(start, end);
  const topClientCount = data?.clients.length ? data.clients[0].count : 0;

  return (
    <div className="space-y-6">
      {/* ── Mode toggle + date controls ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={isDayMode ? "default" : "outline"}
            size="sm"
            onClick={() => handleModeChange("day")}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Single day
          </Button>
          <Button
            type="button"
            variant={!isDayMode ? "default" : "outline"}
            size="sm"
            onClick={() => handleModeChange("range")}
          >
            <Clock className="mr-2 h-4 w-4" />
            Date range
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isDayMode ? (
            <input
              type="date"
              value={day}
              onChange={(e) => handleDayChange(e.target.value)}
              className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
            />
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={start}
                onChange={(e) => handleStartChange(e.target.value)}
                className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <input
                type="date"
                value={end}
                onChange={(e) => handleEndChange(e.target.value)}
                className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}

      {/* ── Snapshot content ────────────────────────────────────────── */}
      {data ? (
        <>
          {/* Period header */}
          <div className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground h-4 w-4" />
            <h2 className="text-base font-medium">{periodLabel}</h2>
          </div>

          {/* Summary numbers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-full bg-blue-50 p-2">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Total Jobs</p>
                  <p className="text-2xl font-semibold">{data.total_jobs}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-full bg-emerald-50 p-2">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Clients Active</p>
                  <p className="text-2xl font-semibold">{data.clients_active}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-full bg-amber-50 p-2">
                  <Building2 className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Boards Touched</p>
                  <p className="text-2xl font-semibold">{data.boards_touched}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Client rankings / empty state */}
          {data.total_jobs === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <CalendarDays className="text-muted-foreground/40 mb-3 h-10 w-10" />
                <h3 className="text-base font-medium">
                  No jobs recorded for this period
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Try adjusting the date range or refreshing.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-4 text-lg font-semibold">Client Rankings</h3>
                <div className="space-y-2">
                  {data.clients.map((client, idx) => {
                    const widthPct =
                      topClientCount > 0 ? (client.count / topClientCount) * 100 : 0;
                    return (
                      <div
                        key={client.client_id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2"
                      >
                        <span className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{client.client_name}</p>
                          <p className="text-muted-foreground text-xs">
                            {client.client_id}
                          </p>
                        </div>
                        <div className="ml-auto flex w-40 items-center gap-2">
                          <div className="bg-muted h-2 w-full overflow-hidden rounded">
                            <div
                              className="bg-primary h-full rounded"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <Badge variant="secondary" className="w-8 justify-center">
                            {client.count}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily trend (range mode only) */}
          {!isDayMode && data.daily_breakdown.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-4 text-lg font-semibold">Daily Trend</h3>
                <Client360SnapshotTrendChart data={data.daily_breakdown} />
              </CardContent>
            </Card>
          )}

          {/* Team / workload placeholder */}
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-2 text-lg font-semibold">Team / Workload</h3>
              <p className="text-muted-foreground text-sm">
                Team workload data isn&#39;t available yet. This area will surface
                per-person workload once team data is wired up.
              </p>
            </CardContent>
          </Card>

          {/* Unmapped boards notice */}
          {data.unmapped_boards > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {data.unmapped_boards} board{data.unmapped_boards !== 1 ? "s" : ""}{" "}
                aren&#39;t included in these numbers yet — job date not configured
              </span>
            </div>
          )}
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-8 text-center">
        <Building2 className="text-muted-foreground/40 mb-2 h-10 w-10" />
        <p className="text-sm font-medium">No snapshot data</p>
        <p className="text-muted-foreground text-xs">
          Try adjusting your date range or refreshing.
        </p>
      </CardContent>
    </Card>
  );
}
