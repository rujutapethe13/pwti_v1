"use client";

/**
 * Dashboard — Role-driven Widgets
 *
 * A small family of widgets that read their data through the per-board column
 * role mapping instead of raw column IDs, so one default layout works on every
 * board. Each widget declares the roles it needs; when one is unmapped the
 * widget renders a "Map a column" action instead of a dead end.
 *
 *   - KpiCard   — one number with change vs the previous period
 *   - DueList   — overdue + due in the next N days
 *   - JobsTable — recent jobs
 */

import { memo, useMemo } from "react";
import { differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PillToggle, StretchCheckbox } from "./dashboard-shared";
import type { ColumnDefinition, ColumnValue } from "../../../types";
import {
  applyFilters,
  filterRecordsByGroups,
  formatNumber,
  getCellValue,
  resolveGroups,
  type BoardGroup,
  type DashboardFilterCondition,
  type DashboardWidgetGroupFilter,
  type FilterableRecord,
} from "./dashboard-types";
import {
  parseFlexibleDate,
  parseLooseNumber,
  clientGroupKey,
  clientGroupLabel,
  normalizeText,
  readRoleCell,
  resolveRecordStatus,
  isRecordOverdue,
  type ClientAliasMap,
  type DashboardColumnRoles,
  type DashboardRoleKey,
  type StatusBucket,
  type StatusBucketMap,
} from "./column-roles";

// ═══════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════

export interface RoleRecordLike extends FilterableRecord {
  title: string;
  groupId?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface RoleWidgetProps {
  config: Record<string, unknown>;
  columns: ColumnDefinition[];
  groups: BoardGroup[];
  records: RoleRecordLike[];
  cellValues: Map<string, ColumnValue>;
  filters: DashboardFilterCondition[];
  roles: DashboardColumnRoles;
  statusBuckets: StatusBucketMap;
  clientAliases: ClientAliasMap;
  /** Opens the "Map your columns" dialog, optionally focused on one role. */
  onMapColumn: (role: DashboardRoleKey) => void;
}

const DEFAULT_GROUPS: DashboardWidgetGroupFilter = { all: true, top: true, ids: [] };

/** Display label for each column role, shared by prompts, tables, and settings. */
export const ROLE_LABELS: Record<DashboardRoleKey, string> = {
  client: "Client",
  itemName: "Item / Batch name",
  jobType: "Job type",
  receivedDate: "Received date",
  dueDate: "Due date",
  completedDate: "Completed date",
  status: "Status",
  images: "Images/Files count",
  skuCount: "SKU count",
  owner: "Owner/Artist",
  amount: "Amount",
};

/**
 * Shared empty state: the role this widget needs is not mapped, so offer the
 * mapping step rather than rendering a dead "Not available".
 */
export function MapColumnPrompt({
  roleLabel,
  onMapColumn,
}: {
  roleLabel: string;
  onMapColumn: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
      <p className="text-sm text-muted-foreground">
        No column is mapped to <span className="font-medium text-foreground">{roleLabel}</span> yet.
      </p>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-sm" onClick={onMapColumn}>
        Map a column
      </Button>
    </div>
  );
}

/** Records after group selection and dashboard/widget filters. */
function useWorkingRecords(
  props: RoleWidgetProps,
): RoleRecordLike[] {
  const { columns, groups, records, cellValues, filters, config } = props;
  const groupFilter = (config.groups as DashboardWidgetGroupFilter | undefined) ?? DEFAULT_GROUPS;
  return useMemo(() => {
    let working = filterRecordsByGroups(records, resolveGroups(groups), groupFilter);
    working = applyFilters(working, columns, cellValues, filters);
    return working;
  }, [columns, groups, records, cellValues, filters, groupFilter]);
}

/**
 * Row label for the table lists (Recent jobs, Overdue): the mapped
 * "Item / Batch name" column when one exists, otherwise the record title.
 * Trimmed and grouped case-insensitively like any other mapped column.
 */
export function roleItemLabel(
  record: RoleRecordLike,
  props: RoleWidgetProps,
): string {
  const columnId = props.roles.itemName;
  const raw = columnId ? readRoleCell(record, columnId, props.cellValues) : record.title;
  return clientGroupKey(raw) ? clientGroupLabel(clientGroupKey(raw)) : "—";
}

/** Count of rows dropped because a required value was empty/unparseable. */
function ExcludedCount({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-[10px] text-muted-foreground underline decoration-dotted">
          {count} {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {count} {label} — rows with an empty or unparseable value are excluded from this number.
      </TooltipContent>
    </Tooltip>
  );
}

// ═══════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════

export type KpiMetric =
  | "total_jobs"
  | "working_on_it"
  | "done"
  | "overdue"
  | "total_images"
  | "total_skus";

export interface KpiCardConfig {
  metric: KpiMetric;
  /** Date column role the metric is bucketed by for the period comparison. */
  periodRole: DashboardRoleKey;
  showChange: boolean;
  groups: DashboardWidgetGroupFilter;
}

/** Role each KPI metric needs; null means the metric needs no role. */
export const KPI_METRIC_ROLES: Record<KpiMetric, DashboardRoleKey | null> = {
  total_jobs: null,
  working_on_it: "status",
  done: "status",
  overdue: "dueDate",
  total_images: "images",
  total_skus: "skuCount",
};

export const KPI_METRIC_LABELS: Record<KpiMetric, string> = {
  total_jobs: "Total jobs",
  working_on_it: "Working on it",
  done: "Done",
  overdue: "Overdue",
  total_images: "Total images",
  total_skus: "Total SKUs",
};

export const KPI_DEFAULT_PERIOD_ROLE: Record<KpiMetric, DashboardRoleKey> = {
  total_jobs: "receivedDate",
  working_on_it: "receivedDate",
  done: "completedDate",
  overdue: "receivedDate",
  total_images: "receivedDate",
  total_skus: "receivedDate",
};

function kpiValue(
  metric: KpiMetric,
  records: RoleRecordLike[],
  props: RoleWidgetProps,
): { value: number | null; excluded: number } {
  const { roles, cellValues, statusBuckets } = props;

  switch (metric) {
    case "total_jobs":
      return { value: records.length, excluded: 0 };
    case "working_on_it":
    case "done": {
      const wanted: StatusBucket = metric === "done" ? "done" : "working_on_it";
      let value = 0;
      for (const r of records) {
        if (resolveRecordStatus(r, roles, cellValues, statusBuckets) === wanted) value += 1;
      }
      return { value, excluded: 0 };
    }
    case "overdue": {
      let value = 0;
      let excluded = 0;
      for (const r of records) {
        if (!parseFlexibleDate(readRoleCell(r, roles.dueDate, cellValues))) {
          excluded += 1;
          continue;
        }
        if (isRecordOverdue(r, roles, cellValues, statusBuckets)) value += 1;
      }
      return { value, excluded };
    }
    case "total_images":
    case "total_skus": {
      const role = metric === "total_images" ? "images" : "skuCount";
      let total = 0;
      let excluded = 0;
      for (const r of records) {
        const parsed = parseLooseNumber(readRoleCell(r, roles[role], cellValues));
        if (parsed === null) {
          excluded += 1;
          continue;
        }
        total += parsed;
      }
      return { value: total, excluded };
    }
    default:
      return { value: null, excluded: 0 };
  }
}

export const KpiCardContent = memo(function KpiCardContent(props: RoleWidgetProps) {
  const cfg = props.config as unknown as KpiCardConfig;
  const metric = cfg.metric ?? "total_jobs";
  const working = useWorkingRecords(props);

  const requiredRole = KPI_METRIC_ROLES[metric];
  const mapped = requiredRole ? Boolean(props.roles[requiredRole]) : true;

  const { value, excluded } = useMemo(
    () => kpiValue(metric, working, props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metric, working, props.roles, props.statusBuckets, props.cellValues],
  );

  // Change vs the previous period of equal length, bucketed by the period role.
  const change = useMemo(() => {
    if (!cfg.showChange) return null;
    const periodRole = cfg.periodRole ?? KPI_DEFAULT_PERIOD_ROLE[metric];
    const columnId = props.roles[periodRole];
    if (!columnId) return null;

    const dated = working
      .map((r) => ({ r, d: parseFlexibleDate(getCellValue(r.id, columnId, props.cellValues)) }))
      .filter((v): v is { r: typeof working[number]; d: Date } => v.d !== null);
    if (dated.length === 0) return null;

    const latest = dated.reduce((max, v) => (v.d > max ? v.d : max), dated[0].d);
    const spanDays = Math.max(
      1,
      dated.reduce(
        (max, v) => Math.max(max, differenceInCalendarDays(latest, v.d)),
        0,
      ) + 1,
    );
    const windowEnd = startOfDay(latest);
    const windowStart = subDays(windowEnd, spanDays - 1);
    const priorEnd = subDays(windowStart, 1);
    const priorStart = subDays(priorEnd, spanDays - 1);

    const current = dated.filter((v) => v.d >= windowStart && v.d <= windowEnd).map((v) => v.r);
    const prior = dated.filter((v) => v.d >= priorStart && v.d <= priorEnd).map((v) => v.r);

    const currentValue = kpiValue(metric, current, props).value ?? 0;
    const priorValue = kpiValue(metric, prior, props).value ?? 0;
    if (priorValue === 0) return null;
    return ((currentValue - priorValue) / priorValue) * 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.showChange, cfg.periodRole, metric, working, props.roles, props.cellValues, props.statusBuckets]);

  if (!mapped && requiredRole) {
    return (
      <MapColumnPrompt
        roleLabel={ROLE_LABELS[requiredRole]}
        onMapColumn={() => props.onMapColumn(requiredRole)}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
      <div className="text-3xl font-bold break-all text-foreground">{formatNumber(value)}</div>
      <div className="text-sm uppercase text-muted-foreground">{KPI_METRIC_LABELS[metric]}</div>
      <div className="flex min-h-4 items-center gap-2">
        {change !== null && (
          <span className={change >= 0 ? "text-xs text-emerald-600" : "text-xs text-destructive"}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs previous period
          </span>
        )}
        <ExcludedCount count={excluded} label="rows excluded" />
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// DUE LIST
// ═══════════════════════════════════════════════════════════

export interface DueListConfig {
  /** "overdue" = past due only, "upcoming" = next N days, "both" = the default. */
  mode: "overdue" | "upcoming" | "both";
  daysAhead: number;
  limit: number;
  groups: DashboardWidgetGroupFilter;
}

export const DUE_LIST_DEFAULT_CONFIG: DueListConfig = {
  mode: "both",
  daysAhead: 7,
  limit: 10,
  groups: DEFAULT_GROUPS,
};

export const DueListContent = memo(function DueListContent(props: RoleWidgetProps) {
  const cfg = { ...DUE_LIST_DEFAULT_CONFIG, ...(props.config as unknown as Partial<DueListConfig>) };
  const working = useWorkingRecords(props);

  const rows = useMemo(() => {
    if (!props.roles.dueDate) return [];

    const today = startOfDay(new Date());
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + cfg.daysAhead);

    const out: Array<{ id: string; title: string; due: Date; overdue: boolean }> = [];
    for (const r of working) {
      const due = parseFlexibleDate(readRoleCell(r, props.roles.dueDate, props.cellValues));
      if (!due) continue;
      const overdue = isRecordOverdue(r, props.roles, props.cellValues, props.statusBuckets);
      const isUpcoming = !overdue && due >= today && due <= horizon;
      if (cfg.mode === "overdue" && !overdue) continue;
      if (cfg.mode === "upcoming" && !isUpcoming) continue;
      out.push({ id: r.id, title: roleItemLabel(r, props), due, overdue });
    }

    return out
      .sort((a, b) => (a.overdue === b.overdue ? a.due.getTime() - b.due.getTime() : a.overdue ? -1 : 1))
      .slice(0, cfg.limit);
  }, [
    working,
    cfg.mode,
    cfg.daysAhead,
    cfg.limit,
    props.roles,
    props.roles.itemName,
    props.cellValues,
    props.statusBuckets,
  ]);

  if (!props.roles.dueDate) {
    return <MapColumnPrompt roleLabel="Due date" onMapColumn={() => props.onMapColumn("dueDate")} />;
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
        Nothing overdue or due in the next {cfg.daysAhead} days.
      </div>
    );
  }

  const today = startOfDay(new Date());
  return (
    <div className="h-full w-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => {
            const days = differenceInCalendarDays(row.due, today);
            return (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-2 align-top">
                  <span className="flex items-start gap-1.5">
                    {row.overdue && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
                    <span className="truncate text-foreground">{row.title || "(no title)"}</span>
                  </span>
                </td>
                <td className="w-28 py-1.5 text-right align-top">
                  <span className="tabular-nums text-muted-foreground">{format(row.due, "d MMM")}</span>
                </td>
                <td className="w-20 py-1.5 text-right align-top">
                  <span className={row.overdue ? "text-destructive" : "text-muted-foreground"}>
                    {row.overdue ? `${Math.abs(days)}d late` : days === 0 ? "today" : `in ${days}d`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// JOBS TABLE
// ═══════════════════════════════════════════════════════════

export interface JobsTableConfig {
  limit: number;
  /** Extra column roles to show as columns, in addition to Client and Status. */
  columnRoles: DashboardRoleKey[];
  groups: DashboardWidgetGroupFilter;
}

export const JOBS_TABLE_DEFAULT_CONFIG: JobsTableConfig = {
  limit: 10,
  columnRoles: ["jobType"],
  groups: DEFAULT_GROUPS,
};

export const JobsTableContent = memo(function JobsTableContent(props: RoleWidgetProps) {
  const cfg = { ...JOBS_TABLE_DEFAULT_CONFIG, ...(props.config as unknown as Partial<JobsTableConfig>) };
  const working = useWorkingRecords(props);

  const rows = useMemo(
    () =>
      [...working]
        .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""))
        .reverse()
        .slice(0, cfg.limit),
    [working, cfg.limit],
  );

  const columnRoles = (cfg.columnRoles ?? []).filter((role) => Boolean(props.roles[role]));
  const hasClient = Boolean(props.roles.client);

  const value = (r: RoleRecordLike, role: DashboardRoleKey): string => {
    const raw = readRoleCell(r, props.roles[role], props.cellValues);
    if (role === "client" || role === "itemName") {
      const key = clientGroupKey(raw, props.clientAliases);
      return key ? clientGroupLabel(key, props.clientAliases) : "—";
    }
    if (role === "status") {
      return raw === undefined || raw === null || raw === "" ? "—" : String(raw);
    }
    return normalizeText(raw) || "—";
  };

  const statusLabel = (r: RoleRecordLike): string => {
    if (!props.roles.status) return "—";
    const bucket = resolveRecordStatus(r, props.roles, props.cellValues, props.statusBuckets);
    switch (bucket) {
      case "working_on_it":
        return "Working on it";
      case "done":
        return "Done";
      case "on_hold":
        return "On hold";
      default:
        return "Not started";
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
        No jobs match the current filters.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-1.5 pr-2 font-medium">Job</th>
            {hasClient && <th className="py-1.5 pr-2 font-medium">Client</th>}
            {columnRoles.map((role) => (
              <th key={role} className="py-1.5 pr-2 font-medium">
                {ROLE_LABELS[role]}
              </th>
            ))}
            <th className="py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="max-w-0 truncate py-1.5 pr-2 text-foreground">
                {roleItemLabel(r, props)}
              </td>
              {hasClient && <td className="max-w-0 truncate py-1.5 pr-2">{value(r, "client")}</td>}
              {columnRoles.map((role) => (
                <td key={role} className="max-w-0 truncate py-1.5 pr-2">
                  {value(r, role)}
                </td>
              ))}
              <td className="py-1.5">{statusLabel(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// SETTINGS PANELS
// ═══════════════════════════════════════════════════════════

export interface RoleWidgetSettingsProps {
  config: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

/** KPI card settings: which metric, and whether to show the period change. */
export const KpiCardSettings = memo(function KpiCardSettings({
  config,
  onChange,
}: RoleWidgetSettingsProps) {
  const metric = (config.metric as KpiMetric | undefined) ?? "total_jobs";
  return (
    <div className="flex flex-col px-4 py-4">
      <label className="mb-1 block text-sm font-medium text-muted-foreground">Metric</label>
      <div className="grid grid-cols-2 gap-1">
        {(Object.keys(KPI_METRIC_LABELS) as KpiMetric[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange({ metric: option, periodRole: KPI_DEFAULT_PERIOD_ROLE[option] })}
            className={`rounded border px-2 py-1.5 text-left text-sm transition-colors ${
              metric === option
                ? "border-primary bg-accent text-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {KPI_METRIC_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <StretchCheckbox
          label="Show change vs previous period"
          checked={Boolean(config.showChange)}
          onChange={(checked) => onChange({ showChange: checked })}
        />
      </div>
    </div>
  );
});

/** Due list settings: which window to show and how many rows. */
export const DueListSettings = memo(function DueListSettings({
  config,
  onChange,
}: RoleWidgetSettingsProps) {
  const merged = { ...DUE_LIST_DEFAULT_CONFIG, ...config } as DueListConfig;
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Show</label>
        <PillToggle
          value={merged.mode}
          options={[
            { value: "overdue", label: "Overdue" },
            { value: "upcoming", label: "Upcoming" },
            { value: "both", label: "Both" },
          ]}
          onChange={(mode) => onChange({ mode })}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Days ahead</label>
        <Input
          type="number"
          min={1}
          max={90}
          value={merged.daysAhead}
          onChange={(e) => onChange({ daysAhead: Number(e.target.value) || 1 })}
          className="h-8 w-24 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Rows</label>
        <Input
          type="number"
          min={1}
          max={100}
          value={merged.limit}
          onChange={(e) => onChange({ limit: Number(e.target.value) || 1 })}
          className="h-8 w-24 text-sm"
        />
      </div>
    </div>
  );
});

/** Jobs table settings: row count and which mapped roles become columns. */
export const JobsTableSettings = memo(function JobsTableSettings({
  config,
  onChange,
}: RoleWidgetSettingsProps) {
  const merged = { ...JOBS_TABLE_DEFAULT_CONFIG, ...config } as JobsTableConfig;
  const selected = merged.columnRoles ?? [];

  const toggle = (role: DashboardRoleKey, checked: boolean) => {
    onChange({
      columnRoles: checked ? [...selected, role] : selected.filter((r) => r !== role),
    });
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Rows</label>
        <Input
          type="number"
          min={1}
          max={200}
          value={merged.limit}
          onChange={(e) => onChange({ limit: Number(e.target.value) || 1 })}
          className="h-8 w-24 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-muted-foreground">Extra columns</label>
        <div className="space-y-1">
          {TABLE_COLUMN_ROLES.map((role) => (
            <StretchCheckbox
              key={role}
              label={ROLE_LABELS[role]}
              checked={selected.includes(role)}
              onChange={(checked) => toggle(role, checked)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

const TABLE_COLUMN_ROLES: DashboardRoleKey[] = ["itemName", "jobType", "owner", "dueDate"];
