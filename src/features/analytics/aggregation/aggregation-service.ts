/**
 * Aggregation Service
 *
 * Server-only service that pulls rows from every board in the account,
 * classifies each board's columns into a common taxonomy, and produces
 * a unified dataset for the Client Search Dashboard.
 *
 * Normalization strategy:
 *   1. Fetch all boards for the org/workspace.
 *   2. For each board, fetch columns (schema), records, and cell values.
 *   3. Classify each column using type + label keyword scoring.
 *   4. Hydrate cell values into record objects.
 *   5. Map each record to a UnifiedJobRow.
 *   6. Merge all boards' rows into a single array.
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoardDefinition, ColumnDefinition, BoardRecord, ColumnValue } from "@/features/boards/engine/types";
import type { UnifiedDataset, UnifiedJobRow, ColumnTaxonomy, TaxonomyField, BoardColumnMap } from "./types";

// ── Column Classification ─────────────────────────────────────

/**
 * Classify a single column into a taxonomy field.
 *
 * Scoring strategy (first match wins):
 *   1. Exact type match (status → status, person → assignedTo, date → date)
 *   2. Label keyword match (client, job, assign, due, deadline, etc.)
 *   3. Fallback based on type
 */
function classifyColumn(column: ColumnDefinition): TaxonomyField {
  const label = column.label.toLowerCase().trim();
  const type = column.type;

  // ── Priority 1: type-based classification ─────────────
  if (type === "status") return "status";
  if (type === "person") return "assignedTo";

  // ── Priority 2: label keyword matching ────────────────
  if (matchesAny(label, ["client", "customer", "brand", "account"])) {
    return "clientName";
  }
  if (matchesAny(label, ["job type", "job-type", "jobtype", "type", "category", "service"])) {
    return "jobType";
  }
  if (matchesAny(label, ["assign", "owner", "responsible", "artist", "editor", "worker"])) {
    return "assignedTo";
  }
  if (matchesAny(label, ["due", "deadline", "target date", "end date"])) {
    return "dueDate";
  }
  if (matchesAny(label, ["date", "start", "started", "created", "scheduled"])) {
    return "date";
  }

  // ── Priority 3: type fallback ─────────────────────────
  if (type === "date" || type === "timeline") return "date";

  return "custom";
}

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw));
}

/**
 * Build a taxonomy map for a board's columns.
 *
 * When multiple columns map to the same taxonomy field, the first one
 * (by sort order) wins. This prevents collisions.
 */
function buildColumnTaxonomy(columns: ColumnDefinition[]): ColumnTaxonomy {
  const taxonomy: ColumnTaxonomy = {};
  const usedFields = new Set<TaxonomyField>();

  // Sort by order to ensure deterministic assignment
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  for (const column of sorted) {
    const field = classifyColumn(column);
    if (field === "custom") {
      taxonomy[column.id] = "custom";
      continue;
    }
    // First column to claim a field wins
    if (!usedFields.has(field)) {
      taxonomy[column.id] = field;
      usedFields.add(field);
    } else {
      taxonomy[column.id] = "custom";
    }
  }

  return taxonomy;
}

// ── Cell Value Extraction ─────────────────────────────────────

function resolveOptionLabel(
  columns: ColumnDefinition[],
  columnId: string,
  value: unknown,
): string | null {
  const column = columns.find((c) => c.id === columnId);
  const options = column?.settings?.options;
  if (!Array.isArray(options) || value === null || value === undefined) return null;
  const valueStr = String(value);
  for (const opt of options) {
    if (opt && typeof opt === "object") {
      const optObj = opt as Record<string, unknown>;
      if (optObj.id === valueStr || optObj.value === valueStr) {
        const label = optObj.label ?? optObj.name;
        if (typeof label === "string") return label;
      }
    }
  }
  return null;
}

function cellToDisplayText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => cellToDisplayText(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const candidate = o.label ?? o.name ?? o.text ?? o.title ?? o.value;
    if (typeof candidate === "string") return candidate;
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

function extractCellValue(
  cellValues: Map<string, ColumnValue>,
  recordId: string,
  columnId: string,
): ColumnValue {
  return cellValues.get(`${recordId}:${columnId}`) ?? null;
}

function extractTextValue(
  cellValues: Map<string, ColumnValue>,
  recordId: string,
  columnId: string,
  columns: ColumnDefinition[] = [],
): string {
  const value = extractCellValue(cellValues, recordId, columnId);
  if (value === null || value === undefined) return "";

  // Try to resolve option ID to label first
  const optionLabel = resolveOptionLabel(columns, columnId, value);
  if (optionLabel) return optionLabel;

  return cellToDisplayText(value);
}

function extractDateValue(
  cellValues: Map<string, ColumnValue>,
  recordId: string,
  columnId: string,
): string | null {
  const value = extractCellValue(cellValues, recordId, columnId);
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function extractPersonValue(
  cellValues: Map<string, ColumnValue>,
  recordId: string,
  columnId: string,
): string[] {
  const value = extractCellValue(cellValues, recordId, columnId);
  if (value === null || value === undefined) return [];

  const names: string[] = [];

  const processPersonEntry = (entry: unknown): string | null => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const name = obj.name ?? obj.label ?? obj.text ?? obj.displayName ?? obj.email;
      if (typeof name === "string") return name;
    }
    return null;
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      const name = processPersonEntry(item);
      if (name) names.push(name);
    }
  } else {
    const name = processPersonEntry(value);
    if (name) names.push(name);
  }

  return names;
}

// ── Record Mapping ────────────────────────────────────────────

function mapRecordToUnifiedRow(
  record: BoardRecord,
  board: BoardDefinition,
  taxonomy: ColumnTaxonomy,
  cellValues: Map<string, ColumnValue>,
  columns: ColumnDefinition[],
): UnifiedJobRow {
  // Resolve taxonomy field → column ID
  const fieldColumnMap = new Map<TaxonomyField, string>();
  for (const [columnId, field] of Object.entries(taxonomy)) {
    if (field !== "custom" && !fieldColumnMap.has(field)) {
      fieldColumnMap.set(field, columnId);
    }
  }

  const clientNameCol = fieldColumnMap.get("clientName");
  const jobTypeCol = fieldColumnMap.get("jobType");
  const statusCol = fieldColumnMap.get("status");
  const dateCol = fieldColumnMap.get("date");
  const dueDateCol = fieldColumnMap.get("dueDate");
  const assignedToCol = fieldColumnMap.get("assignedTo");

  // Build raw cell values map for extensibility
  const raw: Record<string, unknown> = {};
  for (const [key, value] of cellValues.entries()) {
    if (key.startsWith(`${record.id}:`)) {
      raw[key.split(":")[1]] = value;
    }
  }

  // Derive client name: use mapped column, fallback to record title
  const clientName = clientNameCol
    ? extractTextValue(cellValues, record.id, clientNameCol, columns)
    : record.title;

  // Derive job type: use mapped column, fallback to board name
  const jobType = jobTypeCol
    ? extractTextValue(cellValues, record.id, jobTypeCol, columns)
    : board.name;

  return {
    id: record.id,
    boardId: board.id,
    boardName: board.name,
    workspaceId: board.workspaceId,
    clientName: clientName || record.title,
    jobType: jobType || board.name,
    status: statusCol
      ? extractTextValue(cellValues, record.id, statusCol, columns)
      : "Not Started",
    date: dateCol
      ? extractDateValue(cellValues, record.id, dateCol)
      : record.createdAt,
    dueDate: dueDateCol
      ? extractDateValue(cellValues, record.id, dueDateCol)
      : null,
    assignedTo: assignedToCol
      ? extractPersonValue(cellValues, record.id, assignedToCol)
      : [],
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    raw,
  };
}

// ── Main Aggregation ──────────────────────────────────────────

/**
 * Build the unified dataset across all boards in a workspace.
 *
 * @param workspaceId - The workspace to scope the query to
 * @returns UnifiedDataset with all rows normalized
 */
export async function buildUnifiedDataset(workspaceId: string): Promise<UnifiedDataset> {
  const client = await createServiceClient();

  // 1. Fetch all boards for the workspace
  const { data: boardRows, error: boardError } = await client
    .from("boards")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (boardError || !boardRows) {
    return { rows: [], boards: [], generatedAt: new Date().toISOString() };
  }

  const boards: BoardDefinition[] = boardRows.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    slug: String(row.slug ?? row.id),
    name: String(row.name ?? row.slug ?? row.id),
    description: String(row.description ?? ""),
    icon: undefined,
    favorite: Boolean(row.favorite),
    pinned: Boolean(row.pinned),
    visibility: String(row.visibility ?? "workspace") as BoardDefinition["visibility"],
    status: String(row.status ?? "active") as BoardDefinition["status"],
    sharedWith: (Array.isArray(row.shared_with) ? row.shared_with : ["owner", "editor", "viewer"]) as BoardDefinition["sharedWith"],
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }));

  // 2. For each board, fetch columns, records, cell values in parallel
  const unifiedRows: UnifiedJobRow[] = [];
  const boardColumnMaps: BoardColumnMap[] = [];

  const boardDataResults = await Promise.all(
    boards.map((board) => loadBoardData(client, board.id)),
  );

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    const boardData = boardDataResults[i];

    if (!boardData) continue;

    const { columns, records, cellValues } = boardData;

    // 3. Build taxonomy for this board
    const taxonomy = buildColumnTaxonomy(columns);
    boardColumnMaps.push({
      boardId: board.id,
      boardName: board.name,
      taxonomy,
    });

    // 4. Map each record to unified row
    for (const record of records) {
      const row = mapRecordToUnifiedRow(record, board, taxonomy, cellValues, columns);
      unifiedRows.push(row);
    }
  }

  return {
    rows: unifiedRows,
    boards: boardColumnMaps,
    generatedAt: new Date().toISOString(),
  };
}

interface BoardData {
  columns: ColumnDefinition[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
}

async function loadBoardData(
  client: SupabaseClient,
  boardId: string,
): Promise<BoardData | null> {
  // Fetch columns, records, and cell values in parallel
  const [columnsResult, recordsResult, cellValuesResult] = await Promise.all([
    client
      .from("columns")
      .select("*")
      .eq("board_id", boardId)
      .order("sort_order", { ascending: true }),
    client
      .from("records")
      .select("*")
      .eq("board_id", boardId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    client
      .from("cell_values")
      .select("*")
      .eq("board_id", boardId),
  ]);

  if (columnsResult.error || recordsResult.error || cellValuesResult.error) {
    return null;
  }

  const columns: ColumnDefinition[] = (columnsResult.data ?? []).map((row) => ({
    id: String(row.id),
    boardId: String(row.board_id ?? ""),
    key: String(row.key ?? ""),
    label: String(row.label ?? row.key ?? ""),
    description: row.description ? String(row.description) : undefined,
    type: String(row.type ?? "text") as ColumnDefinition["type"],
    required: Boolean(row.required),
    hidden: Boolean(row.hidden),
    frozen: Boolean(row.frozen),
    defaultValue: (row.default_value ?? null) as ColumnValue,
    settings: (row.settings && typeof row.settings === "object") ? row.settings as Record<string, unknown> : {},
    permissions: (row.permissions && typeof row.permissions === "object")
      ? row.permissions as unknown as ColumnDefinition["permissions"]
      : { view: ["owner", "editor", "commenter", "viewer"], edit: ["owner", "editor"], configure: ["owner"] },
    validation: Array.isArray(row.validation) ? row.validation as ColumnDefinition["validation"] : [],
    version: Number(row.version ?? 1),
    order: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }));

  const records: BoardRecord[] = (recordsResult.data ?? []).map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    boardId: String(row.board_id ?? ""),
    groupId: row.group_id ? String(row.group_id) : null,
    title: String(row.title ?? row.name ?? "Untitled"),
    status: String(row.status ?? "active") as BoardRecord["status"],
    version: Number(row.version ?? 1),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }));

  // Build cell values map: key = "recordId:columnId"
  const cellValues = new Map<string, ColumnValue>();
  for (const row of cellValuesResult.data ?? []) {
    const recordId = String(row.record_id ?? "");
    const columnId = String(row.column_id ?? "");
    if (recordId && columnId) {
      cellValues.set(`${recordId}:${columnId}`, (row.value ?? null) as ColumnValue);
    }
  }

  return { columns, records, cellValues };
}
