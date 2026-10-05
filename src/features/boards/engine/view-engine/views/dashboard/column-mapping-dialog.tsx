"use client";

/**
 * Dashboard — "Map your columns" step
 *
 * A one-time, per-board mapping of column roles (Client, Received date, …) to
 * real columns. Shown automatically the first time a Dashboard view opens on a
 * board, and re-openable at any time from the dashboard toolbar or from any
 * widget whose role is unmapped.
 *
 * Auto-suggested from header names; every suggestion is editable.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { Check, Link2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColumnDefinition } from "../../../types";
import { createRecordTitleColumn } from "./dashboard-types";
import { SearchableColumnSelect } from "./dashboard-shared";
import {
  RECORD_TITLE_COLUMN_ID,
  ROLE_DEFINITIONS,
  STATUS_BUCKETS,
  classifyStatusValue,
  clientGroupKey,
  isColumnCompatibleWithRole,
  normalizeText,
  suggestRoleMapping,
  type ClientAliasMap,
  type DashboardColumnRoles,
  type StatusBucketMap,
} from "./column-roles";

export interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDefinition[];
  roles: DashboardColumnRoles;
  statusBuckets: StatusBucketMap;
  clientAliases: ClientAliasMap;
  /** Distinct status cell values on this board, used to seed the bucket map. */
  statusValues: string[];
  /** Distinct client cell values on this board, used to seed merge aliases. */
  clientValues: string[];
  onSave: (next: {
    roles: DashboardColumnRoles;
    statusBuckets: StatusBucketMap;
    clientAliases: ClientAliasMap;
  }) => void;
  /**
   * Distinct values of the board's first column ("Name"), used to decide
   * whether it reads as the client or as a per-row item name.
   */
  nameValues?: string[];
  /** Roles to scroll to / emphasise, e.g. clicked from a "Map a column" button. */
  focusRole?: string | null;
}

interface AliasRow {
  id: string;
  alias: string;
  main: string;
}

let aliasRowSeq = 0;
const nextAliasRowId = () => `alias-${++aliasRowSeq}`;

function rolesToAliasRows(aliases: ClientAliasMap): AliasRow[] {
  return Object.entries(aliases).map(([alias, main]) => ({
    id: nextAliasRowId(),
    alias,
    main,
  }));
}

function aliasRowsToMap(rows: AliasRow[]): ClientAliasMap {
  const out: ClientAliasMap = {};
  for (const row of rows) {
    const alias = normalizeText(row.alias).toUpperCase();
    const main = normalizeText(row.main).toUpperCase();
    if (alias && main && alias !== main) out[alias] = main;
  }
  return out;
}

function buildStatusBuckets(values: string[], previous: StatusBucketMap): StatusBucketMap {
  const out: StatusBucketMap = {};
  for (const value of values) {
    if (previous[value]) {
      out[value] = previous[value];
      continue;
    }
    out[value] = previous[value] ?? classifyStatusValue(value);
  }
  return out;
}

export const ColumnMappingDialog = memo(function ColumnMappingDialog({
  open,
  onOpenChange,
  columns,
  roles,
  statusBuckets,
  clientAliases,
  statusValues,
  clientValues,
  onSave,
  nameValues,
  focusRole,
}: ColumnMappingDialogProps) {
  /**
   * The board's built-in first column is offered for every text-compatible
   * role, labelled so it is easy to find among the real columns.
   */
  const allColumns = useMemo(
    () => [{ ...createRecordTitleColumn(), label: "Name (first column)" }, ...columns],
    [columns],
  );

  /** How repetitive the Name column is: few distinct values over many rows. */
  const nameDistinctRatio = useMemo(() => {
    if (!nameValues || nameValues.length === 0) return null;
    const distinct = new Set(
      nameValues.map((v) => normalizeText(v).toUpperCase()).filter(Boolean),
    );
    return distinct.size / nameValues.length;
  }, [nameValues]);

  const suggested = useMemo(
    () =>
      suggestRoleMapping(allColumns, {
        nameColumnId: RECORD_TITLE_COLUMN_ID,
        nameDistinctRatio,
      }),
    [allColumns, nameDistinctRatio],
  );

  const [draftRoles, setDraftRoles] = useState<DashboardColumnRoles>(roles);
  const [draftBuckets, setDraftBuckets] = useState<StatusBucketMap>(statusBuckets);
  const [aliasRows, setAliasRows] = useState<AliasRow[]>(() => rolesToAliasRows(clientAliases));
  const [applySuggestions, setApplySuggestions] = useState(false);

  // Re-seed the draft whenever the dialog opens so a cancel discards edits.
  useEffect(() => {
    if (!open) return;
    setDraftRoles(roles);
    setDraftBuckets(statusBuckets);
    setAliasRows(rolesToAliasRows(clientAliases));
    setApplySuggestions(false);
  }, [open, roles, statusBuckets, clientAliases]);

  // Auto-suggest on first open only: after that the user's choices win.
  useEffect(() => {
    if (open && applySuggestions) {
      setDraftRoles(suggested);
      setApplySuggestions(false);
    }
  }, [open, applySuggestions, suggested]);

  const effectiveBuckets = useMemo(
    () => buildStatusBuckets(statusValues, draftBuckets),
    [statusValues, draftBuckets],
  );

  const mappedCount = useMemo(
    () => ROLE_DEFINITIONS.filter((r) => Boolean(draftRoles[r.key])).length,
    [draftRoles],
  );

  /** Client spellings that collapse to the same grouping key under case-folding. */
  const clientCollisions = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const value of clientValues) {
      const key = clientGroupKey(value);
      if (!key) continue;
      const bucket = byKey.get(key) ?? [];
      bucket.push(normalizeText(value));
      byKey.set(key, bucket);
    }
    const out: Array<{ key: string; variants: string[] }> = [];
    for (const [key, variants] of byKey) {
      const distinct = Array.from(new Set(variants));
      if (distinct.length > 1) out.push({ key, variants: distinct });
    }
    return out.sort((a, b) => b.variants.length - a.variants.length);
  }, [clientValues]);

  const applySuggestedAliases = () => {
    const rows = aliasRowsToMap(aliasRows);
    for (const { variants } of clientCollisions) {
      // First spelling is the canonical one; fold the rest into it.
      const canonical = variants[0].toUpperCase();
      for (const variant of variants.slice(1)) {
        const alias = variant.toUpperCase();
        if (alias !== canonical) rows[alias] = canonical;
      }
    }
    setAliasRows(rolesToAliasRows(rows));
  };

  const save = () => {
    onSave({
      roles: draftRoles,
      statusBuckets: effectiveBuckets,
      clientAliases: aliasRowsToMap(aliasRows),
    });
    onOpenChange(false);
  };

  const hasStatusColumn = Boolean(draftRoles.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map your columns</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tell the dashboard what each column means. We suggested matches from your column names —
            change anything that is wrong. Unmapped roles simply hide their widgets.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {mappedCount} of {ROLE_DEFINITIONS.length} roles mapped
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-sm"
              onClick={() => setApplySuggestions(true)}
            >
              <Sparkles className="size-3.5" />
              Auto-suggest
            </Button>
          </div>

          <div className="space-y-2">
            {ROLE_DEFINITIONS.map((role) => (
              <div
                key={role.key}
                className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 rounded px-1 py-0.5 ${
                  focusRole === role.key ? "bg-accent" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                    {role.label}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-xs text-muted-foreground">?</span>
                      </TooltipTrigger>
                      <TooltipContent side="top">{role.description}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{role.description}</div>
                </div>
                <SearchableColumnSelect
                  columns={allColumns}
                  value={draftRoles[role.key] ?? ""}
                  placeholder="Not mapped"
                  includeBlank
                  blankLabel="Not mapped"
                  filter={(col) => isColumnCompatibleWithRole(col, role.key)}
                  onChange={(columnId) =>
                    setDraftRoles((prev) => {
                      const next = { ...prev };
                      if (columnId) next[role.key] = columnId;
                      else delete next[role.key];
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>

          {hasStatusColumn && statusValues.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <div className="mb-2">
                <h3 className="text-sm font-medium text-foreground">Map status values to buckets</h3>
                <p className="text-xs text-muted-foreground">
                  Every distinct value in the status column is assigned to one of the four buckets.
                </p>
              </div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {statusValues.map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{value}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {STATUS_BUCKETS.map((bucket) => {
                        const active = effectiveBuckets[value] === bucket.value;
                        return (
                          <button
                            key={bucket.value}
                            type="button"
                            onClick={() =>
                              setDraftBuckets((prev) => ({ ...prev, [value]: bucket.value }))
                            }
                            className={`rounded px-2 py-1 text-xs transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {bucket.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">Merge clients</h3>
                <p className="text-xs text-muted-foreground">
                  Client names are grouped case-insensitively. Add an alias when two genuinely different
                  spellings mean the same client.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {clientCollisions.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-sm" onClick={applySuggestedAliases}>
                    <Link2 className="size-3.5" />
                    Fold {clientCollisions.length}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-sm"
                  onClick={() => setAliasRows((prev) => [...prev, { id: nextAliasRowId(), alias: "", main: "" }])}
                >
                  Add alias
                </Button>
              </div>
            </div>

            {clientCollisions.length > 0 && (
              <p className="mb-2 text-xs text-muted-foreground">
                {clientCollisions
                  .slice(0, 3)
                  .map((c) => `${c.variants.join(" / ")}`)
                  .join(" · ")}
                {clientCollisions.length > 3 ? " · …" : ""}
              </p>
            )}

            {aliasRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No aliases. Names are grouped as-is.</p>
            ) : (
              <div className="space-y-1.5">
                {aliasRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.alias}
                      placeholder="Alias (e.g. SAFARI TRADE)"
                      className="h-8 flex-1 text-sm"
                      onChange={(e) =>
                        setAliasRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, alias: e.target.value } : r)),
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      value={row.main}
                      placeholder="Main client"
                      className="h-8 flex-1 text-sm"
                      onChange={(e) =>
                        setAliasRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, main: e.target.value } : r)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-sm text-muted-foreground hover:text-destructive"
                      onClick={() => setAliasRows((prev) => prev.filter((r) => r.id !== row.id))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>
            <Check className="mr-1.5 size-4" />
            Save mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
ColumnMappingDialog.displayName = "ColumnMappingDialog";
