"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import type {
  BoardDefinition,
  ColumnDefinition,
  ColumnValue,
  Group,
} from "@/features/boards/engine/types";
import {
  buildExportFilename,
  buildExportWorkbook,
  workbookToArrayBuffer,
} from "@/features/boards/engine/lib/import-export";

interface UseExportToExcelArgs {
  board: BoardDefinition;
  columns: ColumnDefinition[];
  /** Current column order from the board's view state (array of column IDs in the
   *  order shown in the UI table headers). Falls back to the `columns` array
   *  order when omitted. */
  columnOrder?: string[];
  /** Label for the primary / record-title column. Defaults to "Name". */
  primaryColumnLabel?: string;
  groups: Group[];
  /** Map of `${recordId}:${columnId}` → value for the currently visible records. */
  visibleCellValues: Map<string, ColumnValue>;
  visibleRecordIds: string[];
  records: Array<{ id: string; title: string; groupId: string | null }>;
}

export function useExportToExcel(args: UseExportToExcelArgs) {
  const exportToExcel = useCallback(() => {
    try {
      const visibleIdSet = new Set(args.visibleRecordIds);
      const records = args.records
        .filter((r) => visibleIdSet.has(r.id))
        .map((r) => ({
          record: r,
          cellValues: collectCellValues(r.id, args.columns, args.visibleCellValues),
        }));
      const workbook = buildExportWorkbook({
        boardName: args.board.name,
        columns: args.columns,
        columnOrder: args.columnOrder,
        primaryColumnLabel: args.primaryColumnLabel,
        records,
        groups: args.groups,
        visibleRecordIds: visibleIdSet,
      });
      const buffer = workbookToArrayBuffer(workbook);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildExportFilename(args.board.name);
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${records.length.toLocaleString()} item${records.length === 1 ? "" : "s"} to Excel.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      toast.error(message);
    }
  }, [args]);

  return { exportToExcel };
}

function collectCellValues(
  recordId: string,
  columns: ColumnDefinition[],
  cellValues: Map<string, ColumnValue>,
): Record<string, ColumnValue> {
  const out: Record<string, ColumnValue> = {};
  for (const col of columns) {
    out[col.id] = cellValues.get(`${recordId}:${col.id}`) ?? col.defaultValue;
  }
  return out;
}
