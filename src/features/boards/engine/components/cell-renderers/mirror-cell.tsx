"use client";

/**
 * Mirror Cell Renderer — read path + editable write-through
 *
 * A Mirror column never stores a value. On every render it:
 *   1. Reads `linked_item_ids` from the source Connect Boards cell
 *      (source_connect_column_id) on the SAME record.
 *   2. For each linked item, reads the live value of each configured mirrored
 *      column from the connected board via the MirrorStore (cross-board).
 *   3. If values are missing from the store, batch-fetches them from Supabase
 *      and caches them in the store for subsequent renders.
 *   4. Formats values exactly as they appear on the source board.
 *   5. For multiple linked items, aggregates per column type.
 *   6. For multiple mirrored columns, displays them as stacked "Label: value"
 *      pairs.
 *   7. Shows a placeholder when there are zero linked items.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import type { CellRendererComponentProps } from "./cell-renderer-registry";
import type { ColumnDefinition, ColumnValue, ConnectedBoardLinkItem } from "../../types";
import {
  useMirrorStore,
  useMirrorCellValue,
  useMirrorColumn,
  useMirrorStoreSubscription,
} from "../../connected-data/mirror-data-context";
import {
  aggregateValues,
  defaultAggregationForType,
  isTextAggregation,
  toNumber,
} from "../../connected-data/mirror-format";
import { updateCell } from "../../actions/cell-actions";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

interface MirrorSettings {
  source_connect_column_id: string | null;
  mirrored_column_id: string | null;
  mirrored_columns: Array<{
    board_id: string;
    column_id: string;
    aggregation: string | null;
  }>;
  display_config: { aggregation: string | null; display_mode?: string; filter_value?: string | null };
}

function getMirrorSettings(column: ColumnDefinition): MirrorSettings {
  const s = (column.settings ?? {}) as Partial<MirrorSettings>;
  return {
    source_connect_column_id: s.source_connect_column_id ?? null,
    mirrored_column_id: s.mirrored_column_id ?? null,
    mirrored_columns: (s.mirrored_columns ?? []) as MirrorSettings["mirrored_columns"],
    display_config: {
      aggregation: s.display_config?.aggregation ?? null,
      display_mode: s.display_config?.display_mode ?? "stacked",
      filter_value: s.display_config?.filter_value ?? null,
    },
  };
}

function isLinkItem(v: unknown): v is ConnectedBoardLinkItem {
  return typeof v === "object" && v !== null && "board_id" in v && "item_id" in v;
}

function readLinkedItems(value: ColumnValue): ConnectedBoardLinkItem[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const arr = (value as { linked_item_ids?: unknown }).linked_item_ids;
    if (Array.isArray(arr)) return arr.filter(isLinkItem);
  }
  return [];
}

function isTextLike(type: ColumnDefinition["type"] | undefined): boolean {
  return (
    type === "text" ||
    type === "long_text" ||
    type === "status" ||
    type === "priority" ||
    type === "dropdown" ||
    type === "person" ||
    type === "multi_select" ||
    type === "tags"
  );
}

function FormattedValue({ value, column }: { value: ColumnValue; column?: ColumnDefinition }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  const type = column?.type;
  const options = (
    (column?.settings ?? {}) as { options?: Array<{ id: string; label: string; color?: string }> }
  ).options ?? [];

  if (type === "status" || type === "priority" || type === "dropdown") {
    const raw = typeof value === "string" ? value : String(value);
    const matched =
      options.find((o) => o.id === raw) ?? options.find((o) => o.label === raw);
    const label = matched?.label ?? raw;
    const color = matched?.color;
    if (color) {
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: color, color: contrastColor(color) }}
        >
          {label}
        </span>
      );
    }
    return <span className="text-sm">{label}</span>;
  }

  if (type === "number" || type === "currency" || type === "rating" || type === "progress") {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) return <span className="text-sm">{String(value)}</span>;
    return <span className="text-sm tabular-nums">{formatNumber(n, type === "currency")}</span>;
  }

  if (type === "date" || type === "timeline") {
    return <span className="text-sm tabular-nums">{String(value)}</span>;
  }

  return (
    <span className="text-sm">{typeof value === "string" ? value : JSON.stringify(value)}</span>
  );
}

function formatNumber(n: number, currency: boolean): string {
  if (currency) {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function contrastColor(hex?: string): string {
  if (!hex) return "#1f2937";
  const c = hex.replace("#", "").trim();
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  if (full.length !== 6) return "#1f2937";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#1f2937";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

function Placeholder() {
  return <span className="text-muted-foreground italic">—</span>;
}

function formatAggregationDisplay(display: ColumnValue): string {
  if (display === null || display === undefined) return "—";
  if (typeof display === "number") {
    return display.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(display);
}

function EditableMirrorValue({
  value,
  resolved,
  settings,
  organizationId,
  workspaceId,
  mirroredColumn,
}: {
  value: ColumnValue;
  resolved: { link: ConnectedBoardLinkItem; value: ColumnValue }[];
  settings: MirrorSettings;
  organizationId: string;
  workspaceId: string;
  mirroredColumn?: ColumnDefinition;
}) {
  const store = useMirrorStore();
  const [editing, setEditing] = useState(false);

  const handleChange = useCallback(
    (next: ColumnValue) => {
      const target = resolved[0];
      const colId = settings.mirrored_column_id!;
      store.setCellValue(target.link.board_id, target.link.item_id, colId, next);
      void updateCell(
        organizationId,
        workspaceId,
        target.link.board_id,
        target.link.item_id,
        colId,
        next,
      );
    },
    [store, resolved, settings.mirrored_column_id, organizationId, workspaceId],
  );

  const handleCommit = useCallback(() => {
    setEditing(false);
  }, []);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn("flex items-center gap-1.5 text-left", "opacity-80 italic")}
        title="Mirror of another cell — click to edit the source"
      >
        <FormattedValue value={value} column={mirroredColumn} />
        <Pencil className="size-3 shrink-0 text-muted-foreground/60" />
      </button>
    );
  }

  const type = mirroredColumn?.type;

  if (type === "number" || type === "currency" || type === "rating" || type === "progress") {
    const numValue = typeof value === "number" ? value : toNumber(value);
    return (
      <span className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
        <input
          type="number"
          autoFocus
          value={Number.isNaN(numValue) ? "" : numValue}
          onChange={(e) => {
            const raw = e.target.value;
            handleChange(raw === "" ? null : Number(raw));
          }}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCommit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-full border-0 bg-transparent px-2 text-sm tabular-nums shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        />
      </span>
    );
  }

  if (type === "date" || type === "timeline") {
    return (
      <span className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
        <input
          type="date"
          autoFocus
          value={typeof value === "string" ? value : ""}
          onChange={(e) => handleChange(e.target.value || null)}
          onBlur={handleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") handleCommit();
          }}
          className="h-7 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        />
      </span>
    );
  }

  return (
    <span className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
      <input
        type="text"
        autoFocus
        value={typeof value === "string" ? value : value === null ? "" : String(value)}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCommit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      />
    </span>
  );
}

export function MirrorCellRenderer({
  value,
  column,
  recordId,
  boardId,
  organizationId,
  workspaceId,
  readOnly,
  onChange,
}: CellRendererComponentProps) {
  const store = useMirrorStore();
  const settings = getMirrorSettings(column);

  const storeVersion = useMirrorStoreSubscription();

  const sourceCellValue = useMirrorCellValue(
    boardId,
    recordId,
    settings.source_connect_column_id ?? "",
  );
  const linkedItems = useMemo(() => readLinkedItems(sourceCellValue), [sourceCellValue]);

  const displayMode = settings.display_config.display_mode ?? "stacked";

  const legacyMirroredColumnId = settings.mirrored_column_id;
  const multiConfig = settings.mirrored_columns;

  const sampleBoardId = linkedItems[0]?.board_id ?? "";

  // Look up column definitions (hooks at top level).
  const legacyMirroredColumn = useMirrorColumn(
    legacyMirroredColumnId ? sampleBoardId : "",
    legacyMirroredColumnId || "",
  );

  // Batch-fetch missing cross-board values and column definitions from Supabase.
  useEffect(() => {
    if (linkedItems.length === 0) return;

    const allColumnIds = new Set<string>();
    const boardColumnMap = new Map<string, string[]>();
    const boardsNeedingColumns = new Set<string>();

    if (multiConfig.length > 0) {
      for (const mc of multiConfig) {
        allColumnIds.add(mc.column_id);
        const bid = mc.board_id || sampleBoardId;
        if (!boardColumnMap.has(bid)) boardColumnMap.set(bid, []);
        boardColumnMap.get(bid)!.push(mc.column_id);
        if (!store.getColumn(bid, mc.column_id)) boardsNeedingColumns.add(bid);
      }
    } else if (legacyMirroredColumnId) {
      allColumnIds.add(legacyMirroredColumnId);
      const bid = sampleBoardId;
      if (!boardColumnMap.has(bid)) boardColumnMap.set(bid, []);
      boardColumnMap.get(bid)!.push(legacyMirroredColumnId);
      if (!store.getColumn(bid, legacyMirroredColumnId)) boardsNeedingColumns.add(bid);
    }

    if (allColumnIds.size === 0) return;

    let cancelled = false;

    async function fetchMissing() {
      for (const [bid, columnIds] of boardColumnMap) {
        const missingRecords = linkedItems.filter(
          (link) => link.board_id === bid && store.getCellValue(link.board_id, link.item_id, columnIds[0]) === null,
        );
        if (missingRecords.length > 0) {
          const recordIds = missingRecords.map((l) => l.item_id);
          const { data } = await supabase
            .from("cell_values")
            .select("record_id, column_id, value")
            .eq("board_id", bid)
            .in("record_id", recordIds)
            .in("column_id", columnIds);

          if (cancelled || !data) continue;

          for (const cell of data as { record_id: string; column_id: string; value: ColumnValue }[]) {
            store.setCellValue(bid, cell.record_id, cell.column_id, cell.value);
          }
        }
      }

      if (boardsNeedingColumns.size > 0) {
        const allNeededIds = new Set<string>();
        for (const bid of boardsNeedingColumns) {
          for (const [b, columnIds] of boardColumnMap) {
            if (b === bid) {
              for (const cid of columnIds) allNeededIds.add(cid);
            }
          }
        }
        const { data: colsData } = await supabase
          .from("columns")
          .select("id,label,type,key,hidden,sort_order,settings")
          .in("id", Array.from(allNeededIds));

        if (!cancelled && colsData) {
          const columns = (colsData as Array<{ id: string; label: string; type: string; key: string; hidden: boolean; sort_order: number; settings: Record<string, unknown> }>);
          for (const boardId of boardsNeedingColumns) {
            const existing = store.getColumns(boardId);
            const merged = new Map<string, ColumnDefinition>();
            for (const c of existing) merged.set(c.id, c);
            for (const c of columns) {
              if (allNeededIds.has(c.id)) {
                merged.set(c.id, {
                  id: c.id,
                  boardId: boardId,
                  key: c.key,
                  label: c.label,
                  type: c.type as ColumnDefinition["type"],
                  required: false,
                  hidden: c.hidden,
                  frozen: false,
                  defaultValue: null,
                  settings: c.settings ?? {},
                  permissions: { view: [], edit: [], configure: [] },
                  validation: [],
                  version: 1,
                  order: c.sort_order,
                  createdAt: "",
                  updatedAt: "",
                });
              }
            }
            store.syncColumns(boardId, Array.from(merged.values()));
          }
        }
      }
    }

    void fetchMissing();
    return () => {
      cancelled = true;
    };
  }, [linkedItems, multiConfig, legacyMirroredColumnId, sampleBoardId, store]);

  // Resolve values for each mirrored column.
  const resolvedColumns = useMemo(() => {
    if (multiConfig.length > 0) {
      return multiConfig.map((mc) => {
        const bid = mc.board_id || sampleBoardId;
        const values = linkedItems.map((link) => ({
          link,
          value: store.getCellValue(link.board_id, link.item_id, mc.column_id),
        }));
        const mirroredColumn = store.getColumn(bid, mc.column_id);
        return {
          board_id: mc.board_id,
          column_id: mc.column_id,
          aggregation: mc.aggregation,
          values,
          mirroredColumn,
        };
      });
    }

    if (legacyMirroredColumnId) {
      const values = linkedItems.map((link) => ({
        link,
        value: store.getCellValue(link.board_id, link.item_id, legacyMirroredColumnId!),
      }));
      return [
        {
          board_id: sampleBoardId,
          column_id: legacyMirroredColumnId,
          aggregation: settings.display_config.aggregation,
          values,
          mirroredColumn: legacyMirroredColumn,
        },
      ];
    }

    return [];
  }, [store, linkedItems, multiConfig, legacyMirroredColumnId, legacyMirroredColumn, sampleBoardId, settings.display_config.aggregation, storeVersion]);

  // Editable only when exactly one linked item AND one mirrored column.
  const isEditable =
    !readOnly &&
    resolvedColumns.length === 1 &&
    resolvedColumns[0].values.length === 1 &&
    !!resolvedColumns[0].column_id &&
    !!resolvedColumns[0].board_id;

  // ── Zero linked items: placeholder, never an error ────────────────
  if (linkedItems.length === 0) {
    if (value !== null) onChange?.(null);
    return <Placeholder />;
  }

  // ── Multi-column stacked display ──────────────────────────────
  if (resolvedColumns.length > 1 || displayMode === "stacked") {
    const parts: React.ReactNode[] = [];
    for (const rc of resolvedColumns) {
      const rawValues = rc.values.map((r) => r.value);
      const mode = rc.aggregation ?? defaultAggregationForType(rc.mirroredColumn?.type) ?? "list";
      const effectiveMode =
        rc.mirroredColumn && isTextLike(rc.mirroredColumn.type) && !isTextAggregation(mode)
          ? "list"
          : mode;
      const result = aggregateValues(rawValues, effectiveMode, settings.display_config.filter_value ?? null);
      const label = rc.mirroredColumn?.label ?? rc.column_id;
      parts.push(
        <span key={rc.column_id} className="contents">
          <span className="text-xs font-medium text-muted-foreground">{label}:</span>
          <span className="text-sm">
            <FormattedValue value={result.display} column={rc.mirroredColumn} />
          </span>
        </span>,
      );
    }
    if (value !== null) onChange?.(null);
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5", "opacity-80 italic")}>
        {parts}
      </div>
    );
  }

  // ── Single column display ────────────────────────────────────
  const rc = resolvedColumns[0];
  if (!rc) {
    if (value !== null) onChange?.(null);
    return <Placeholder />;
  }

  const rawValues = rc.values.map((r) => r.value);
  const mode = rc.aggregation ?? defaultAggregationForType(rc.mirroredColumn?.type) ?? "list";
  const effectiveMode =
    rc.mirroredColumn && isTextLike(rc.mirroredColumn.type) && !isTextAggregation(mode)
      ? "list"
      : mode;

  if (rc.values.length === 1) {
    const single = rc.values[0].value;
    if (single === null || single === undefined) {
      if (value !== null) onChange?.(null);
      return <Placeholder />;
    }
    if (isEditable) {
      return (
        <EditableMirrorValue
          value={single}
          resolved={rc.values}
          settings={settings}
          organizationId={organizationId}
          workspaceId={workspaceId}
          mirroredColumn={rc.mirroredColumn}
        />
      );
    }
    return (
      <div className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
        <FormattedValue value={single} column={rc.mirroredColumn} />
      </div>
    );
  }

  // Multiple linked items: aggregate.
  const result = aggregateValues(rawValues, effectiveMode, settings.display_config.filter_value ?? null);
  if (value !== null) onChange?.(null);
  return (
    <div className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
      <span className="text-sm">{formatAggregationDisplay(result.display)}</span>
      <span className="text-xs text-muted-foreground/70">({result.detail})</span>
    </div>
  );
}
