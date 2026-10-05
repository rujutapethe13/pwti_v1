/**
 * Client Search Dashboard — Unified Data Model
 *
 * Aggregates rows from ALL boards into a single normalized taxonomy,
 * regardless of how each board names its columns.
 */

export type TaxonomyField =
  | "clientName"
  | "jobType"
  | "status"
  | "date"
  | "dueDate"
  | "assignedTo"
  | "custom";

export interface ColumnTaxonomy {
  [columnId: string]: TaxonomyField;
}

export interface BoardColumnMap {
  boardId: string;
  boardName: string;
  taxonomy: ColumnTaxonomy;
}

export interface UnifiedJobRow {
  id: string;
  boardId: string;
  boardName: string;
  workspaceId: string;
  clientName: string;
  jobType: string;
  status: string;
  date: string | null;
  dueDate: string | null;
  assignedTo: string[];
  title: string;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown>;
}

export interface UnifiedDataset {
  rows: UnifiedJobRow[];
  boards: BoardColumnMap[];
  generatedAt: string;
}

export interface DashboardFilters {
  clientName: string;
  jobType: string;
  status: string[];
  assignedTo: string;
  dateRange: { from: string | null; to: string | null };
}
