/**
 * Query Service
 *
 * Reusable, composable query engine for board data.
 * All views (table, kanban, calendar, chart, etc.) and analytics
 * use this service to fetch data consistently.
 *
 * Supports:
 * - Column-based filtering
 * - Multi-column sorting
 * - Group-based aggregation
 * - Pagination with cursor or offset
 * - Search across searchable columns
 * - Cell value hydration
 */

// NOTE: "server-only" guard removed because this module is
// re-exported via the barrel (index.ts) and consumed by
// client components through navigation.ts.

import { BoardRepository } from "../repository/board-repository";
import { ColumnRepository } from "../repository/column-repository";
import { GroupRepository } from "../repository/group-repository";
import { RecordRepository } from "../repository/record-repository";
import { CellRepository } from "../repository/cell-repository";
import { ViewRepository } from "../repository/view-repository";
import { metadataCache } from "../cache/metadata-cache";
import {
  getColumnOptions,
  isOptionColumnType,
  resolveOptionDisplay,
} from "../lib/option-lookup";

import type { ApiResponse, Nullable } from "@/types";
import type {
  BoardDefinition,
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
  Group,
  BoardView,
  ViewFilter,
  ViewSort,
  ViewGrouping,
} from "../types";

const boardRepo = new BoardRepository();
const columnRepo = new ColumnRepository();
const groupRepo = new GroupRepository();
const recordRepo = new RecordRepository();
const cellRepo = new CellRepository();
const viewRepo = new ViewRepository();

// ── Query Input ────────────────────────────────────────────

export interface BoardQueryInput {
  boardId: string;

  /** Column filters */
  filters?: ViewFilter[];

  /** Sort configuration */
  sorting?: ViewSort[];

  /** Grouping configuration */
  grouping?: ViewGrouping[];

  /** Pagination */
  page?: number;
  pageSize?: number;

  /** Full-text search across record titles and searchable columns */
  search?: string;

  /** Whether to include archived records */
  includeArchived?: boolean;

  /** Specific group IDs to scope the query */
  groupIds?: string[];
}

// ── Query Result ───────────────────────────────────────────

export interface BoardQueryResult {
  board: BoardDefinition;
  columns: ColumnDefinition[];
  groups: Group[];
  records: BoardRecord[];
  cellValues: Map<string, ColumnValue>;
  totalRecords: number;
  filteredRecordCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HydratedRecord {
  record: BoardRecord;
  cells: Record<string, ColumnValue>;
}

// ── Query Service ─────────────────────────────────────────

export const QueryService = {
  /**
   * Load all data needed to render a board view.
   * Caches metadata (board, columns, groups) for performance.
   */
  async loadBoardData(boardId: string): Promise<ApiResponse<BoardQueryResult>> {
    // Try cache first
    const cachedBoard = metadataCache.get<BoardDefinition>("board", boardId);
    const cachedColumns = metadataCache.get<ColumnDefinition[]>("column", boardId);

    const [boardResult, columnsResult, groupsResult, recordsResult, viewsResult] = await Promise.all([
      cachedBoard ? { data: cachedBoard, error: null, status: 200 } as ApiResponse<BoardDefinition> : boardRepo.findById(boardId),
      cachedColumns ? { data: cachedColumns, error: null, status: 200 } as ApiResponse<ColumnDefinition[]> : columnRepo.findByBoard(boardId),
      groupRepo.findByBoard(boardId),
      recordRepo.findByBoard(boardId),
      viewRepo.findByBoard(boardId),
    ]);

    if (!boardResult.data) {
      return { data: null, error: boardResult.error ?? "Board not found", status: 404 };
    }

    const board = boardResult.data;
    const columns = columnsResult.data ?? [];
    const groups = groupsResult.data ?? [];
    const records = recordsResult.data ?? [];
    const views = viewsResult.data ?? [];

    // Update cache
    metadataCache.set("board", boardId, board);
    metadataCache.set("column", boardId, columns);
    metadataCache.set("group", boardId, groups);

    // Load all cell values for the board
    const cellEntries = await this.loadCellValues(boardId, records.map((r) => r.id), columns.map((c) => c.id));

    return {
      data: {
        board,
        columns,
        groups,
        records,
        cellValues: cellEntries,
        totalRecords: records.length,
        filteredRecordCount: records.length,
        page: 1,
        pageSize: records.length,
        totalPages: 1,
      },
      error: null,
      status: 200,
    };
  },

  /**
   * Execute a filtered/sorted/paginated query on a board.
   */
  async query(input: BoardQueryInput): Promise<ApiResponse<BoardQueryResult>> {
    const baseData = await this.loadBoardData(input.boardId);
    if (!baseData.data) return baseData as ApiResponse<BoardQueryResult>;

    let { records } = baseData.data;
    const { board, columns, groups, cellValues } = baseData.data;
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;

    // Filter archived records unless requested
    if (!input.includeArchived) {
      records = records.filter((r) => r.status !== "archived");
    }

    // Filter by group IDs
    if (input.groupIds && input.groupIds.length > 0) {
      records = records.filter((r) => r.groupId && input.groupIds!.includes(r.groupId));
    }

    // Apply column filters
    if (input.filters && input.filters.length > 0) {
      records = records.filter((record) =>
        input.filters!.every((filter) => this.applyFilter(record, filter, cellValues)),
      );
    }

    // Apply search
    if (input.search && input.search.trim().length > 0) {
      const query = input.search.toLowerCase();
      records = records.filter((record) => {
        if (record.title.toLowerCase().includes(query)) return true;
        // Search through cell values. Option columns store the option id, so
        // search the option's label too — otherwise searching "Apperals" would
        // not match a cell holding "opt-1790843037295-0".
        for (const column of columns) {
          const cellKey = `${record.id}:${column.id}`;
          const value = cellValues.get(cellKey);
          if (value === null || value === undefined) continue;
          if (String(value).toLowerCase().includes(query)) return true;
          if (isOptionColumnType(column.type)) {
            const label = resolveOptionDisplay(getColumnOptions(column), value).label;
            if (label && label.toLowerCase().includes(query)) return true;
          }
        }
        return false;
      });
    }

    // Apply sorting
    if (input.sorting && input.sorting.length > 0) {
      records = [...records].sort((a, b) => this.compareRecords(a, b, input.sorting!, columns, cellValues));
    }

    const totalFiltered = records.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const start = (page - 1) * pageSize;
    const pagedRecords = records.slice(start, start + pageSize);

    return {
      data: {
        board,
        columns,
        groups,
        records: pagedRecords,
        cellValues,
        totalRecords: baseData.data.totalRecords,
        filteredRecordCount: totalFiltered,
        page,
        pageSize,
        totalPages,
      },
      error: null,
      status: 200,
    };
  },

  /**
   * Hydrate records with their cell values as a flat object.
   */
  hydrateRecords(
    records: BoardRecord[],
    columns: ColumnDefinition[],
    cellValues: Map<string, ColumnValue>,
  ): HydratedRecord[] {
    return records.map((record) => {
      const cells: Record<string, ColumnValue> = {};
      for (const column of columns) {
        const key = `${record.id}:${column.id}`;
        cells[column.id] = cellValues.get(key) ?? column.defaultValue;
      }
      return { record, cells };
    });
  },

  /**
   * Get cell values for specific records and columns.
   */
  async loadCellValues(
    boardId: string,
    recordIds: string[],
    columnIds: string[],
  ): Promise<Map<string, ColumnValue>> {
    // In a production scenario, this would use a batched query.
    // For now, we fetch from the repository and build the map.
    const result = await cellRepo.findMany({ board_id: boardId });
    if (!result.data) return new Map();

    const map = new Map<string, ColumnValue>();
    for (const cell of result.data) {
      if (recordIds.includes(cell.recordId) && columnIds.includes(cell.columnId)) {
        map.set(`${cell.recordId}:${cell.columnId}`, cell.value);
      }
    }
    return map;
  },

  /**
   * Get default view for a board.
   */
  async getDefaultView(boardId: string): Promise<ApiResponse<BoardView | null>> {
    return viewRepo.findDefaultByBoard(boardId);
  },

  // ── Helpers ──────────────────────────────────────────────

  applyFilter(
    record: BoardRecord,
    filter: ViewFilter,
    cellValues: Map<string, ColumnValue>,
  ): boolean {
    const key = `${record.id}:${filter.columnId}`;
    const value = cellValues.get(key);

    if (filter.operator === "is_empty") return value === null || value === undefined || value === "";
    if (filter.operator === "not_empty") return value !== null && value !== undefined && value !== "";

    const filterValue = filter.value;
    if (filterValue === undefined) return true;

    switch (filter.operator) {
      case "eq": return value === filterValue;
      case "neq": return value !== filterValue;
      case "contains":
        return typeof value === "string" && typeof filterValue === "string"
          && value.toLowerCase().includes(filterValue.toLowerCase());
      case "gt": return typeof value === "number" && typeof filterValue === "number" && value > filterValue;
      case "gte": return typeof value === "number" && typeof filterValue === "number" && value >= filterValue;
      case "lt": return typeof value === "number" && typeof filterValue === "number" && value < filterValue;
      case "lte": return typeof value === "number" && typeof filterValue === "number" && value <= filterValue;
      case "in": {
        if (Array.isArray(filterValue)) {
          return filterValue.some((item) => item === value);
        }
        return false;
      }
      default: return true;
    }
  },

  compareRecords(
    a: BoardRecord,
    b: BoardRecord,
    sorting: ViewSort[],
    columns: ColumnDefinition[],
    cellValues: Map<string, ColumnValue>,
  ): number {
    for (const sort of sorting) {
      const col = columns.find((c) => c.id === sort.columnId);
      if (!col) continue;

      const aVal = cellValues.get(`${a.id}:${sort.columnId}`) ?? col.defaultValue;
      const bVal = cellValues.get(`${b.id}:${sort.columnId}`) ?? col.defaultValue;

      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""));
      }

      if (cmp !== 0) return sort.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  },
};

