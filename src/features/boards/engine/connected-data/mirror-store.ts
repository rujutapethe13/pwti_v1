/**
 * Mirror Store — cross-board cell data for Mirror resolution.
 *
 * Mirror columns never store their own values; they read source values from
 * other boards at render time. This store is the single source of truth those
 * reads (and write-through writes) go through, so that:
 *
 *   1. A Mirror cell can read ANY cell on ANY board (not just the current page).
 *   2. Editing a Mirror writes back to the REAL source cell (write-through).
 *   3. After a write-through, every Mirror cell watching that source re-renders
 *      live (the store notifies subscribers).
 *
 * The store is seeded from the demo data module and kept in sync with the
 * current board's live React state by the <MirrorDataProvider>. For boards not
 * currently open, it falls back to the persisted demo data and to Supabase on
 * write-through.
 */

import { demoBoardPageData } from "../demo-data";
import type { ColumnDefinition, ColumnValue, BoardRecord } from "../types";

export type StoreListener = () => void;

const CELL_KEY = (boardId: string, recordId: string, columnId: string) =>
  `${boardId}::${recordId}::${columnId}`;

export class MirrorStore {
  private cells = new Map<string, ColumnValue>();
  private columns = new Map<string, ColumnDefinition[]>();
  private records = new Map<string, BoardRecord[]>();
  private listeners = new Set<StoreListener>();

  constructor() {
    this.seedFromDemoData();
  }

  // ── Seeding ──────────────────────────────────────────────────

  private seedFromDemoData(): void {
    for (const boardId of Object.keys(demoBoardPageData)) {
      const board = demoBoardPageData[boardId];
      if (!board) continue;
      this.columns.set(boardId, board.columns.slice());
      this.records.set(boardId, board.records.slice());
      for (const [key, value] of board.cellValues) {
        const [recordId, columnId] = key.split(":");
        this.cells.set(CELL_KEY(boardId, recordId, columnId), value);
      }
    }
  }

  /** Replace a board's cell values from a live source (the open page's state). */
  syncBoard(boardId: string, cellValues: Map<string, ColumnValue>): void {
    const board = demoBoardPageData[boardId];
    if (board) {
      this.columns.set(boardId, board.columns.slice());
      this.records.set(boardId, board.records.slice());
    }
    for (const [key, value] of cellValues.entries()) {
      const [recordId, columnId] = key.split(":");
      this.cells.set(CELL_KEY(boardId, recordId, columnId), value);
    }
    this.notify();
  }

  /** Add or replace column definitions for a board (used for cross-board lookups). */
  syncColumns(boardId: string, columns: ColumnDefinition[]): void {
    this.columns.set(boardId, columns.slice());
    this.notify();
  }

  // ── Reads ────────────────────────────────────────────────────

  getCellValue(boardId: string, recordId: string, columnId: string): ColumnValue {
    return this.cells.get(CELL_KEY(boardId, recordId, columnId)) ?? null;
  }

  getColumn(boardId: string, columnId: string): ColumnDefinition | undefined {
    return this.columns.get(boardId)?.find((c) => c.id === columnId);
  }

  getColumns(boardId: string): ColumnDefinition[] {
    return this.columns.get(boardId) ?? [];
  }

  getRecords(boardId: string): BoardRecord[] {
    return this.records.get(boardId) ?? [];
  }

  getRecord(boardId: string, recordId: string): BoardRecord | undefined {
    return this.getRecords(boardId).find((r) => r.id === recordId);
  }

  getColumnsByType(boardId: string, type: ColumnDefinition["type"]): ColumnDefinition[] {
    return this.getColumns(boardId).filter((c) => c.type === type);
  }

  // ── Writes (write-through) ──────────────────────────────────

  /**
   * Write a value to a real source cell. Updates the in-memory store
   * immediately (so watching Mirror cells re-render live) and returns a the
   * new value so callers can persist to Supabase.
   */
  setCellValue(boardId: string, recordId: string, columnId: string, value: ColumnValue): void {
    this.cells.set(CELL_KEY(boardId, recordId, columnId), value);
    this.notify();
  }

  // ── Subscription ────────────────────────────────────────────

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
