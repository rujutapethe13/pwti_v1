"use client";

import { RotateCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DashboardFilters, JobLogRow } from "../types";
import { STATUS_OPTIONS } from "../lib/colors";
import { distinctClients, distinctJobTypes, distinctStatuses, distinctMonths, formatMonthLabel } from "../lib/filtering";

interface FilterBarProps {
  rows: JobLogRow[];
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  onReset: () => void;
  onNewJob: () => void;
  className?: string;
}

export function FilterBar({ rows, filters, onChange, onReset, onNewJob, className }: FilterBarProps) {
  const clients = distinctClients(rows);
  const jobTypes = distinctJobTypes(rows);
  const statuses = distinctStatuses(rows);
  const months = distinctMonths(rows);

  const activeCount =
    (filters.client ? 1 : 0) +
    (filters.jobType ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.month ? 1 : 0);

  const setFilter = (key: keyof DashboardFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="inline-flex h-5 items-center rounded-full border border-border px-1.5 text-xs text-foreground">
            {activeCount}
          </span>
        )}
      </div>

      <Select value={filters.client || undefined} onValueChange={(v) => setFilter("client", v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 w-[150px] text-sm">
          <SelectValue placeholder="All clients" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All clients</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.jobType || undefined} onValueChange={(v) => setFilter("jobType", v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 w-[150px] text-sm">
          <SelectValue placeholder="All job types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All job types</SelectItem>
          {jobTypes.map((j) => (
            <SelectItem key={j} value={j}>{j}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status || undefined} onValueChange={(v) => setFilter("status", v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 w-[150px] text-sm">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
          {statuses.length === 0 && STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.month || undefined} onValueChange={(v) => setFilter("month", v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 w-[150px] text-sm">
          <SelectValue placeholder="All months" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All months</SelectItem>
          {months.map((m) => (
            <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 text-xs"
        onClick={onReset}
        disabled={activeCount === 0}
      >
        <RotateCw className="size-3" aria-hidden="true" />
        Reset
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 gap-1 text-sm font-medium"
          style={{
            backgroundColor: "hsl(var(--soft-amber-bg))",
            color: "hsl(var(--soft-amber-text))",
          }}
          onClick={onNewJob}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New job
        </Button>
      </div>
    </div>
  );
}
