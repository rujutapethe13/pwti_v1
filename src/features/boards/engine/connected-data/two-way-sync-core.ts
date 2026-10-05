/**
 * Two-Way Sync — pure logic core
 *
 * This module contains the reciprocal-write algorithm for `connect_board`
 * columns, with NO dependency on the demo data store or any UI. All reads
 * and writes go through an injected `BoardStore`, which is responsible for
 * transaction isolation (begin / rollback / commit). That keeps the risky
 * cross-board logic deterministic and unit-testable.
 *
 * Flow (per the spec):
 *   - For every newly linked item {board_id: B, item_id: Bitem} on Item A:
 *       * If Board B has no Connect Boards column pointing back at A
 *         (identified by linked_column_id_on_other_board === columnA.id),
 *         auto-create one and set linked_column_id_on_other_board on BOTH
 *         columns to point at each other.
 *       * Write a reciprocal cell value on Item B linking back to Item A.
 *   - For every unlinked item, remove the reciprocal entry on Board B.
 *   - All writes happen inside a single store transaction.
 */

import type {
  ColumnDefinition,
  ColumnValue,
  ConnectedBoardColumnSettings,
  ConnectedBoardLinkItem,
} from "../types";

export interface BoardStore {
  /** Find a connect_board column on targetBoardId whose linked_column_id_on_other_board === sourceColumnId. */
  findReciprocalColumn(targetBoardId: string, sourceColumnId: string): ColumnDefinition | undefined;
  /** Create the reciprocal connect_board column on targetBoardId pointing back to sourceBoardId. */
  createReciprocalColumn(
    targetBoardId: string,
    sourceColumnId: string,
    sourceBoardId: string,
    allowMultiple: boolean,
  ): ColumnDefinition;
  getCellItems(boardId: string, recordId: string, columnId: string): ConnectedBoardLinkItem[];
  setCellItems(boardId: string, recordId: string, columnId: string, items: ConnectedBoardLinkItem[]): void;
  updateColumnSettings(boardId: string, columnId: string, patch: Record<string, unknown>): void;
  beginTransaction(): void;
  rollback(): void;
  commit(): void;
}

export interface ApplyTwoWaySyncParams {
  sourceBoardId: string;
  sourceColumnId: string;
  sourceRecordId: string;
  added: ConnectedBoardLinkItem[];
  removed: ConnectedBoardLinkItem[];
  sourceAllowMultiple?: boolean;
}

export interface ApplyTwoWaySyncResult {
  sourceColumnSettingsPatch?: Partial<ConnectedBoardColumnSettings>;
}

export function sameLink(a: ConnectedBoardLinkItem, b: ConnectedBoardLinkItem): boolean {
  return a.board_id === b.board_id && a.item_id === b.item_id && a.workspace_id === b.workspace_id;
}

export function extractLinkedItems(value: unknown): ConnectedBoardLinkItem[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "linked_item_ids" in value
  ) {
    const arr = (value as { linked_item_ids?: unknown }).linked_item_ids;
    if (!Array.isArray(arr)) return [];
    return arr.map((item: Record<string, unknown>) => ({
      board_id: (item.board_id as string) ?? "",
      item_id: (item.item_id as string) ?? "",
      workspace_id: (item.workspace_id as string) ?? "",
    }));
  }
  return [];
}

export function applyTwoWaySync(store: BoardStore, params: ApplyTwoWaySyncParams): ApplyTwoWaySyncResult {
  const { sourceBoardId, sourceColumnId, sourceRecordId, added, removed, sourceAllowMultiple } = params;

  store.beginTransaction();
  try {
    let sourcePatch: Partial<ConnectedBoardColumnSettings> | undefined;

    // ── LINK: each newly added entry gets a reciprocal on the target board ──
    for (const entry of added) {
      const targetBoardId = entry.board_id;
      const targetRecordId = entry.item_id;

      let reciprocal = store.findReciprocalColumn(targetBoardId, sourceColumnId);
      let reciprocalId: string;

      if (!reciprocal) {
        reciprocal = store.createReciprocalColumn(
          targetBoardId,
          sourceColumnId,
          sourceBoardId,
          sourceAllowMultiple ?? false,
        );
        reciprocalId = reciprocal.id;
        sourcePatch = {
          ...(sourcePatch ?? {}),
          linked_column_id_on_other_board: reciprocalId,
        };
      } else {
        reciprocalId = reciprocal.id;
      }

      const existing = store.getCellItems(targetBoardId, targetRecordId, reciprocalId);
      const alreadyThere = existing.some(
        (it) => it.board_id === sourceBoardId && it.item_id === sourceRecordId,
      );
      if (!alreadyThere) {
        store.setCellItems(targetBoardId, targetRecordId, reciprocalId, [
          ...existing,
          { board_id: sourceBoardId, item_id: sourceRecordId },
        ]);
      }
    }

    // ── UNLINK: remove reciprocal entries on the target boards ──
    for (const entry of removed) {
      const targetBoardId = entry.board_id;
      const targetRecordId = entry.item_id;

      const reciprocal = store.findReciprocalColumn(targetBoardId, sourceColumnId);
      if (!reciprocal) continue;

      const existing = store.getCellItems(targetBoardId, targetRecordId, reciprocal.id);
      const next = existing.filter(
        (it) => !(it.board_id === sourceBoardId && it.item_id === sourceRecordId),
      );
      store.setCellItems(targetBoardId, targetRecordId, reciprocal.id, next);
    }

    // ── Persist the reciprocal column pointer on the source column ──
    if (sourcePatch) {
      store.updateColumnSettings(sourceBoardId, sourceColumnId, sourcePatch as Record<string, unknown>);
    }

    store.commit();
    return { sourceColumnSettingsPatch: sourcePatch };
  } catch (err) {
    store.rollback();
    throw err;
  }
}
