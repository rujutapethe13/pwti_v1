/**
 * Connected Data Engine — Types & Interfaces
 *
 * Types for relationships, derived column configs, dependency graph nodes,
 * and plugin registration. All metadata-driven — no hardcoded board names
 * or relationship types anywhere in this layer.
 *
 * ── Design Decision ─────────────────────────────────────────
 * Derived values stored in `cell_values` (or `derived_values` cache table)
 * are a PERFORMANCE CACHE, not the source of truth. The Query Service
 * recomputes them on read if missing. The source of truth is the
 * relationship graph + source column values.
 * ────────────────────────────────────────────────────────────
 */

import type { ColumnValue } from "../types";

// ── Relationship Type ───────────────────────────────────────

export type RelationshipType = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
export type RelationshipDirection = "forward" | "reverse";
export type RelationshipDeleteRule = "cascade" | "restrict" | "set_null";

export interface Relationship {
  id: string;
  organizationId: string;
  workspaceId: string;

  // Source side
  sourceBoardId: string;
  sourceRecordId: string;
  sourceColumnId: string;

  // Target side
  targetBoardId: string;
  targetRecordId: string;

  // Relationship metadata
  relationshipType: RelationshipType;
  direction: RelationshipDirection;
  label: string;
  status: string;
  deleteRule: RelationshipDeleteRule;
  sortOrder: number;

  // Open metadata bag for future extension
  metadata: Record<string, unknown>;

  // Soft delete support
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Connected Board Column Config ───────────────────────────

export interface ConnectedBoardConfig {
  /** Target board ID */
  targetBoardId: string;

  /** Relationship type */
  relationshipType: RelationshipType;

  /** Whether multiple records can be linked */
  allowMultiple: boolean;

  /** Whether to allow creating new records from the picker */
  allowCreateNew: boolean;

  /** Whether to allow removing linked records */
  allowRemove: boolean;

  /** Relationship direction */
  direction: RelationshipDirection;

  /** Which field to display as the record title in the picker */
  displayField: string;

  /** Which field to search on */
  searchField: string;

  /** Grouping behavior for the picker */
  groupingBehavior: "none" | "by_group" | "by_status";

  /** Validation rules */
  validation: ConnectedBoardValidationRule[];

  /** Group scoping: only link records from matching groups */
  groupScope?: GroupScopeConfig;
}

export interface ConnectedBoardValidationRule {
  /** Maximum number of linked records */
  maxRecords?: number;

  /** Minimum number of linked records */
  minRecords?: number;

  /** Allow only records with matching group IDs */
  sameGroupOnly?: boolean;
}

export interface GroupScopeConfig {
  enabled: boolean;
  /** The grouping key to match on (arbitrary, never assumed to be a month) */
  groupKey: string;
  /** Boards must share matching groups for this key */
  strict: boolean;
}

// ── Mirror Column Config ────────────────────────────────────

export interface MirrorConfig {
  /** The Connected Board column that defines the relationship (snake_case to match Column.settings) */
  source_connect_column_id: string;

  /** Legacy single column mirror support */
  mirrored_column_id?: string;

  /** Multi-column mirror targets */
  mirrored_columns?: Array<{
    board_id: string;
    column_id: string;
    aggregation: string | null;
  }>;

  /** Display/aggregation config stored alongside the mirror settings */
  display_config: {
    aggregation: string | null;
    display_mode?: string;
    filter_value?: string | null;
  };

  /** Fallback value if source is empty */
  fallbackValue?: ColumnValue;

  /** Format hint for display */
  displayFormat?: "raw" | "formatted";
}

// ── Lookup Column Config ────────────────────────────────────

export interface LookupConfig {
  /** The starting Connected Board column */
  sourceConnectedColumnId: string;

  /**
   * Chain of relationship hops.
   * Each hop is resolved through a Connected Board column.
   * Example: Production → PO → Vendor → GST
   *   hops: [
   *     { throughColumnId: "prod-po", targetBoardId: "purchase-orders" },
   *     { throughColumnId: "po-vendor", targetBoardId: "vendor-management" },
   *   ]
   */
  hops: LookupHop[];

  /** The final column to read from */
  targetColumnId: string;

  /** Display format */
  displayFormat: "single" | "joined" | "array";

  /** Separator for joined text */
  joinSeparator?: string;
}

export interface LookupHop {
  /** The Connected Board column on the current board to traverse */
  throughColumnId: string;
  /** The target board ID at this hop */
  targetBoardId: string;
}

// ── Rollup Column Config ────────────────────────────────────

export interface RollupConfig {
  /** The Connected Board column defining the one-to-many relationship */
  sourceConnectedColumnId: string;

  /** The column on the target board to aggregate */
  targetColumnId: string;

  /** Aggregation function */
  aggregation: RollupAggregation;

  /** Target column type (for type-safe aggregation) */
  targetColumnType: string;
}

export type RollupAggregation =
  | "count"
  | "count_unique"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "first"
  | "last"
  | "median"
  | "mode"
  | "count_empty"
  | "count_filled"
  | "percent_filled"
  | "percent_empty"
  | "concatenate"
  | "unique"
  | "and"
  | "or"
  | "earliest_date"
  | "latest_date";

// ── Formula Column Config ───────────────────────────────────

export interface FormulaConfig {
  /** The formula expression string */
  expression: string;

  /** Return type hint */
  returnType: "string" | "number" | "boolean" | "date";

  /** The columns this formula depends on (extracted at config time) */
  dependencyColumnIds: string[];

  /** Whether to show formula errors inline */
  showErrors: boolean;
}

// ── Derived Value (Cache Entry) ─────────────────────────────

export interface DerivedValue {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  recordId: string;
  columnId: string;
  value: ColumnValue;
  valueText: string;
  version: number;
  computedAt: string;
  updatedAt: string;
}

// ── Dependency Graph ────────────────────────────────────────

export type DependencyType = "mirror" | "lookup" | "rollup" | "formula" | "reference";

export interface DependencyGraphEdge {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  sourceColumnId: string;
  targetColumnId: string;
  dependencyType: DependencyType;
  relationshipId: string | null;
  createdAt: string;
}

export interface DependencyGraphNode {
  columnId: string;
  boardId: string;
  dependsOn: Array<{
    columnId: string;
    boardId: string;
    type: DependencyType;
  }>;
  dependents: Array<{
    columnId: string;
    boardId: string;
    type: DependencyType;
  }>;
}

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycles: Array<{
    path: string[]; // column IDs in the cycle
    description: string;
  }>;
}

// ── Relationship Picker Types ───────────────────────────────

export interface PickerSearchResult {
  records: Array<{
    recordId: string;
    title: string;
    subtitle?: string;
    groupName?: string;
    status?: string;
  }>;
  totalCount: number;
  hasMore: boolean;
}

export interface RecentlyLinkedEntry {
  relationshipId: string;
  sourceBoardId: string;
  sourceRecordId: string;
  targetRecordId: string;
  targetTitle: string;
  linkedAt: string;
}

// ── Event Names for Domain Events ───────────────────────────

export const ConnectedDataEventNames = {
  RelationshipCreated: "relationship.create:after" as const,
  RelationshipDeleted: "relationship.delete:after" as const,
  RelationshipUpdated: "relationship.update:after" as const,
  MirrorRecomputed: "mirror.recompute:after" as const,
  LookupRecomputed: "lookup.recompute:after" as const,
  RollupRecomputed: "rollup.recompute:after" as const,
  FormulaEvaluated: "formula.recompute:after" as const,
  LinkedRecordCreated: "record.create:after" as const,
  RelationshipMoved: "relationship.move:after" as const,
} as const;

