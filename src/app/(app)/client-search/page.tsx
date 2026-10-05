"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BoardLayout } from "@/components/shared/board-layout";
import { useWorkspace } from "@/lib/workspace-context";
import { fetchClientSearchData } from "@/features/analytics/aggregation/actions";
import { applyFilters, extractFilterOptions } from "@/features/analytics/aggregation/filter-logic";
import type { UnifiedDataset, UnifiedJobRow, DashboardFilters } from "@/features/analytics/aggregation/types";
import { KpiCards } from "./components/kpi-cards";
import { ChartsSection } from "./components/charts-section";
import { ClientSearchTable } from "./components/client-search-table";
import { MultiSelect } from "./components/multi-select";
import { DateRangePicker } from "./components/date-range-picker";

const DEFAULT_FILTERS: DashboardFilters = {
  clientName: "",
  jobType: "",
  status: [],
  assignedTo: "",
  dateRange: { from: null, to: null },
};

const POLL_INTERVAL_MS = 30_000;

export default function ClientSearchDashboard() {
  const { activeWorkspaceId } = useWorkspace();

  const [dataset, setDataset] = useState<UnifiedDataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Data Fetching ──────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await fetchClientSearchData(activeWorkspaceId);
    if (err) {
      setError(err);
    } else if (data) {
      setDataset(data);
      setLastRefreshed(new Date());
    }
    setIsLoading(false);
  }, [activeWorkspaceId]);

  // Initial load + polling
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  // Refresh on window focus
  useEffect(() => {
    const handleFocus = () => { loadData(); };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadData]);

  // ── Derived Data ───────────────────────────────────────
  const filterOptions = useMemo(
    () => (dataset ? extractFilterOptions(dataset.rows) : { clientNames: [], jobTypes: [], statuses: [], assignedTo: [] }),
    [dataset],
  );

  const filteredRows = useMemo(
    () => (dataset ? applyFilters(dataset.rows, filters) : []),
    [dataset, filters],
  );

  // ── Filter Handlers ────────────────────────────────────
  const updateFilter = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.clientName) count++;
    if (filters.jobType) count++;
    if (filters.status.length > 0) count++;
    if (filters.assignedTo) count++;
    if (filters.dateRange.from || filters.dateRange.to) count++;
    return count;
  }, [filters]);

  // ── Render ─────────────────────────────────────────────
  return (
    <BoardLayout
      boardId="client-search"
      description="Unified search across all boards and workspaces"
      views={[]}
      activeViewId=""
      onViewChange={() => {}}
      onRenameView={async () => {}}
      onDuplicateView={async () => {}}
      onDeleteView={async () => {}}
    >
      <div className="space-y-6">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Client Search</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Unified view across all boards &middot; {dataset?.rows.length ?? 0} jobs
              {lastRefreshed && (
                <span className="text-xs ml-2">
                  Updated {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Filter Bar ─────────────────────────────────── */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
            )}
            {activeFilterCount > 0 && (
              <Button variant="link" size="sm" onClick={resetFilters} className="ml-auto text-xs">
                Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Client Name */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search client..."
                value={filters.clientName}
                onChange={(e) => updateFilter("clientName", e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Job Type */}
            <Select
              value={filters.jobType}
              onValueChange={(v) => updateFilter("jobType", v || "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Job type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All types</SelectItem>
                {filterOptions.jobTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Multi-Select */}
            <MultiSelect
              placeholder="Status"
              options={filterOptions.statuses}
              selected={filters.status}
              onChange={(v) => updateFilter("status", v)}
            />

            {/* Assigned To */}
            <Select
              value={filters.assignedTo}
              onValueChange={(v) => updateFilter("assignedTo", v || "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Assigned to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All members</SelectItem>
                {filterOptions.assignedTo.map((person) => (
                  <SelectItem key={person} value={person}>{person}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date Range */}
            <DateRangePicker
              value={filters.dateRange}
              onChange={(v) => updateFilter("dateRange", v)}
            />
          </div>
        </div>

        {/* ── Loading / Error States ──────────────────────── */}
        {isLoading && !dataset && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading unified dataset...
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load data: {error}
          </div>
        )}

        {/* ── KPI Cards ───────────────────────────────────── */}
        {!isLoading && dataset && (
          <>
            <KpiCards rows={filteredRows} />

            <Separator />

            {/* ── Charts ───────────────────────────────────── */}
            <ChartsSection rows={filteredRows} />

            <Separator />

            {/* ── Data Table ───────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">All Jobs</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredRows.length} of {dataset.rows.length} jobs
                </p>
              </div>
              <ClientSearchTable rows={filteredRows} />
            </div>
          </>
        )}
      </div>
    </BoardLayout>
  );
}
