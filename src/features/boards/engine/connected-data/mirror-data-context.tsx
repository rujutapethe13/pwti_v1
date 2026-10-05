"use client";

/**
 * Mirror Data Context
 *
 * Provides the shared MirrorStore to Mirror cell renderers and keeps it in sync
 * with the live board page state. The store is the single read/write path for
 * cross-board Mirror resolution:
 *
 *   - Mirror cells read source values via useMirrorCellValue (subscribes to the
 *     store so they re-render live when a source changes).
 *   - Editing a Mirror writes through to the real source cell via
 *     useMirrorStore().setCellValue, then persists to Supabase.
 *
 * <MirrorDataProvider/> should wrap the board page (see engine-board-page.tsx).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ColumnValue } from "../types";
import { MirrorStore } from "./mirror-store";

interface MirrorDataContextValue {
  store: MirrorStore;
}

const MirrorDataContext = createContext<MirrorDataContextValue | null>(null);

export interface MirrorDataProviderProps {
  /** The board currently open on the page (so its live state is mirrored in). */
  boardId: string;
  /** Live cell values for the current board. Synced into the store on change. */
  cellValues: Map<string, ColumnValue>;
  children: ReactNode;
  /**
   * An optional pre-seeded store. When provided, the provider uses this store
   * instead of creating one — useful for tests and for sharing a single store
   * across multiple mounted boards. Defaults to a fresh seeded store.
   */
  store?: MirrorStore;
}

export function MirrorDataProvider({ boardId, cellValues, children, store: externalStore }: MirrorDataProviderProps) {
  // One store instance for the whole page session.
  const internalRef = useRef<MirrorStore | null>(null);
  if (internalRef.current === null) {
    internalRef.current = externalStore ?? new MirrorStore();
  }
  const store = externalStore ?? internalRef.current;

  // Force provider consumers that rely on the version counter to re-render when
  // the store mutates for reasons outside the targeted useMirrorCellValue hook
  // (e.g. a write-through that should refresh every mirror on the page).
  const [, setVersion] = useState(0);
  useEffect(() => {
    return store.subscribe(() => setVersion((v) => v + 1));
  }, [store]);

  // Keep the current board's live cell values in sync with the store.
  useEffect(() => {
    store.syncBoard(boardId, cellValues);
  }, [store, boardId, cellValues]);

  const value = useMemo(() => ({ store }), [store]);

  return <MirrorDataContext.Provider value={value}>{children}</MirrorDataContext.Provider>;
}

export function useMirrorStore(): MirrorStore {
  const ctx = useContext(MirrorDataContext);
  if (!ctx) {
    throw new Error("useMirrorStore must be used within a <MirrorDataProvider>");
  }
  return ctx.store;
}

/**
 * Read a cell value from any board, re-rendering this component whenever ANY
 * cell in the store changes. This is what gives Mirror cells live updates:
 * when a write-through updates a source cell, every Mirror watching it re-renders.
 */
export function useMirrorCellValue(
  boardId: string,
  recordId: string,
  columnId: string,
): ColumnValue {
  const store = useMirrorStore();
  const [, setVersion] = useState(0);

  useEffect(() => {
    return store.subscribe(() => setVersion((v) => v + 1));
  }, [store]);

  return store.getCellValue(boardId, recordId, columnId);
}

/**
 * Subscribe a component to the MirrorStore so it re-renders whenever ANY cell
 * changes. This is what makes cross-board Mirror reads live: when a
 * write-through updates a source cell, every Mirror watching it re-renders even
 * though its own props are unchanged.
 *
 * Returns a monotonically increasing version number. Pass it into the deps
 * array of useMemos that read from the store (e.g. resolved mirror values) so
 * they recompute when the store mutates.
 */
export function useMirrorStoreSubscription(): number {
  const store = useMirrorStore();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return store.subscribe(() => setVersion((v) => v + 1));
  }, [store]);

  return version;
}

/** Read a column definition from any board (does not subscribe to changes). */
export function useMirrorColumn(boardId: string, columnId: string) {
  const store = useMirrorStore();
  return store.getColumn(boardId, columnId);
}
