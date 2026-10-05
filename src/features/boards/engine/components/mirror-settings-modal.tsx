"use client";

/**
 * Mirror Settings Modal (shared settings step)
 *
 * Used by BOTH creation entry points:
 *   - Manual flow: opened from the "+" add-column picker after "Mirror" is
 *     selected. No `sourceConnectColumnId` is provided, so the user must first
 *     pick which Connect Boards column this mirror rides on.
 *   - Prompted flow: opened right after a user links an item via a Connect
 *     Boards cell. `sourceConnectColumnId` is pre-filled with that column.
 *
 * Shared step body:
 *   1. (manual) Choose a Connect Boards column on this board.
 *   2. Show the connected board(s) for the chosen source column.
 *   3. Searchable checkbox list of columns to mirror, grouped by connected
 *      board name. Each selected column gets its own aggregation setting.
 *   4. Confirm → save source_connect_column_id + mirrored_columns +
 *      display_config to column.settings.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, Search, Table2, X } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import type { ColumnDefinition, MirrorColumnSettings } from "../types";
import {
  getConnectBoardColumns,
  getConnectedBoardIds,
  getConnectedBoardEntries,
  computeMirrorableColumns,
  type ConnectedBoardColumns,
} from "../connected-data/mirror-utils";
import { isMirrorableSourceColumn } from "../connected-data/mirror-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BoardColumnRow {
  id: string;
  label: string;
  type: string;
  key: string;
  hidden: boolean;
  sort_order: number;
}

interface MirroredColumnConfig {
  board_id: string;
  column_id: string;
  column_label: string;
  column_type: string;
  aggregation: string | null;
}

export interface MirrorSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  columns: ColumnDefinition[];
  sourceConnectColumnId?: string | null;
  onConfirm: (settings: MirrorColumnSettings) => void;
}

export function MirrorSettingsModal({
  open,
  onOpenChange,
  boardId: _boardId,
  columns,
  sourceConnectColumnId,
  onConfirm,
}: MirrorSettingsModalProps) {
  const connectBoardColumns = useMemo(() => getConnectBoardColumns(columns), [columns]);

  const [sourceColumnId, setSourceColumnId] = useState<string>("");
  const [selectedColumns, setSelectedColumns] = useState<MirroredColumnConfig[]>([]);
  const [boardColumnMap, setBoardColumnMap] = useState<Map<string, BoardColumnRow[]>>(new Map());
  const [boardNames, setBoardNames] = useState<Map<string, string>>(new Map());
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [columnQuery, setColumnQuery] = useState("");

  // Pre-fill the source column for the prompted flow.
  useEffect(() => {
    if (open && sourceConnectColumnId) {
      setSourceColumnId(sourceConnectColumnId);
    }
  }, [open, sourceConnectColumnId]);

  const sourceColumn = useMemo(
    () => connectBoardColumns.find((c) => c.id === sourceColumnId),
    [connectBoardColumns, sourceColumnId],
  );

  const connectedBoardEntries = useMemo(() => getConnectedBoardEntries(sourceColumn), [sourceColumn]);
  const connectedBoardIds = useMemo(() => connectedBoardEntries.map((e) => e.board_id), [connectedBoardEntries]);

  // Fetch board names for connected boards.
  useEffect(() => {
    if (!open) return;
    const ids = connectedBoardIds;
    if (ids.length === 0) {
      setBoardNames(new Map());
      return;
    }
    let cancelled = false;
    supabase
      .from("boards")
      .select("id, name")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = new Map<string, string>();
        for (const b of data as { id: string; name: string }[]) {
          map.set(b.id, b.name);
        }
        setBoardNames(map);
      });
    return () => {
      cancelled = true;
    };
  }, [open, connectedBoardIds]);

  // Fetch columns for each connected board.
  useEffect(() => {
    if (!open) return;
    const targetBoards = connectedBoardIds;
    if (targetBoards.length === 0) {
      setBoardColumnMap(new Map());
      setLoadingColumns(false);
      return;
    }

    let cancelled = false;
    setLoadingColumns(true);

    Promise.all(
      targetBoards.map(async (bid) => {
        const { data } = await supabase
          .from("columns")
          .select("id,label,type,key,hidden,sort_order")
          .eq("board_id", bid)
          .order("sort_order", { ascending: true });
        return { boardId: bid, columns: (data ?? []) as BoardColumnRow[] };
      }),
    ).then((results) => {
      if (cancelled) return;
      const map = new Map<string, BoardColumnRow[]>();
      for (const r of results) {
        map.set(
          r.boardId,
          (r.columns ?? []).filter((c) => c.hidden !== true),
        );
      }
      setBoardColumnMap(map);
      setLoadingColumns(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, connectedBoardIds]);

  // Build grouped column list grouped by board.
  const groupedColumns = useMemo(() => {
    const result: Array<{ board_id: string; board_name: string; columns: BoardColumnRow[] }> = [];
    for (const entry of connectedBoardEntries) {
      const cols = (boardColumnMap.get(entry.board_id) ?? []).filter(isMirrorableSourceColumn);
      result.push({
        board_id: entry.board_id,
        board_name: boardNames.get(entry.board_id) ?? entry.board_id,
        columns: cols,
      });
    }
    return result;
  }, [connectedBoardEntries, boardColumnMap, boardNames]);

  // Filter columns by search query.
  const filteredGroups = useMemo(() => {
    const q = columnQuery.toLowerCase().trim();
    if (!q) return groupedColumns;
    return groupedColumns
      .map((g) => ({
        ...g,
        columns: g.columns.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.type.toLowerCase().includes(q) ||
            g.board_name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.columns.length > 0);
  }, [groupedColumns, columnQuery]);

  const toggleColumn = (boardId: string, column: BoardColumnRow) => {
    setSelectedColumns((prev) => {
      const idx = prev.findIndex((c) => c.board_id === boardId && c.column_id === column.id);
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [
        ...prev,
        {
          board_id: boardId,
          column_id: column.id,
          column_label: column.label,
          column_type: column.type,
          aggregation: null,
        },
      ];
    });
  };

  const updateAggregation = (boardId: string, columnId: string, aggregation: string | null) => {
    setSelectedColumns((prev) =>
      prev.map((c) =>
        c.board_id === boardId && c.column_id === columnId ? { ...c, aggregation } : c,
      ),
    );
  };

  const isSelected = (boardId: string, columnId: string) =>
    selectedColumns.some((c) => c.board_id === boardId && c.column_id === columnId);

  const getSelectedAggregation = (boardId: string, columnId: string) =>
    selectedColumns.find((c) => c.board_id === boardId && c.column_id === columnId)?.aggregation ?? null;

  const canConfirm = sourceColumnId && selectedColumns.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      source_connect_column_id: sourceColumnId,
      mirrored_column_id: null,
      mirrored_columns: selectedColumns.map((c) => ({
        board_id: c.board_id,
        column_id: c.column_id,
        aggregation: c.aggregation,
      })),
      display_config: { aggregation: null },
    });
    onOpenChange(false);
  };

  const reset = () => {
    setSourceColumnId("");
    setSelectedColumns([]);
    setBoardColumnMap(new Map());
    setBoardNames(new Map());
    setColumnQuery("");
    setLoadingColumns(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="size-4" />
            Mirror column
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 — Connect Boards column */}
          <div className="space-y-1.5">
            <label htmlFor="mirror-source-column" className="text-xs font-medium text-muted-foreground">
              Connect Boards column
            </label>
            <select
              id="mirror-source-column"
              value={sourceColumnId}
              onChange={(e) => {
                setSourceColumnId(e.target.value);
                setSelectedColumns([]);
                setColumnQuery("");
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="" disabled>
                {connectBoardColumns.length === 0
                  ? "No Connect Boards columns on this board"
                  : "Choose a Connect Boards column…"}
              </option>
              {connectBoardColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {sourceColumn && (
              <p className="text-xs text-muted-foreground">
                Pre-filled from the linked item&apos;s column.
              </p>
            )}
          </div>

          {/* Step 2 — Connected board(s) */}
          {sourceColumn && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Connected board{connectedBoardIds.length !== 1 ? "s" : ""}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {connectedBoardIds.length === 0 ? (
                  <span className="text-sm text-muted-foreground italic">
                    This Connect Boards column links to no boards.
                  </span>
                ) : (
                  connectedBoardEntries.map((entry) => (
                    <span
                      key={entry.board_id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      <Link2 className="size-3" />
                      {boardNames.get(entry.board_id) ?? entry.board_id}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 3 — Columns to mirror (multi-select, grouped by board) */}
          {sourceColumn && connectedBoardIds.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Columns to mirror
              </label>

              {/* Selected columns chips */}
              {selectedColumns.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedColumns.map((sc) => (
                    <Badge
                      key={`${sc.board_id}:${sc.column_id}`}
                      variant="secondary"
                      className="flex items-center gap-1 text-xs"
                    >
                      <span className="max-w-[140px] truncate">
                        {boardNames.get(sc.board_id) ?? sc.board_id} · {sc.column_label}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleColumn(sc.board_id, { id: sc.column_id, label: sc.column_label, type: sc.column_type, key: "", hidden: false, sort_order: 0 })}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search columns..."
                  value={columnQuery}
                  onChange={(e) => setColumnQuery(e.target.value)}
                  className="pl-8"
                />
              </div>

              {/* Checkbox list grouped by board */}
              <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-border p-1">
                {loadingColumns ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading columns from connected boards…
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground italic">
                    No columns found.
                  </p>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.board_id}>
                      <p className="px-2 pt-1 pb-1 text-xs font-medium uppercase text-muted-foreground">
                        {group.board_name}
                      </p>
                      {group.columns.map((col) => {
                        const selected = isSelected(group.board_id, col.id);
                        const agg = getSelectedAggregation(group.board_id, col.id);
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => toggleColumn(group.board_id, col)}
                            className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left"
                          >
                            <span className="mt-0.5 inline-flex size-4 items-center justify-center rounded border">
                              {selected && <Check className="size-3" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{col.label}</div>
                              <div className="text-xs text-muted-foreground">{col.type}</div>
                            </div>
                            {selected && (
                              <select
                                value={agg ?? "null"}
                                onChange={(e) =>
                                  updateAggregation(group.board_id, col.id, e.target.value === "null" ? null : e.target.value)
                                }
                                className="h-7 w-[120px] rounded-md border border-border bg-background px-2 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="null">None</option>
                                <option value="latest">Latest</option>
                                <option value="sum">Sum</option>
                                <option value="average">Average</option>
                                <option value="count">Count</option>
                                <option value="list">List</option>
                              </select>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className={cn("gap-1.5")}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            <Table2 className="size-3.5" />
            {sourceConnectColumnId ? "Add mirror column" : "Create mirror column"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
