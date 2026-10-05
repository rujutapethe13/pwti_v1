export interface UnifiedColumnDefinition {
  id: string;
  label: string;
  type: string;
  sourceBoardId: string;
  sourceBoardName: string;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  visible: boolean;
  order: number;
  /**
   * All source column ids that this unified column represents. When two
   * boards each have a "Date" column, the unified "Date" column collapses
   * them into one row but the underlying cell values live in different
   * ids. The view tries every id in this list when looking up a value.
   */
  sourceColumnIds: string[];
}

export interface Client360Person {
  name: string;
  email?: string;
}

export interface Client360File {
  name: string;
  url?: string;
  size?: string;
  type?: string;
  boardId: string;
  recordId: string;
}

export interface Client360LinkedItem {
  boardId: string;
  boardSlug: string;
  boardName: string;
  workspaceId: string;
  workspaceName: string;
  itemId: string;
  itemTitle: string;
}

export interface Client360Match {
  workspaceId: string;
  workspaceName: string;
  boardId: string;
  boardSlug: string;
  boardName: string;
  recordId: string;
  recordTitle: string;
  clientName: string;
  matchedColumnId: string;
  matchedColumnLabel: string;
  matchType: "confirmed" | "possible";
  cellValue: string | null;
  cellValues: Record<string, string>;
  /**
   * Secondary lookup: column label (lower-cased) → resolved text value.
   * Used as a name-based fallback when ID-based lookup fails (e.g. when
   * an imported board's column has a different internal ID than the
   * unified column's sourceColumnIds).
   */
  cellValueByLabel: Record<string, string>;
  date: string;
  jobType: string;
  status: string;
  statusBucket: string;
  assignedTo: Client360Person[];
  groupId: string | null;
  groupName: string;
  files: Client360File[];
  linkedItems: Client360LinkedItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Client360SearchResult {
  query: string;
  matches: Client360Match[];
  unifiedColumns: UnifiedColumnDefinition[];
  workspacesMatched: string[];
  boardsMatched: string[];
  totalItems: number;
  statusBuckets: Record<string, number>;
  recurringCount: number;
  nonRecurringCount: number;
  possibleMatchesCount: number;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface Client360Filters {
  status?: string[];
  workspaceId?: string;
  boardId?: string;
  clientType?: "all" | "recurring" | "non-recurring";
  dateFrom?: string;
  dateTo?: string;
  assignee?: string;
}

export interface BoardColumns {
  boardId: string;
  boardName: string;
  workspaceId: string;
  workspaceName: string;
  columns: Array<{
    id: string;
    label: string;
    type: string;
    settings: Record<string, unknown>;
  }>;
}

export interface BoardRecords {
  boardId: string;
  boardName?: string;
  workspaceId?: string;
  workspaceName?: string;
  records: Array<{
    id: string;
    title: string;
    status: string;
    groupId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface BoardCellValues {
  boardId: string;
  cells: Array<{
    recordId: string;
    columnId: string;
    value: unknown;
    valueText: string | null;
  }>;
}

// ── Snapshot (Day / Range) types ─────────────────────────────────────────────

export interface Client360SnapshotClient {
  client_id: string;
  client_name: string;
  count: number;
}

export interface Client360SnapshotDailyBreakdown {
  date: string;
  total: number;
}

export interface Client360Snapshot {
  start: string;
  end: string;
  total_jobs: number;
  clients_active: number;
  boards_touched: number;
  clients: Client360SnapshotClient[];
  daily_breakdown: Client360SnapshotDailyBreakdown[];
  unmapped_boards: number;
}

export interface Client360DailyActivityClient {
  client_id: string;
  client_name: string;
  count: number;
}

export interface Client360DailyActivity {
  selectedDate: string;
  start: string;
  end: string;
  total_jobs: number;
  clients_active: number;
  boards_touched: number;
  busiest_client: Client360DailyActivityClient | null;
  clients: Client360DailyActivityClient[];
  daily_breakdown: Client360SnapshotDailyBreakdown[];
  unmapped_boards: number;
}

// ── Pending Work (sub-tab) types ─────────────────────────────────────────────

export type PendingDateField = "any" | "job_date" | "due_date";

export interface Client360PendingItem {
  record_id: string;
  board_id: string;
  board_name: string;
  client_id: string | null;
  client_name: string;
  item_name: string;
  status: string | null;
  job_date: string | null;
  due_date: string | null;
  assigned_to: string[];
}

export interface Client360PendingWorkResult {
  date_field: "job_date" | "due_date" | null;
  start: string | null;
  end: string | null;
  client_filter: { client_id: string; client_name: string } | null;
  total_pending: number;
  clients_active: number;
  boards_touched: number;
  unmapped_boards: number;
  results: Client360PendingItem[];
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Client360ResolvedClient {
  id: string;
  canonical_name: string;
  needs_confirmation: boolean;
  /**
   * Alternative name spellings that resolve to this canonical client
   * (e.g. "Gray and Sons" → canonical "Gray & Sons"). Merged so that
   * near-duplicate names collapse into a single dropdown entry.
   */
  aliases: string[];
}