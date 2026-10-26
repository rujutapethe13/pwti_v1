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

import { useEffect, useMemo, useState } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import type { ColumnDefinition, ColumnValue } from "../../types";
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
} from "../../connected-data/mirror-format";
import { getConnectedBoardIds, normalizeRecordId, parseConnectedBoardLinks } from "../../connected-data/mirror-utils";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

type MirrorResolutionStatus = "loading" | "ready" | "empty" | "not-found" | "error";
type MirrorFetchResult = { status: "ready" | "not-found"; error?: never } | { status: "error"; error: string };

const mirrorFetches = new Map<string, Promise<MirrorFetchResult>>();
const mirrorFetchCache = new Map<string, MirrorFetchResult>();
const mirrorBoardVersions = new Map<string, number>();

function mirrorFetchKey(boardId: string, recordIds: string[], columnIds: string[]): string {
  const version = mirrorBoardVersions.get(boardId) ?? 0;
  return `${boardId}:v${version}:${[...new Set(recordIds)].sort().join(",")}:${[...new Set(columnIds)].sort().join(",")}`;
}

function retryMirrorFetch(key: string) {
  const boardId = key.split(":")[0];
  mirrorBoardVersions.set(boardId, (mirrorBoardVersions.get(boardId) ?? 0) + 1);
  mirrorFetchCache.delete(key);
  mirrorFetches.delete(key);
}

interface MirrorSettings {
  source_connect_column_id: string | null;
  mirrored_column_id: string | null;
  mirrored_columns: Array<{
    board_id: string;
    column_id: string;
    aggregation: string | null;
    showTitle?: boolean;
  }>;
  display_config: {
    aggregation: string | null;
    display_mode?: string;
    filter_value?: string | null;
    combineAs?: "comma" | "stack" | "count";
    maxVisible?: number;
    showItemName?: boolean;
  };
  combineAs?: "comma" | "stack" | "count";
  maxVisible?: number;
  showItemName?: boolean;
}

function getMirrorSettings(column: ColumnDefinition): MirrorSettings {
  const s = (column.settings ?? {}) as Partial<MirrorSettings>;
  const raw = column.settings as Partial<MirrorSettings> & {
    sourceRelationColumnId?: string;
    items?: MirrorSettings["mirrored_columns"];
  };
  return {
    source_connect_column_id: raw.sourceRelationColumnId ?? s.source_connect_column_id ?? null,
    mirrored_column_id: s.mirrored_column_id ?? null,
    mirrored_columns: (raw.items ?? s.mirrored_columns ?? []) as MirrorSettings["mirrored_columns"],
    display_config: {
      aggregation: s.display_config?.aggregation ?? null,
      display_mode: s.display_config?.display_mode ?? "stacked",
      filter_value: s.display_config?.filter_value ?? null,
    },
    combineAs: raw.combineAs ?? s.display_config?.combineAs ?? "stack",
    maxVisible: raw.maxVisible ?? s.display_config?.maxVisible ?? 3,
    showItemName: raw.showItemName ?? s.display_config?.showItemName ?? false,
  };
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

export function MirrorCellRenderer({
  column,
  recordId,
  boardId,
  onConfigureMirror,
}: CellRendererComponentProps) {
  const store = useMirrorStore();
  const storeVersion = useMirrorStoreSubscription();
  const settings = useMemo(() => getMirrorSettings(column), [column]);

  const sourceCellValue = useMirrorCellValue(
    boardId,
    recordId,
    settings.source_connect_column_id ?? "",
  );
  const sourceBoardId = useMirrorColumn(boardId, settings.source_connect_column_id ?? "");
  const fallbackBoardId = getConnectedBoardIds(sourceBoardId)[0];
  const linkedItems = useMemo(
    () => parseConnectedBoardLinks(sourceCellValue, fallbackBoardId),
    [sourceCellValue, fallbackBoardId],
  );

  // Keep a resolution trace for diagnosing duplicate-looking links and
  // missing source values. This is intentionally limited to development.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !store || !settings.source_connect_column_id) return;
    const linkedBoardRows = new Map(
      linkedItems.map((link) => [link.item_id, store.getRecord(link.board_id, link.item_id)]),
    );
    console.info("[MirrorCellRenderer] resolution", {
      sourceRecordId: recordId,
      rawConnectValue: sourceCellValue,
      linkedItemIds: linkedItems.map((link) => link.item_id),
      sameItemAsFirstRow: linkedItems.map((link) => {
        const firstRow = store.getRecords(boardId)[0];
        const firstValue = firstRow
          ? store.getCellValue(boardId, firstRow.id, settings.source_connect_column_id!)
          : null;
        return {
          itemId: link.item_id,
          same: parseConnectedBoardLinks(firstValue, fallbackBoardId).some(
            (firstLink) => firstLink.board_id === link.board_id && firstLink.item_id === link.item_id,
          ),
        };
      }),
      linkedRows: linkedItems.map((link) => ({
        boardId: link.board_id,
        itemId: link.item_id,
        exists: Boolean(linkedBoardRows.get(link.item_id)),
        sourceValues: settings.mirrored_columns.length > 0
          ? settings.mirrored_columns.map((mc) => ({
              columnId: mc.column_id,
              value: store.getCellValue(link.board_id, link.item_id, mc.column_id),
            }))
          : settings.mirrored_column_id
            ? [{ columnId: settings.mirrored_column_id, value: store.getCellValue(link.board_id, link.item_id, settings.mirrored_column_id) }]
            : [],
      })),
      cacheKeys: linkedItems.map((link) => mirrorFetchKey(
        link.board_id,
        [link.item_id],
        settings.mirrored_columns.length > 0
          ? settings.mirrored_columns.map((mc) => mc.column_id)
          : settings.mirrored_column_id
            ? [settings.mirrored_column_id]
            : [],
      )),
      loading: linkedItems.some((link) => !store.getRecord(link.board_id, link.item_id)),
      fetchPromiseState: linkedItems.map((link) => {
        const key = mirrorFetchKey(
          link.board_id,
          [link.item_id],
          settings.mirrored_columns.map((mc) => mc.column_id),
        );
        return { key, state: mirrorFetches.has(key) ? "pending" : mirrorFetchCache.get(key)?.status ?? "idle" };
      }),
    });
  }, [recordId, sourceCellValue, linkedItems, settings, store, storeVersion]);

  const displayMode = settings.display_config.display_mode ?? "stacked";
  const [resolutionStatus, setResolutionStatus] = useState<MirrorResolutionStatus>(
    linkedItems.length === 0 ? "empty" : "loading",
  );
  const [retryVersion, setRetryVersion] = useState(0);

  const legacyMirroredColumnId = settings.mirrored_column_id;
  const multiConfig = settings.mirrored_columns;

  const sampleBoardId = linkedItems[0]?.board_id ?? "";

  // Look up column definitions (hooks at top level).
  const legacyMirroredColumn = useMirrorColumn(
    legacyMirroredColumnId ? sampleBoardId : "",
    legacyMirroredColumnId || "",
  );
  const sourceColumn = useMirrorColumn(boardId, settings.source_connect_column_id ?? "");

  // Batch-fetch missing cross-board values and column definitions from Supabase.
  useEffect(() => {
    if (!store || linkedItems.length === 0) return;
    const activeStore = store;

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

    const needsFetch = Array.from(boardColumnMap.entries()).some(([bid, columnIds]) =>
      linkedItems.some((link) =>
        link.board_id === bid &&
        (store.getRecord(bid, link.item_id) === undefined ||
          columnIds.some((columnId) => store.getColumn(bid, columnId) === undefined)),
      ),
    );
    if (!needsFetch) {
      setResolutionStatus("ready");
      return;
    }

    let cancelled = false;
    const fetchKeys: string[] = [];
    let completed = false;
    let timedOut = false;

    async function fetchMissing() {
      setResolutionStatus("loading");
      console.warn("[MirrorCellRenderer] mirror fetch started", {
        recordId,
        linkedItems,
        loading: true,
        cacheKeys: fetchKeys,
      });
      try {
        await Promise.all(Array.from(boardColumnMap.entries()).map(async ([bid, columnIds]) => {
          const records = linkedItems.filter((link) => link.board_id === bid);
          if (records.length === 0) return;
          const recordIds = records.map((l) => l.item_id);
          const key = mirrorFetchKey(bid, recordIds, columnIds);
          fetchKeys.push(key);
          let request = mirrorFetches.get(key);
          if (!request) {
            request = (async (): Promise<MirrorFetchResult> => {
              const normalizedIds = recordIds.map((id) => normalizeRecordId(id)).filter((id): id is string => Boolean(id));
              const [{ data: cells, error: cellsError }, { data: rows, error: rowsError }] = await Promise.all([
                supabase.from("cell_values").select("record_id, column_id, value").in("record_id", normalizedIds).in("column_id", columnIds),
                supabase.from("records").select("id, title, board_id, status").in("id", normalizedIds),
              ]);
              if (cellsError || rowsError) {
                return { status: "error", error: cellsError?.message ?? rowsError?.message ?? "Mirror fetch failed" };
              }
              for (const cell of (cells ?? []) as { record_id: string; column_id: string; value: ColumnValue }[]) {
                activeStore.setCellValue(bid, cell.record_id, cell.column_id, cell.value);
              }
              activeStore.syncRecords(bid, (rows ?? []).map((row: { id: string; title: string; board_id: string }) => ({
                id: row.id, title: row.title, organizationId: "", workspaceId: "", boardId: bid,
                groupId: null, status: "active", version: 1, createdAt: "", updatedAt: "",
              })));
              const result: MirrorFetchResult = (rows ?? []).some((row: { id: string }) => normalizedIds.includes(normalizeRecordId(row.id) ?? ""))
                ? { status: "ready" }
                : { status: "not-found" };
              mirrorFetchCache.set(key, result);
              return result;
            })();
            mirrorFetches.set(key, request);
          }
          const result = mirrorFetchCache.get(key) ?? await request;
          if (result.status === "error") throw new Error(result.error);
        }));

        if (boardsNeedingColumns.size > 0) {
          const allNeededIds = new Set<string>();
          for (const bid of boardsNeedingColumns) {
              for (const [b, columnIds] of boardColumnMap) {
                if (b === bid) columnIds.forEach((cid) => allNeededIds.add(cid));
              }
          }
          const { data: colsData, error: columnsError } = await supabase
              .from("columns")
              .select("id,label,type,key,hidden,sort_order,settings")
              .in("id", Array.from(allNeededIds));
          if (columnsError) throw columnsError;
          if (!cancelled && colsData) {
              for (const boardId of boardsNeedingColumns) {
                const merged = new Map(activeStore.getColumns(boardId).map((c) => [c.id, c]));
                for (const c of colsData as Array<{ id: string; label: string; type: string; key: string; hidden: boolean; sort_order: number; settings: Record<string, unknown> }>) {
                  merged.set(c.id, {
                    id: c.id, boardId, key: c.key, label: c.label,
                    type: c.type as ColumnDefinition["type"], required: false,
                    hidden: c.hidden, frozen: false, defaultValue: null,
                    settings: c.settings ?? {}, permissions: { view: [], edit: [], configure: [] },
                    validation: [], version: 1, order: c.sort_order, createdAt: "", updatedAt: "",
                  });
                }
                activeStore.syncColumns(boardId, Array.from(merged.values()));
              }
          }
        }
        completed = true;
        if (!cancelled && !timedOut) {
          setResolutionStatus(
            linkedItems.some((link) => activeStore.getRecord(link.board_id, link.item_id) === undefined)
              ? "not-found"
              : "ready",
          );
          console.warn("[MirrorCellRenderer] mirror fetch resolved", {
            recordId,
            cacheKeys: fetchKeys,
            status: linkedItems.some((link) => activeStore.getRecord(link.board_id, link.item_id) === undefined)
              ? "not-found"
              : "ready",
            loading: false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[MirrorCellRenderer] resolution fetch failed", { fetchKeys, error });
          setResolutionStatus("error");
        }
      } finally {
        if (!cancelled && !completed && !timedOut) setResolutionStatus("error");
      }
    }

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        timedOut = true;
        console.error("[MirrorCellRenderer] resolution timed out", { fetchKeys });
        setResolutionStatus("error");
      }
    }, 10_000);
    void fetchMissing().finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [linkedItems, multiConfig, legacyMirroredColumnId, sampleBoardId, store, retryVersion]);

  // Resolve values for each mirrored column.
  const resolvedColumns = useMemo(() => {
    if (!store) return [];
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
          showTitle: mc.showTitle,
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
          showTitle: true,
          values,
          mirroredColumn: legacyMirroredColumn,
        },
      ];
    }

    return [];
  }, [store, storeVersion, linkedItems, multiConfig, legacyMirroredColumnId, legacyMirroredColumn, sampleBoardId, settings.display_config.aggregation]);

  if (!store) {
    console.warn("[MirrorCellRenderer] missing MirrorDataProvider; rendering empty cell");
    return <span className="text-muted-foreground">—</span>;
  }
  if (resolutionStatus === "error") {
    const retryKey = mirrorFetchKey(
      sampleBoardId,
      linkedItems.map((link) => link.item_id),
      resolvedColumns.map((rc) => rc.column_id),
    );
    return (
      <button
        type="button"
        className="text-amber-600 hover:underline"
        title="Unable to resolve mirrored value"
        onClick={() => { retryMirrorFetch(retryKey); setRetryVersion((version) => version + 1); }}
      >
        Retry
      </button>
    );
  }
  if (settings.source_connect_column_id && store.getColumns(boardId).length > 0 && !sourceColumn) {
    return <span className="text-muted-foreground italic">Source column removed</span>;
  }
  if (!settings.source_connect_column_id || (multiConfig.length === 0 && !legacyMirroredColumnId)) {
    return (
      <button
        type="button"
        className="cursor-pointer text-left text-muted-foreground italic hover:text-foreground hover:underline"
        onClick={(event) => {
          event.stopPropagation();
          onConfigureMirror?.(column);
        }}
      >
        Choose column to mirror
      </button>
    );
  }

  // ── Zero linked items: placeholder, never an error ────────────────
  if (linkedItems.length === 0) {
    return <Placeholder />;
  }
  const hasMissingLinkedItem = linkedItems.some(
    (link) => store.getRecord(link.board_id, link.item_id) === undefined,
  );
  if (resolutionStatus === "loading") {
    return <span className="text-muted-foreground italic">Loading…</span>;
  }
  if (hasMissingLinkedItem || resolutionStatus === "not-found") {
    return <span className="text-destructive italic" title="The linked record no longer exists or is not visible to you">Linked item removed</span>;
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
      const label = rc.mirroredColumn?.label ?? rc.column_id;
      if (settings.combineAs === "count") {
        parts.push(<span key={rc.column_id} className="text-sm">{rawValues.filter((value) => value !== null).length}</span>);
        continue;
      }
      const visibleValues = settings.combineAs === "comma" ? [rawValues.filter((value) => value !== null).join(", ")] : rawValues;
      const result = aggregateValues(visibleValues, settings.combineAs === "comma" ? "list" : effectiveMode, settings.display_config.filter_value ?? null);
      parts.push(
        <span key={rc.column_id} className="contents">
          {rc.mirroredColumn && rc.showTitle !== false && <span className="text-xs font-medium text-muted-foreground">{label}:</span>}
          <span className="text-sm">
            <FormattedValue value={result.display} column={rc.mirroredColumn} />
          </span>
        </span>,
      );
    }
    return (
      <div title="Edit this in the source board" className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5", "opacity-80 italic")}>
        {parts}
      </div>
    );
  }

  // ── Single column display ────────────────────────────────────
  const rc = resolvedColumns[0];
  if (!rc) {
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
      return <Placeholder />;
    }
    return (
      <div className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
        <FormattedValue value={single} column={rc.mirroredColumn} />
      </div>
    );
  }

  // Multiple linked items: aggregate.
  const result = aggregateValues(rawValues, effectiveMode, settings.display_config.filter_value ?? null);
  return (
    <div className={cn("flex items-center gap-1.5", "opacity-80 italic")}>
      <span className="text-sm">{formatAggregationDisplay(result.display)}</span>
      <span className="text-xs text-muted-foreground/70">({result.detail})</span>
    </div>
  );
}
