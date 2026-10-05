"use client";

/**
 * Two-Way Sync — demo store adapter
 *
 * Implements `BoardStore` over the in-memory `demoBoardPageData` shared
 * store used by the board engine. The transaction is implemented by
 * snapshotting every board's columns and cell values on `beginTransaction`
 * and restoring them on `rollback`, so a reciprocal write failure can never
 * leave a one-sided link.
 */

import { demoBoardPageData, createColumn } from "../demo-data";
import type { ColumnDefinition, ColumnValue, ConnectedBoardColumnSettings } from "../types";
import {
  applyTwoWaySync,
  type ApplyTwoWaySyncParams,
  type ApplyTwoWaySyncResult,
  type BoardStore,
} from "./two-way-sync-core";

interface BoardSnapshot {
  columns: ColumnDefinition[];
  cellValues: Map<string, ColumnValue>;
}

class DemoBoardStore implements BoardStore {
  private snapshots: Map<string, BoardSnapshot> = new Map();
  private sessionColumns: Map<string, ColumnDefinition[]> = new Map();

  private snapshotBoard(boardId: string): void {
    const board = demoBoardPageData[boardId];
    if (!board) return;
    this.snapshots.set(boardId, {
      columns: board.columns.slice(),
      cellValues: new Map(board.cellValues),
    });
  }

  private restoreBoard(boardId: string, snap: BoardSnapshot): void {
    const board = demoBoardPageData[boardId];
    if (!board) return;
    board.columns = snap.columns;
    board.cellValues = Array.from(snap.cellValues.entries());
    this.sessionColumns.delete(boardId);
  }

  beginTransaction(): void {
    this.snapshots.clear();
    this.sessionColumns.clear();
    for (const boardId of Object.keys(demoBoardPageData)) {
      this.snapshotBoard(boardId);
    }
  }

  rollback(): void {
    for (const [boardId, snap] of this.snapshots.entries()) {
      this.restoreBoard(boardId, snap);
    }
    this.snapshots.clear();
    this.sessionColumns.clear();
  }

  commit(): void {
    this.snapshots.clear();
  }

  getColumn(boardId: string, columnId: string): ColumnDefinition | undefined {
    const sessionCols = this.sessionColumns.get(boardId) ?? [];
    return sessionCols.find((c) => c.id === columnId)
      ?? demoBoardPageData[boardId]?.columns.find((c) => c.id === columnId);
  }

  getColumns(boardId: string): ColumnDefinition[] {
    const sessionCols = this.sessionColumns.get(boardId) ?? [];
    const demoCols = demoBoardPageData[boardId]?.columns ?? [];
    return [...sessionCols, ...demoCols];
  }

  findReciprocalColumn(targetBoardId: string, sourceColumnId: string): ColumnDefinition | undefined {
    return this.getColumns(targetBoardId).find(
      (c) =>
        c.type === "connected_board" &&
        (c.settings?.linked_column_id_on_other_board as string | undefined) === sourceColumnId,
    );
  }

  createReciprocalColumn(
    targetBoardId: string,
    sourceColumnId: string,
    sourceBoardId: string,
    allowMultiple: boolean,
  ): ColumnDefinition {
    const id = `col-reciprocal-${targetBoardId}-${sourceColumnId}`;
    const settings: ConnectedBoardColumnSettings = {
      connected_board_ids: [{ workspace_id: "", board_id: sourceBoardId }],
      allow_multiple_items: allowMultiple,
      two_way_sync: true,
      linked_column_id_on_other_board: sourceColumnId,
    };
    const column = createColumn(
      targetBoardId,
      id,
      `connected-${sourceColumnId}`,
      `Linked from ${sourceColumnId}`,
      "connected_board",
      this.getColumns(targetBoardId).length,
      null,
      settings as unknown as Record<string, unknown>,
    );
    const existing = this.sessionColumns.get(targetBoardId) ?? [];
    this.sessionColumns.set(targetBoardId, [...existing, column]);
    return column;
  }

  getCellItems(boardId: string, recordId: string, columnId: string): Array<{ board_id: string; item_id: string; workspace_id: string }> {
    const entries = demoBoardPageData[boardId]?.cellValues ?? [];
    const key = `${recordId}:${columnId}`;
    const entry = entries.find(([k]) => k === key);
    const raw = entry?.[1] as
      | { linked_item_ids?: Array<{ board_id: string; item_id: string; workspace_id?: string }> }
      | undefined;
    return (raw?.linked_item_ids ?? []).map((item) => ({
      board_id: item.board_id,
      item_id: item.item_id,
      workspace_id: item.workspace_id ?? "",
    }));
  }

  setCellItems(boardId: string, recordId: string, columnId: string, items: Array<{ board_id: string; item_id: string; workspace_id: string }>): void {
    const board = demoBoardPageData[boardId];
    if (!board) return;
    const key = `${recordId}:${columnId}`;
    const idx = board.cellValues.findIndex(([k]) => k === key);
    const value = {
      linked_item_ids: items.map((item) => ({
        board_id: item.board_id,
        item_id: item.item_id,
        workspace_id: item.workspace_id,
      })),
    };
    if (idx >= 0) {
      board.cellValues[idx] = [key, value];
    } else {
      board.cellValues.push([key, value]);
    }
  }

  updateColumnSettings(boardId: string, columnId: string, patch: Record<string, unknown>): void {
    const board = demoBoardPageData[boardId];
    if (!board) return;
    board.columns = board.columns.map((c) =>
      c.id === columnId ? { ...c, settings: { ...c.settings, ...patch } } : c,
    );
  }
}

export const demoBoardStore = new DemoBoardStore();

export function applyConnectBoardTwoWaySync(params: ApplyTwoWaySyncParams): ApplyTwoWaySyncResult {
  return applyTwoWaySync(demoBoardStore, params);
}

export { applyTwoWaySync } from "./two-way-sync-core";
export type { BoardStore, ApplyTwoWaySyncParams, ApplyTwoWaySyncResult } from "./two-way-sync-core";
export { extractLinkedItems, sameLink } from "./two-way-sync-core";
