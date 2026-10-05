import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type {
  BoardColumns,
  BoardRecords,
  BoardCellValues,
  Client360File,
  Client360LinkedItem,
  Client360Match,
  Client360Person,
  Client360SearchResult,
  UnifiedColumnDefinition,
  Client360Filters,
} from "./types";
import { isClientColumn, isJobDateColumn, normalizeStatus, getClientType, DEFAULT_PAGE_SIZE } from "./constants";

type DatabaseRow = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function cellToText(value: unknown, valueText: string | null): string {
  if (value === null || value === undefined) return valueText ?? "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => cellToText(v, null)).join(" ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const candidate = o.label ?? o.name ?? o.text ?? o.title ?? o.value;
    if (typeof candidate === "string") return candidate;
    if (typeof valueText === "string" && valueText.length > 0) return valueText;
    return JSON.stringify(value);
  }
  return String(value);
}

function asRecord(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fallback;
}

async function fetchAllBoards(): Promise<
  Array<{ id: string; name: string; slug: string; workspace_id: string; status: string }>
> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, name, slug, workspace_id, status")
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch boards for client-360:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
    slug: asString(row.slug, row.id),
    workspace_id: asString(row.workspace_id),
    status: asString(row.status, "active"),
  }));
}

async function fetchWorkspaces(workspaceIds: string[]): Promise<Map<string, string>> {
  if (workspaceIds.length === 0) return new Map();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name")
    .in("id", workspaceIds);

  if (error) {
    console.error("Failed to fetch workspaces for client-360:", error);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(asString(row.id), asString(row.name));
  }
  return map;
}

async function fetchColumnsForBoards(boardIds: string[]): Promise<BoardColumns[]> {
  if (boardIds.length === 0) return [];
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("columns")
    .select("*")
    .in("board_id", boardIds)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch columns for client-360:", error);
    return [];
  }

  const byBoard = new Map<string, BoardColumns>();
  for (const row of (data ?? []) as DatabaseRow[]) {
    const boardId = asString(row.board_id ?? row.boardId);
    if (!byBoard.has(boardId)) {
      byBoard.set(boardId, {
        boardId,
        boardName: "",
        workspaceId: "",
        workspaceName: "",
        columns: [],
      });
    }
    const entry = byBoard.get(boardId)!;
    entry.columns.push({
      id: asString(row.id),
      label: asString(row.label, asString(row.key)),
      type: asString(row.type, "text"),
      settings: asRecord(row.settings),
    });
  }
  return Array.from(byBoard.values());
}

async function fetchRecordsForBoards(boardIds: string[]): Promise<BoardRecords[]> {
  if (boardIds.length === 0) return [];
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .in("board_id", boardIds)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch records for client-360:", error);
    return [];
  }

  const byBoard = new Map<string, BoardRecords>();
  for (const row of (data ?? []) as DatabaseRow[]) {
    const boardId = asString(row.board_id ?? row.boardId);
    if (!byBoard.has(boardId)) {
      byBoard.set(boardId, { boardId, records: [] });
    }
    byBoard.get(boardId)!.records.push({
      id: asString(row.id),
      title: asString(row.title, asString(row.name, "Untitled")),
      status: asString(row.status, "active"),
      groupId: asString(row.group_id ?? row.groupId),
      createdAt: asString(row.created_at ?? row.createdAt),
      updatedAt: asString(row.updated_at ?? row.updatedAt),
    });
  }
  return Array.from(byBoard.values());
}

async function fetchGroupsForBoards(boardIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  if (boardIds.length === 0) return new Map();
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("groups")
    .select("id, board_id, name")
    .in("board_id", boardIds)
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch groups for client-360:", error);
    return new Map();
  }

  const groups = new Map<string, { id: string; name: string }>();
  for (const row of data ?? []) {
    const group = { id: asString(row.id), name: asString(row.name, "Ungrouped") };
    groups.set(group.id, group);
  }
  return groups;
}

async function fetchCellValuesForBoards(boardIds: string[]): Promise<BoardCellValues[]> {
  if (boardIds.length === 0) return [];
  const supabase = await createServiceClient();

  // Chunk to avoid Supabase .in() limits
  const chunks: string[][] = [];
  for (let i = 0; i < boardIds.length; i += 50) {
    chunks.push(boardIds.slice(i, i + 50));
  }

  const allCells: BoardCellValues[] = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from("cell_values")
      .select("*")
      .in("board_id", chunk)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch cell values for client-360:", error);
      continue;
    }

    const byBoard = new Map<string, BoardCellValues>();
    for (const row of (data ?? []) as DatabaseRow[]) {
      const boardId = asString(row.board_id ?? row.boardId);
      if (!byBoard.has(boardId)) {
        byBoard.set(boardId, { boardId, cells: [] });
      }
      byBoard.get(boardId)!.cells.push({
        recordId: asString(row.record_id ?? row.recordId),
        columnId: asString(row.column_id ?? row.columnId),
        value: row.value ?? row.value_json ?? null,
        valueText: asString(row.value_text ?? row.valueText) || null,
      });
    }
    allCells.push(...Array.from(byBoard.values()));
  }
  return allCells;
}

type ClientColumnEntry = {
  id: string;
  label: string;
  type: string;
  settings: Record<string, unknown>;
  clientType?: "recurring" | "non-recurring";
};

function resolveOptionLabel(settings: Record<string, unknown>, value: unknown): string | null {
  const options = settings.options;
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

/**
 * Resolve a cell value to its display text, handling option-type columns
 * (dropdown, status, multi_select) by resolving stored option IDs to their
 * labels. For multi_select (array) values, each option ID is resolved and
 * joined with ", ". Falls back to cellToText when no option label can be
 * resolved, preserving behavior for text columns, imported data, and
 * object-valued cells.
 */
function resolveCellDisplayText(
  settings: Record<string, unknown>,
  value: unknown,
  valueText: string | null,
): string {
  if (Array.isArray(value)) {
    const labels = value
      .map((v) => resolveOptionLabel(settings, v))
      .filter((l): l is string => l !== null);
    if (labels.length > 0) return labels.join(", ");
    return cellToText(value, valueText);
  }
  const optLabel = resolveOptionLabel(settings, value);
  if (optLabel) return optLabel;
  return cellToText(value ?? null, valueText ?? null);
}

/** Global cell index entry. */
interface GlobalCellEntry {
  value: unknown;
  valueText: string | null;
}

/**
 * Build a lookup that maps "boardId:recordId:columnId" → cell entry across
 * every board. Used to resolve Mirror column values, whose source data lives
 * on a *different* board than the mirror column itself.
 */
function buildGlobalCellIndex(cellsByBoard: BoardCellValues[]): Map<string, GlobalCellEntry> {
  const index = new Map<string, GlobalCellEntry>();
  for (const bc of cellsByBoard) {
    for (const cell of bc.cells) {
      index.set(`${bc.boardId}:${cell.recordId}:${cell.columnId}`, {
        value: cell.value,
        valueText: cell.valueText,
      });
    }
  }
  return index;
}

/**
 * Build a lookup that maps "boardId:columnId" → column definition across
 * every board. Used to resolve option labels for mirrored source columns.
 */
function buildGlobalColumnLookup(
  columnsByBoard: BoardColumns[],
): Map<string, BoardColumns["columns"][number]> {
  const lookup = new Map<string, BoardColumns["columns"][number]>();
  for (const bc of columnsByBoard) {
    for (const col of bc.columns) {
      lookup.set(`${bc.boardId}:${col.id}`, col);
    }
  }
  return lookup;
}

/**
 * Parse the linked_item_ids array from a connect_board cell value.
 * The value is stored as a JSON object: { linked_item_ids: [{ board_id, item_id, workspace_id }] }.
 */
function parseLinkedItems(value: unknown): Array<{ board_id: string; item_id: string; workspace_id?: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const obj = value as Record<string, unknown>;
  const arr = obj.linked_item_ids;
  if (!Array.isArray(arr)) return [];
  const result: Array<{ board_id: string; item_id: string; workspace_id?: string }> = [];
  for (const item of arr) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.board_id === "string" && typeof rec.item_id === "string") {
        result.push({
          board_id: rec.board_id,
          item_id: rec.item_id,
          workspace_id: typeof rec.workspace_id === "string" ? rec.workspace_id : undefined,
        });
      }
    }
  }
  return result;
}

function findColumn(
  columns: BoardColumns["columns"],
  predicate: (column: BoardColumns["columns"][number]) => boolean,
): BoardColumns["columns"][number] | undefined {
  return columns.find(predicate);
}

function cellValueForColumn(
  cells: BoardCellValues["cells"],
  columnId: string,
): BoardCellValues["cells"][number] | undefined {
  return cells.find((cell) => cell.columnId === columnId);
}

function firstNonEmpty(values: Array<string | undefined | null>): string {
  return values.find((value) => value !== null && value !== undefined && value.trim().length > 0)?.trim() ?? "";
}

function parsePersonValue(value: unknown): Client360Person[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(parsePersonValue);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = asString(
      record.label ?? record.name ?? record.text ?? record.title ?? record.value,
    );
    if (!name) return [];
    return [{
      name,
      email: asString(record.email) || undefined,
    }];
  }
  const text = String(value);
  if (!text.trim()) return [];
  return text
    .split(/[;,]/)
    .map((person) => person.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function parseFileValue(
  value: unknown,
  boardId: string,
  recordId: string,
): Client360File[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const files: Client360File[] = [];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = asString(
      record.name ?? record.filename ?? record.original_name ?? record.label ?? record.title,
    );
    if (!name) continue;
    const rawSize = record.size ?? record.file_size;
    files.push({
      name,
      url: asString(record.url ?? record.public_url ?? record.path) || undefined,
      size: rawSize === undefined || rawSize === null ? undefined : String(rawSize),
      type: asString(record.type ?? record.mime_type) || undefined,
      boardId,
      recordId,
    });
  }
  return files;
}

function uniquePeople(people: Client360Person[]): Client360Person[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = `${person.name.toLowerCase()}::${person.email?.toLowerCase() ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildEnrichedMatch(args: {
  board: { id: string; name: string; slug?: string; workspace_id: string };
  record: BoardRecords["records"][number];
  columns: BoardColumns["columns"];
  cells: BoardCellValues["cells"];
  workspaceNames: Map<string, string>;
  groups: Map<string, { id: string; name: string }>;
  recordsByBoard: BoardRecords[];
  boards: Array<{ id: string; name: string; slug?: string; workspace_id: string }>;
  matchedColumnId: string;
  matchedColumnLabel: string;
  matchType: Client360Match["matchType"];
  cellValue: string | null;
  resolved: { byId: Record<string, string>; byLabel: Record<string, string> };
}): Client360Match {
  const { board, record, columns, cells, workspaceNames, groups, recordsByBoard, boards } = args;
  const workspaceName = workspaceNames.get(board.workspace_id) ?? "Unknown Workspace";
  const clientColumn = findColumn(columns, (column) => isClientColumn(column));
  const matchedCell = args.matchedColumnId
    ? cellValueForColumn(cells, args.matchedColumnId)
    : undefined;
  const clientCell = matchedCell ?? (clientColumn ? cellValueForColumn(cells, clientColumn.id) : undefined);
  const resolvedClientValue = clientCell
    ? (args.resolved.byId[clientCell.columnId] || cellToText(clientCell.value ?? null, clientCell.valueText ?? null))
    : "";
  const clientName = firstNonEmpty([resolvedClientValue, record.title]);
  const dateColumn = findColumn(columns, (column) => isJobDateColumn(column))
    ?? findColumn(columns, (column) => column.label.toLowerCase() === "date");
  const dateCell = dateColumn ? cellValueForColumn(cells, dateColumn.id) : undefined;
  const dateValue = dateColumn && dateCell
    ? (args.resolved.byId[dateColumn.id] || cellToText(dateCell.value ?? null, dateCell.valueText ?? null))
    : "";
  const jobTypeColumn = findColumn(columns, (column) => {
    const label = column.label.toLowerCase();
    return label.includes("job type")
      || label.includes("service type")
      || label.includes("task type")
      || label === "type";
  });
  const jobTypeCell = jobTypeColumn ? cellValueForColumn(cells, jobTypeColumn.id) : undefined;
  const jobType = jobTypeColumn && jobTypeCell
    ? (args.resolved.byId[jobTypeColumn.id] || cellToText(jobTypeCell.value ?? null, jobTypeCell.valueText ?? null))
    : "";
  const statusColumn = findColumn(columns, (column) => {
    const label = column.label.toLowerCase();
    return column.type === "status"
      || column.type === "priority"
      || label.includes("status")
      || label.includes("stage")
      || label.includes("workflow");
  });
  const statusCell = statusColumn ? cellValueForColumn(cells, statusColumn.id) : undefined;
  const status = firstNonEmpty([
    statusCell && statusColumn
      ? (args.resolved.byId[statusColumn.id] || cellToText(statusCell.value ?? null, statusCell.valueText ?? null))
      : "",
    record.status,
  ]) || "Unspecified";
  const personColumns = columns.filter((column) => {
    const label = column.label.toLowerCase();
    return column.type === "person"
      || label.includes("assign")
      || label.includes("owner")
      || label.includes("people")
      || label.includes("team");
  });
  const assignedTo = uniquePeople(personColumns.flatMap((column) => {
    const cell = cellValueForColumn(cells, column.id);
    const resolvedValue = cell ? args.resolved.byId[column.id] : "";
    const personValue = resolvedValue || (cell?.value ?? cell?.valueText ?? null);
    return parsePersonValue(personValue);
  }));
  const group = record.groupId ? groups.get(record.groupId) : undefined;
  const fileColumns = columns.filter((column) => column.type === "files" || column.label.toLowerCase().includes("file") || column.label.toLowerCase().includes("attachment"));
  const files = fileColumns.flatMap((column) => {
    const cell = cellValueForColumn(cells, column.id);
    return parseFileValue(cell?.value ?? null, board.id, record.id);
  });
  const linkedColumns = columns.filter((column) => column.type === "connected_board");
  const recordIndex = new Map(
    recordsByBoard.flatMap((boardRecords) => boardRecords.records.map((item) => [`${boardRecords.boardId}:${item.id}`, item] as const)),
  );
  const boardIndex = new Map(boards.map((item) => [item.id, item]));
  const linkedItems: Client360LinkedItem[] = [];
  for (const column of linkedColumns) {
    const cell = cellValueForColumn(cells, column.id);
    for (const link of parseLinkedItems(cell?.value ?? null)) {
      const linkedBoard = boardIndex.get(link.board_id);
      const linkedRecord = recordIndex.get(`${link.board_id}:${link.item_id}`);
      linkedItems.push({
        boardId: link.board_id,
        boardSlug: linkedBoard?.slug ?? link.board_id,
        boardName: linkedBoard?.name ?? "Unknown Board",
        workspaceId: link.workspace_id ?? linkedBoard?.workspace_id ?? "",
        workspaceName: workspaceNames.get(link.workspace_id ?? linkedBoard?.workspace_id ?? "") ?? "Unknown Workspace",
        itemId: link.item_id,
        itemTitle: linkedRecord?.title ?? "Untitled Item",
      });
    }
  }
  const uniqueFiles = files.filter((file, index) => files.findIndex((candidate) => (
    candidate.boardId === file.boardId
    && candidate.recordId === file.recordId
    && candidate.name === file.name
    && candidate.url === file.url
  )) === index);
  const uniqueLinkedItems = linkedItems.filter((item, index) => linkedItems.findIndex((candidate) => (
    candidate.boardId === item.boardId && candidate.itemId === item.itemId
  )) === index);

  return {
    workspaceId: board.workspace_id,
    workspaceName,
    boardId: board.id,
    boardSlug: board.slug ?? board.id,
    boardName: board.name,
    recordId: record.id,
    recordTitle: record.title,
    clientName,
    matchedColumnId: args.matchedColumnId,
    matchedColumnLabel: args.matchedColumnLabel,
    matchType: args.matchType,
    cellValue: args.cellValue,
    cellValues: args.resolved.byId,
    cellValueByLabel: args.resolved.byLabel,
    date: dateValue,
    jobType: jobType || "Unspecified",
    status,
    statusBucket: normalizeStatus(status),
    assignedTo,
    groupId: record.groupId,
    groupName: group?.name ?? "Ungrouped",
    files: uniqueFiles,
    linkedItems: uniqueLinkedItems,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Resolve a Mirror column's value for a single record by following the
 * Connect Boards relationship. The mirror column's settings specify a
 * source_connect_column_id (the connect_board column on this board) and
 * mirrored_column_id / mirrored_columns (the source column on the linked board).
 *
 * Returns the resolved text value, or null if no value could be resolved.
 */
export function resolveMirrorColumnValue(
  recordId: string,
  boardId: string,
  mirrorColumn: BoardColumns["columns"][number],
  globalCellIndex: Map<string, GlobalCellEntry>,
  globalColumnLookup: Map<string, BoardColumns["columns"][number]>,
): string | null {
  const settings = mirrorColumn.settings as Record<string, unknown>;
  const sourceConnectColumnId = settings.source_connect_column_id as string | undefined;
  if (!sourceConnectColumnId) return null;

  // Find the connect_board cell value for this record (stored in cell_values).
  const connectCell = globalCellIndex.get(`${boardId}:${recordId}:${sourceConnectColumnId}`);
  if (!connectCell) return null;

  const linkedItems = parseLinkedItems(connectCell.value);
  if (linkedItems.length === 0) return null;

  // Collect source column IDs to look up (legacy + multi-column).
  const sourceColumnIds: string[] = [];
  const multiCols = settings.mirrored_columns as Array<{ column_id?: string }> | undefined;
  if (Array.isArray(multiCols)) {
    for (const mc of multiCols) {
      if (mc.column_id) sourceColumnIds.push(mc.column_id);
    }
  }
  const legacyId = settings.mirrored_column_id as string | undefined;
  if (legacyId) sourceColumnIds.push(legacyId);

  if (sourceColumnIds.length === 0) return null;

  // For each linked item, look up the source column's cell value.
  const resolvedValues: string[] = [];
  for (const linkedItem of linkedItems) {
    for (const sourceColId of sourceColumnIds) {
      const cellKey = `${linkedItem.board_id}:${linkedItem.item_id}:${sourceColId}`;
      const cell = globalCellIndex.get(cellKey);
      if (cell) {
        const sourceCol = globalColumnLookup.get(`${linkedItem.board_id}:${sourceColId}`);
        const optionLabel = sourceCol ? resolveOptionLabel(sourceCol.settings, cell.value) : null;
        const text = optionLabel ?? cellToText(cell.value, cell.valueText);
        if (text.length > 0) resolvedValues.push(text);
      }
    }
  }

  if (resolvedValues.length === 0) return null;
  // Single link → return the value directly; multiple → comma-joined.
  return resolvedValues.length === 1 ? resolvedValues[0] : resolvedValues.join(", ");
}

export function buildCellValuesMap(
  cells: BoardCellValues["cells"] | undefined,
  columns: BoardColumns["columns"],
  boardId?: string,
  recordId?: string,
  globalCellIndex?: Map<string, GlobalCellEntry>,
  globalColumnLookup?: Map<string, BoardColumns["columns"][number]>,
): { byId: Record<string, string>; byLabel: Record<string, string> } {
  const byId: Record<string, string> = {};
  const byLabel: Record<string, string> = {};
  if (!cells) return { byId, byLabel };

  const columnMap = new Map(columns.map((c) => [c.id, c]));

  for (const cell of cells) {
    const col = columnMap.get(cell.columnId);
    const text = col
      ? resolveCellDisplayText(col.settings, cell.value ?? null, cell.valueText ?? null)
      : cellToText(cell.value ?? null, cell.valueText ?? null);
    byId[cell.columnId] = text;
    if (col) byLabel[col.label.toLowerCase()] = text;
  }

  // Resolve Mirror columns: their values are computed from source boards,
  // not stored in cell_values. Without this, mirror/imported columns show "—".
  if (globalCellIndex && globalColumnLookup && boardId && recordId) {
    for (const col of columns) {
      if (col.type === "mirror") {
        const mirrorValue = resolveMirrorColumnValue(
          recordId,
          boardId,
          col,
          globalCellIndex,
          globalColumnLookup,
        );
        if (mirrorValue !== null) {
          byId[col.id] = mirrorValue;
          byLabel[col.label.toLowerCase()] = mirrorValue;
        }
      }
    }
  }

  return { byId, byLabel };
}

function findClientColumns(columns: BoardColumns[]): Map<string, ClientColumnEntry[]> {
  const result = new Map<string, ClientColumnEntry[]>();
  for (const board of columns) {
    const clientCols = board.columns
      .map((col) => ({ ...col, clientType: getClientType(col) }))
      .filter((col) => isClientColumn(col));
    if (clientCols.length > 0) {
      result.set(board.boardId, clientCols);
    }
  }
  return result;
}

function matchRecords(
  boards: Array<{ id: string; name: string; slug?: string; workspace_id: string }>,
  columnsByBoard: BoardColumns[],
  recordsByBoard: BoardRecords[],
  cellsByBoard: BoardCellValues[],
  workspaceNames: Map<string, string>,
  groups: Map<string, { id: string; name: string }>,
  query: string,
  allColumns?: boolean,
): Client360Match[] {
  const columnsMap = new Map(columnsByBoard.map((b) => [b.boardId, b]));
  const recordsMap = new Map(recordsByBoard.map((b) => [b.boardId, b]));
  const cellsMap = new Map(cellsByBoard.map((b) => [b.boardId, b]));
  const clientColumns = findClientColumns(columnsByBoard);

  // Build global indexes for Mirror column value resolution.
  const globalCellIndex = buildGlobalCellIndex(cellsByBoard);
  const globalColumnLookup = buildGlobalColumnLookup(columnsByBoard);

  const queryLower = (allColumns ? "" : query).toLowerCase().trim();
  const matches: Client360Match[] = [];

  for (const board of boards) {
    const boardColumns = columnsMap.get(board.id);
    const boardRecords = recordsMap.get(board.id);
    const boardCells = cellsMap.get(board.id);
    if (!boardRecords || !boardColumns) continue;

    const clientCols = clientColumns.get(board.id) ?? [];
    const cellIndex = new Map(
      (boardCells?.cells ?? []).map((c) => [`${c.recordId}:${c.columnId}`, c]),
    );

    const recordCellValuesCache = new Map<string, { byId: Record<string, string>; byLabel: Record<string, string> }>;
    const getCellValuesForRecord = (recordId: string) => {
      let cached = recordCellValuesCache.get(recordId);
      if (!cached) {
        const recordCells = (boardCells?.cells ?? []).filter((c) => c.recordId === recordId);
        cached = buildCellValuesMap(
          recordCells,
          boardColumns.columns,
          board.id,
          recordId,
          globalCellIndex,
          globalColumnLookup,
        );
        recordCellValuesCache.set(recordId, cached);
      }
      return cached;
    };

    for (const record of boardRecords.records) {
      let confirmedMatch: Client360Match | null = null;

      // When allColumns is true (dashboard mode), match every record.
      if (allColumns) {
        const resolved = getCellValuesForRecord(record.id);
        confirmedMatch = buildEnrichedMatch({
          board,
          record,
          columns: boardColumns.columns,
          cells: boardCells?.cells ?? [],
          workspaceNames,
          groups,
          recordsByBoard,
          boards,
          matchedColumnId: "",
          matchedColumnLabel: "Client Name",
          matchType: "confirmed",
          cellValue: record.title || null,
          resolved,
        });
      } else {
        // Check confirmed client columns
        for (const clientCol of clientCols) {
          const cell = cellIndex.get(`${record.id}:${clientCol.id}`);
          const strValue = resolveCellDisplayText(clientCol.settings, cell?.value ?? null, cell?.valueText ?? null);
          if (strValue.toLowerCase().includes(queryLower)) {
            const resolved = getCellValuesForRecord(record.id);
            confirmedMatch = buildEnrichedMatch({
              board,
              record,
              columns: boardColumns.columns,
              cells: boardCells?.cells ?? [],
              workspaceNames,
              groups,
              recordsByBoard,
              boards,
              matchedColumnId: clientCol.id,
              matchedColumnLabel: clientCol.label,
              matchType: "confirmed",
              cellValue: strValue || null,
              resolved,
            });
            break;
          }
        }

        // Always check record title (this is the "Client Name" pseudo-column)
        if (!confirmedMatch && record.title.toLowerCase().includes(queryLower)) {
          const resolved = getCellValuesForRecord(record.id);
          confirmedMatch = buildEnrichedMatch({
            board,
            record,
            columns: boardColumns.columns,
            cells: boardCells?.cells ?? [],
            workspaceNames,
            groups,
            recordsByBoard,
            boards,
            matchedColumnId: "",
            matchedColumnLabel: "Client Name",
            matchType: "confirmed",
            cellValue: record.title || null,
            resolved,
          });
        }
      }

      if (confirmedMatch) {
        matches.push(confirmedMatch);
      }
    }
  }

  return matches;
}

export function buildUnifiedColumns(
  boards: Array<{ id: string; name: string; slug?: string; workspace_id: string }>,
  columnsByBoard: BoardColumns[],
  workspaceNames: Map<string, string>,
): UnifiedColumnDefinition[] {
  // Build a lookup so we can resolve mirror columns' source type.
  const globalColumnLookup = buildGlobalColumnLookup(columnsByBoard);

  // Normalize a mirror column's type to its source column's type so that
  // the CellRenderer renders mirror values correctly.
  const normalizeType = (col: BoardColumns["columns"][number]): string => {
    if (col.type !== "mirror") return col.type;
    const settings = col.settings as Record<string, unknown>;
    const sourceColId = settings.mirrored_column_id as string | undefined;
    if (sourceColId) {
      for (const [, sourceCol] of globalColumnLookup) {
        if (sourceCol.id === sourceColId) return sourceCol.type;
      }
    }
    return col.type;
  };

  // Dedupe by normalized label (trim + lowercase).
  //
  // When building a cross-board/cross-workspace view, columns that represent
  // the same logical field — even with different internal IDs — should collapse
  // into a single canonical unified column. This prevents near-duplicate
  // columns from imports (e.g. "SAFARI" vs "Safari" vs "SAFARI (URBAN)"
  // all creating separate columns with different IDs).
  //
  // The first occurrence (oldest column, since boards are ordered by
  // created_at) becomes the canonical source; subsequent columns with the
  // same normalized label are merged by appending their IDs to
  // `sourceColumnIds`. Cell resolution then tries every contributing ID.
  const byNormalized = new Map<string, UnifiedColumnDefinition>();
  let order = 0;

  for (const board of boards) {
    const boardColumns = columnsByBoard.find((b) => b.boardId === board.id);
    if (!boardColumns) continue;
    const workspaceName = workspaceNames.get(board.workspace_id) ?? "Unknown";

    for (const col of boardColumns.columns) {
      const normalizedLabel = col.label.trim().toLowerCase();

      const existing = byNormalized.get(normalizedLabel);
      if (existing) {
        if (!existing.sourceColumnIds.includes(col.id)) {
          existing.sourceColumnIds.push(col.id);
        }
        continue;
      }

      byNormalized.set(normalizedLabel, {
        id: `unified-${col.id}`,
        label: col.label,
        type: normalizeType(col),
        sourceBoardId: board.id,
        sourceBoardName: board.name,
        sourceWorkspaceId: board.workspace_id,
        sourceWorkspaceName: workspaceName,
        visible: true,
        order: order++,
        sourceColumnIds: [col.id],
      });
    }
  }

  return Array.from(byNormalized.values()).sort((a, b) => a.order - b.order);
}

function applyFilters(
  matches: Client360Match[],
  boards: Array<{ id: string; name: string; slug?: string; workspace_id: string }>,
  columnsByBoard: BoardColumns[],
  recordsByBoard: BoardRecords[],
  cellsByBoard: BoardCellValues[],
  filters: Client360Filters,
): Client360Match[] {
  if (!filters.status?.length && !filters.workspaceId && !filters.boardId && !filters.clientType && !filters.assignee) {
    return matches;
  }

  const cellsMap = new Map(cellsByBoard.map((b) => [b.boardId, b]));

  return matches.filter((match) => {
    if (filters.workspaceId && match.workspaceId !== filters.workspaceId) return false;
    if (filters.boardId && match.boardId !== filters.boardId) return false;

    // Status filter
    if (filters.status?.length) {
      const normalized = normalizeStatus(match.status);
      if (!filters.status.includes(normalized)) return false;
    }

    // Client type filter
    if (filters.clientType && filters.clientType !== "all") {
      const boardColumns = columnsByBoard.find((b) => b.boardId === match.boardId);
      const matchedColumn = boardColumns?.columns.find((c) => c.id === match.matchedColumnId);
      const colType = matchedColumn ? getClientType(matchedColumn) : undefined;
      if (filters.clientType === "recurring" && colType !== "recurring") return false;
      if (filters.clientType === "non-recurring" && colType !== "non-recurring") return false;
    }

    // Assignee filter
    if (filters.assignee) {
      const boardCells = cellsMap.get(match.boardId);
      const boardColumns = columnsByBoard.find((b) => b.boardId === match.boardId);
      const personColumns = boardColumns?.columns.filter((c) => c.type === "person") ?? [];
      let hasAssignee = false;
      for (const personCol of personColumns) {
        const cell = boardCells?.cells.find((c) => c.recordId === match.recordId && c.columnId === personCol.id);
        const val = cellToText(cell?.value ?? null, cell?.valueText ?? null);
        if (val && val.toLowerCase().includes(filters.assignee.toLowerCase())) {
          hasAssignee = true;
          break;
        }
      }
      if (!hasAssignee) return false;
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
      const to = filters.dateTo ? new Date(filters.dateTo) : null;
      const recordDate = match.date ? new Date(match.date) : new Date(match.createdAt);
      if (from && recordDate < from) return false;
      if (to && recordDate > to) return false;
    }

    return true;
  });
}

export async function searchClient360(
  query: string,
  options: {
    page?: number;
    pageSize?: number;
    filters?: Client360Filters;
    debug?: boolean;
    allColumns?: boolean;
  } = {},
): Promise<Client360SearchResult> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const filters = options.filters ?? {};
  const debug = options.debug ?? false;
  const allColumns = options.allColumns ?? false;
  const debugLog: string[] = [];

  const boards = await fetchAllBoards();
  if (debug) debugLog.push(`[DEBUG] Fetched ${boards.length} boards: ${boards.map(b => `${b.name}(${b.id})`).join(", ")}`);

  if (boards.length === 0) {
    if (debug) console.warn("[Client360 Debug]", debugLog.join("\n"));
    return {
      query,
      matches: [],
      unifiedColumns: [],
      workspacesMatched: [],
      boardsMatched: [],
      totalItems: 0,
      statusBuckets: {},
      recurringCount: 0,
      nonRecurringCount: 0,
      possibleMatchesCount: 0,
      pagination: { page, pageSize, totalPages: 0, totalItems: 0 },
    };
  }

  const boardIds = boards.map((b) => b.id);
  const workspaceIds = Array.from(new Set(boards.map((b) => b.workspace_id)));
  const workspaceNames = await fetchWorkspaces(workspaceIds);

  const [columnsByBoard, recordsByBoard, cellsByBoard, groups] = await Promise.all([
    fetchColumnsForBoards(boardIds),
    fetchRecordsForBoards(boardIds),
    fetchCellValuesForBoards(boardIds),
    fetchGroupsForBoards(boardIds),
  ]);

  if (debug) {
    debugLog.push(`[DEBUG] Fetched ${columnsByBoard.length} board-column groups`);
    for (const bc of columnsByBoard) {
      debugLog.push(`[DEBUG] Board ${bc.boardId}: ${bc.columns.length} columns - ${bc.columns.map(c => `${c.label}(${c.type})`).join(", ")}`);
    }
    debugLog.push(`[DEBUG] Fetched ${recordsByBoard.length} board-record groups, total records: ${recordsByBoard.reduce((sum, b) => sum + b.records.length, 0)}`);
    debugLog.push(`[DEBUG] Fetched ${cellsByBoard.length} board-cell groups, total cells: ${cellsByBoard.reduce((sum, b) => sum + b.cells.length, 0)}`);
    debugLog.push(`[DEBUG] Fetched ${groups.size} groups`);
  }

  // Update board names from columns/records data
  for (const cols of columnsByBoard) {
    const board = boards.find((b) => b.id === cols.boardId);
    if (board) cols.boardName = board.name;
    if (cols.workspaceId) cols.workspaceName = workspaceNames.get(cols.workspaceId) ?? cols.workspaceName;
  }
  for (const recs of recordsByBoard) {
    const board = boards.find((b) => b.id === recs.boardId);
    if (board) recs.boardName = board.name;
    if (board?.workspace_id) recs.workspaceId = board.workspace_id;
    if (recs.workspaceId) recs.workspaceName = workspaceNames.get(recs.workspaceId) ?? recs.workspaceName;
  }

  let matches = matchRecords(boards, columnsByBoard, recordsByBoard, cellsByBoard, workspaceNames, groups, query, allColumns);
  if (debug) {
    const clientCols = findClientColumns(columnsByBoard);
    debugLog.push(`[DEBUG] Client columns found: ${Array.from(clientCols.entries()).map(([bid, cols]) => `${bid}: ${cols.map(c => c.label).join(",")}`).join("; ")}`);
    debugLog.push(`[DEBUG] Query="${query}", matches=${matches.length}`);
  }
  matches = applyFilters(matches, boards, columnsByBoard, recordsByBoard, cellsByBoard, filters);

  const unifiedColumns = buildUnifiedColumns(boards, columnsByBoard, workspaceNames);
  const workspacesMatched = Array.from(new Set(matches.map((m) => m.workspaceId)));
  const boardsMatched = Array.from(new Set(matches.map((m) => m.boardId)));

  const statusBuckets: Record<string, number> = {};
  for (const match of matches) {
    const bucket = match.statusBucket;
    statusBuckets[bucket] = (statusBuckets[bucket] ?? 0) + 1;
  }

  const recurringCount = matches.filter((m) => {
    const boardColumns = columnsByBoard.find((b) => b.boardId === m.boardId);
    const matchedColumn = boardColumns?.columns.find((c) => c.id === m.matchedColumnId)
      ?? boardColumns?.columns.find((c) => isClientColumn(c));
    return getClientType(matchedColumn ?? { settings: {} }) === "recurring";
  }).length;

  const nonRecurringCount = matches.filter((m) => {
    const boardColumns = columnsByBoard.find((b) => b.boardId === m.boardId);
    const matchedColumn = boardColumns?.columns.find((c) => c.id === m.matchedColumnId)
      ?? boardColumns?.columns.find((c) => isClientColumn(c));
    const colType = getClientType(matchedColumn ?? { settings: {} });
    return colType === "non-recurring" || (!colType && m.matchType === "confirmed");
  }).length;

  const possibleMatchesCount = matches.filter((m) => m.matchType === "possible").length;

  const totalItems = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paginatedMatches = matches.slice(start, start + pageSize);

  if (debug) {
    debugLog.push(`[DEBUG] Final result: ${totalItems} matches, pages=${totalPages}`);
    console.warn("[Client360 Debug]", debugLog.join("\n"));
  }

  return {
    query,
    matches: paginatedMatches,
    unifiedColumns,
    workspacesMatched,
    boardsMatched,
    totalItems,
    statusBuckets,
    recurringCount,
    nonRecurringCount,
    possibleMatchesCount,
    pagination: {
      page: safePage,
      pageSize,
      totalPages,
      totalItems,
    },
  };
}

export async function getClient360InitialData(): Promise<{
  workspaces: Array<{ id: string; name: string }>;
  boards: Array<{ id: string; name: string; slug: string; workspaceId: string }>;
  clientColumns: Array<{ boardId: string; boardName: string; columnId: string; columnLabel: string; clientType?: string }>;
}> {
  const boards = await fetchAllBoards();
  const boardIds = boards.map((b) => b.id);
  const workspaceIds = Array.from(new Set(boards.map((b) => b.workspace_id)));
  const workspaceNames = await fetchWorkspaces(workspaceIds);
  const columnsByBoard = await fetchColumnsForBoards(boardIds);

  const workspaces = Array.from(workspaceNames.entries()).map(([id, name]) => ({ id, name }));
  const boardsList = boards.map((b) => ({ id: b.id, name: b.name, slug: b.slug, workspaceId: b.workspace_id }));

  const clientColumns: Array<{ boardId: string; boardName: string; columnId: string; columnLabel: string; clientType?: string }> = [];
  for (const cols of columnsByBoard) {
    const board = boards.find((b) => b.id === cols.boardId);
    const boardName = board?.name ?? cols.boardName;
    for (const col of cols.columns) {
      if (isClientColumn(col)) {
        clientColumns.push({
          boardId: cols.boardId,
          boardName,
          columnId: col.id,
          columnLabel: col.label,
          clientType: getClientType(col),
        });
      }
    }
  }

  return { workspaces, boards: boardsList, clientColumns };
}

/**
 * Fetch ALL Client 360 data (no query filtering) for dashboard rendering.
 *
 * Returns the same shape as searchClient360 but matches every record across
 * every board, not just those containing the query string.
 */
export async function fetchAllClient360Data(
  options: {
    page?: number;
    pageSize?: number;
    filters?: Client360Filters;
    debug?: boolean;
  } = {},
): Promise<Client360SearchResult> {
  return searchClient360("", { ...options, allColumns: true });
}
