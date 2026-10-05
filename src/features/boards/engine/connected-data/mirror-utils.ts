/**
 * Mirror Column — Pure Utilities
 *
 * Logic that powers the Mirror "create column" settings flow:
 *   - discovering the Connect Boards column(s) on a board
 *   - reading which boards a Connect Boards column links to
 *   - computing the cross-board intersection of mirrorable columns
 *
 * These helpers are deliberately framework-free so they can be unit-tested
 * without a DOM or a Supabase connection.
 */

import type { ColumnDefinition } from "../types";

// ── Minimal column shape for cross-board comparison ──────────
// We only need id / label / type to build a dropdown; we avoid requiring a
// full `ColumnDefinition` so the same helpers work on raw db rows too.

/**
 * Columns that can NEVER be chosen as a Mirror source.
 *
 * Structural / non-data columns:
 *   - The item Name/title column (key "name" or "title") — structural, not a
 *     user data column.
 *
 * Types that would create broken or circular reference chains:
 *   - mirror  → a Mirror cannot point at another Mirror (chained read-only
 *                references; risks circular loops between boards).
 *   - formula → circular-reference risk, plus formulas may recalculate in ways
 *                that don't make sense reflected elsewhere.
 *   - updates / activity → unstructured feed content, not column data.
 */
export const BLOCKED_MIRROR_SOURCE_TYPES = new Set([
  "mirror",
  "formula",
  "updates",
  "activity",
]);

export const BLOCKED_MIRROR_SOURCE_KEYS = new Set(["name", "title"]);

export interface MirrorableColumn {
  id: string;
  label: string;
  type: string;
  /** Column key, used to identify structural columns like the item Name. */
  key?: string;
}

export interface ConnectedBoardColumns {
  boardId: string;
  columns: MirrorableColumn[];
}

/** True if a column is eligible to be chosen as a Mirror source. */
export function isMirrorableSourceColumn(col: MirrorableColumn): boolean {
  if (BLOCKED_MIRROR_SOURCE_TYPES.has(col.type)) return false;
  if (col.key && BLOCKED_MIRROR_SOURCE_KEYS.has(col.key)) return false;
  return true;
}

// ── Source column discovery ────────────────────────────────────

/**
 * Return every `connected_board` column on a board.
 * A Mirror column can only ride on one of these.
 */
export function getConnectBoardColumns(columns: ColumnDefinition[]): ColumnDefinition[] {
  return columns.filter((c) => c.type === "connected_board");
}

/**
 * Read the connected board entries a Connect Boards column links to.
 * Supports both legacy string[] and new { workspace_id, board_id }[] formats.
 */
export function getConnectedBoardEntries(sourceColumn: ColumnDefinition | undefined): Array<{ workspace_id: string; board_id: string }> {
  if (!sourceColumn) return [];
  const settings = (sourceColumn.settings ?? {}) as Record<string, unknown>;
  const ids = settings.connected_board_ids;
  if (!Array.isArray(ids)) return [];
  if (ids.length === 0) return [];
  if (typeof ids[0] === "string") {
    return (ids as string[]).map((boardId) => ({ workspace_id: "", board_id: boardId }));
  }
  return ids as Array<{ workspace_id: string; board_id: string }>;
}

/**
 * Read the connected board ids a Connect Boards column links to.
 * Supports both legacy string[] and new { workspace_id, board_id }[] formats.
 */
export function getConnectedBoardIds(sourceColumn: ColumnDefinition | undefined): string[] {
  if (!sourceColumn) return [];
  const settings = (sourceColumn.settings ?? {}) as Record<string, unknown>;
  const ids = settings.connected_board_ids;
  if (!Array.isArray(ids)) return [];
  if (ids.length === 0) return [];
  if (typeof ids[0] === "string") return ids as string[];
  return (ids as Array<{ workspace_id: string; board_id: string }>).map((e) => e.board_id);
}

// ── Cross-board column intersection (dropdown filtering) ──────

/**
 * Compute the columns that can safely be mirrored.
 *
 * A column TYPE may be mirrored only when a column of that type exists on
 * **every** connected board. A type present on only some boards is filtered
 * out (it is "mismatched") so the user can never pick an invalid column.
 *
 * Structural and reference-dangerous columns (Name/title, other Mirrors,
 * Formulas, Updates/activity) are excluded entirely — they never appear as
 * options regardless of which board is connected.
 *
 * One representative option is returned per common type (taken from the first
 * connected board that has it). The representative's `id` is stored as
 * `mirrored_column_id`; per-board resolution is the responsibility of the
 * (deferred) Mirror resolution engine.
 *
 * @param boardColumns  Columns from each connected board (target boards).
 * @returns mirrorable column options, one per type common to all boards.
 */
export function computeMirrorableColumns(
  boardColumns: ConnectedBoardColumns[],
): MirrorableColumn[] {
  if (boardColumns.length === 0) return [];

  // Drop structural / non-mirrorable columns up front so they never appear.
  const cleaned = boardColumns.map((b) => ({
    boardId: b.boardId,
    columns: b.columns.filter(isMirrorableSourceColumn),
  }));

  const firstBoardColumns = cleaned[0].columns;
  const seen = new Set<string>();
  const result: MirrorableColumn[] = [];

  for (const col of firstBoardColumns) {
    if (seen.has(col.type)) continue;
    const existsEverywhere = cleaned.every((b) =>
      b.columns.some((c) => c.type === col.type),
    );
    if (existsEverywhere) {
      seen.add(col.type);
      result.push({ id: col.id, label: col.label, type: col.type });
    }
  }

  return result;
}

// ── Aggregation helpers ───────────────────────────────────────

export const MIRROR_AGGREGATIONS = ["latest", "sum", "average", "count"] as const;
export type MirrorAggregation = (typeof MIRROR_AGGREGATIONS)[number];

/**
 * Normalize mirror column configs from settings.
 * Returns an array of { board_id, column_id, aggregation }.
 * Supports both legacy single-column and new multi-column formats.
 */
export function getMirroredColumnConfigs(config: Record<string, unknown>): Array<{
  board_id: string;
  column_id: string;
  aggregation: string | null;
}> {
  const legacyId = (config.mirrored_column_id as string | undefined);
  const multi = (config.mirrored_columns ?? []) as Array<{ board_id: string; column_id: string; aggregation: string | null }>;

  if (multi.length > 0) {
    return multi;
  }

  if (legacyId) {
    return [{ board_id: "", column_id: legacyId, aggregation: ((config.display_config as Record<string, unknown>)?.aggregation as string | null) ?? null }];
  }

  return [];
}
