"use client";

/**
 * PFM1 Dashboard — Top-level job log dashboard
 *
 * Owns the single source-of-truth dataset (persisted to localStorage),
 * the filter/search state, and the new-job dialog. Every child component
 * receives the same reactive `filteredRows` array so charts and table
 * never drift out of sync.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Users,
  Package,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { usePersistedState } from "@/lib/storage";
import type { DashboardFilters, JobLogRow, StatCardSpec } from "./types";
import { MOCK_JOBS } from "./data/mock-data";
import { DEFAULT_FILTERS, filterAndSearch } from "./lib/filtering";
import { computeKpis } from "./lib/aggregation";
import { JobLogHeader } from "./components/JobLogHeader";
import { JobLogSearchBar } from "./components/JobLogSearchBar";
import { StatCard } from "./components/StatCard";
import { FilterBar } from "./components/FilterBar";
import { JobsByMonthChart } from "./components/JobsByMonthChart";
import { JobsByTypeChart } from "./components/JobsByTypeChart";
import { TopClientsList } from "./components/TopClientsList";
import { JobLogTable } from "./components/JobLogTable";
import { NewJobDialog } from "./components/NewJobDialog";

export function Dashboard() {
  const [jobs, setJobs] = usePersistedState<JobLogRow[]>("pfm1-job-log", MOCK_JOBS);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);

  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  const filteredRows = useMemo(
    () => filterAndSearch(jobs, filters, searchQuery),
    [jobs, filters, searchQuery],
  );

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const row = (e as CustomEvent<JobLogRow>).detail;
      if (!row) return;
      setJobs((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    };
    window.addEventListener("pfm1:job-updated", handleUpdate);
    return () => window.removeEventListener("pfm1:job-updated", handleUpdate);
  }, [setJobs]);

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery("");
  };

  const handleAddJob = (data: Omit<JobLogRow, "id" | "updatedAt">) => {
    const now = new Date().toISOString();
    const newJob: JobLogRow = {
      id: `pfm1-${Date.now()}`,
      ...data,
      received: data.received,
      uploaded: data.uploaded,
      updatedAt: now,
    };
    setJobs((prev) => [newJob, ...prev]);
    setIsNewJobOpen(false);
    toast.success(`Added job for ${data.client}`);
  };

  const kpis = useMemo(() => computeKpis(filteredRows), [filteredRows]);

  const statCards: StatCardSpec[] = [
    { label: "TOTAL JOBS", value: kpis.totalJobs, colorVar: "gray", icon: BarChart3 },
    { label: "COMPLETED", value: kpis.completed, colorVar: "teal", icon: CheckCircle2 },
    { label: "PENDING", value: kpis.pending, colorVar: "coral", icon: Clock },
    { label: "ACTIVE CLIENTS", value: kpis.activeClients, colorVar: "amber", icon: Users },
    { label: "SKUS PROCESSED", value: kpis.skusProcessed.toLocaleString(), colorVar: "lavender", icon: Package },
    { label: "COMPLETION RATE", value: `${kpis.completionRate}%`, colorVar: "teal", icon: TrendingUp },
  ];

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <JobLogHeader
        title="PFM1 Job Log"
        subtitle="Client production tracker — batches, uploads & status"
        initials="PF"
        lastUpdated={lastUpdated}
      />

      {/* ── Search ─────────────────────────────────────────── */}
      <JobLogSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search any client, batch or job type..."
      />

      {/* ── Stat Cards ─────────────────────────────────────── */}
      <section
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        aria-label="Summary statistics"
      >
        {statCards.map((card) => (
          <StatCard key={card.label} spec={card} />
        ))}
      </section>

      {/* ── Filter Bar ─────────────────────────────────────── */}
      <FilterBar
        rows={jobs}
        filters={filters}
        onChange={setFilters}
        onReset={handleReset}
        onNewJob={() => setIsNewJobOpen(true)}
      />

      {/* ── Content Grid ──────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <JobsByMonthChart rows={filteredRows} />
        <JobsByTypeChart rows={filteredRows} />
        <TopClientsList rows={filteredRows} limit={10} />
      </section>

      {/* ── Full Job Log Table ────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Full job log</h2>
          <span className="text-sm text-muted-foreground">
            {filteredRows.length} job{filteredRows.length === 1 ? "" : "s"}
          </span>
        </div>
        <JobLogTable rows={filteredRows} />
      </section>

      {/* ── New Job Dialog ─────────────────────────────────── */}
      <NewJobDialog
        open={isNewJobOpen}
        onClose={() => setIsNewJobOpen(false)}
        onAddJob={handleAddJob}
      />
    </>
  );
}
