"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Filter,
  RefreshCw,
  LayoutGrid,
  EyeOff,
  CalendarDays,
  Briefcase,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { searchClient360Action, getClient360InitialDataAction } from "@/features/client-360/actions";
import type { Client360SearchResult, Client360Filters, Client360Match } from "@/features/client-360/types";
import { STATUS_BUCKET_ORDER, SEARCH_DEBOUNCE_MS } from "@/features/client-360/constants";
import { exportToCsv } from "@/features/client-360/export";
import { CellRenderer } from "@/features/boards/engine/components/cell-renderer";
import { Client360SnapshotViewImpl } from "./client-360-snapshot-view-impl";
import { Client360PendingWorkView } from "./pending-work-view";
import { Client360DailyActivityView } from "./daily-activity-view";
import type { BoardDefinition, ColumnDefinition, BoardRecord, ColumnValue } from "@/features/boards/engine/types";

const PAGE_SIZE = 50;

interface Client360ViewProps {
  initialData?: {
    workspaces: Array<{ id: string; name: string }>;
    boards: Array<{ id: string; name: string; slug: string; workspaceId: string }>;
    clientColumns: Array<{ boardId: string; boardName: string; columnId: string; columnLabel: string; clientType?: string }>;
  };
  initialQuery?: string;
}

type StatusFilterState = Record<string, boolean>;

export function Client360View({ initialData, initialQuery }: Client360ViewProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [searchInput, setSearchInput] = useState(initialQuery ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Client360SearchResult | null>(null);
  const [page, setPage] = useState(1);
  const [clientTypeFilter, setClientTypeFilter] = useState<"all" | "recurring" | "non-recurring">("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("");
  const [boardFilter, setBoardFilter] = useState<string>("");
  const [statusFilters, setStatusFilters] = useState<StatusFilterState>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"search" | "day-range" | "pending-work" | "daily-activity">("search");

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const doSearchRef = useRef<(q: string, pageNum: number) => Promise<void>>(null as unknown as (q: string, pageNum: number) => Promise<void>);

  const workspaces = useMemo(() => initialData?.workspaces ?? [], [initialData]);
  const boards = useMemo(() => initialData?.boards ?? [], [initialData]);
  const clientColumns = useMemo(() => initialData?.clientColumns ?? [], [initialData]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    if (result?.statusBuckets) {
      for (const key of Object.keys(result.statusBuckets)) {
        statuses.add(key);
      }
    }
    return Array.from(statuses).sort((a, b) => {
      const idxA = STATUS_BUCKET_ORDER.indexOf(a);
      const idxB = STATUS_BUCKET_ORDER.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }, [result]);

  const filteredStatuses = useMemo(
    () => Object.entries(statusFilters).filter(([, v]) => v).map(([k]) => k),
    [statusFilters],
  );

  const buildFilters = useCallback((): Client360Filters => {
    const filters: Client360Filters = {};
    if (clientTypeFilter !== "all") filters.clientType = clientTypeFilter;
    if (workspaceFilter) filters.workspaceId = workspaceFilter;
    if (boardFilter) filters.boardId = boardFilter;
    if (filteredStatuses.length > 0) filters.status = filteredStatuses;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    return filters;
  }, [clientTypeFilter, workspaceFilter, boardFilter, filteredStatuses, dateFrom, dateTo]);

  const doSearch = useCallback(
    async (q: string, pageNum: number = 1) => {
      setLoading(true);
      try {
        const res = await searchClient360Action(q, {
          page: pageNum,
          pageSize: PAGE_SIZE,
          filters: buildFilters(),
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (res.data) {
          setResult(res.data);
          setPage(res.data.pagination.page);
          const newVisible = new Set(res.data.unifiedColumns.map((c) => c.id));
          setVisibleColumns(newVisible);
          setColumnOrder(res.data.unifiedColumns.map((c) => c.id));
        }
      } catch {
        toast.error("Search failed");
      } finally {
        setLoading(false);
      }
    },
    [buildFilters],
  );

  doSearchRef.current = doSearch;

  useEffect(() => {
    if (!initialData && !initialLoaded) {
      getClient360InitialDataAction().then((res) => {
        if (res.data && !initialLoaded) {
          setInitialLoaded(true);
        }
      });
    }
  }, [initialData, initialLoaded]);

  useEffect(() => {
    if (initialQuery && initialQuery.trim().length > 0 && !hasSearched) {
      setSearchInput(initialQuery);
      setQuery(initialQuery);
      setHasSearched(true);
    }
  }, [initialQuery, hasSearched]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchInput.trim().length > 0) {
      searchTimeoutRef.current = setTimeout(() => {
        setQuery(searchInput);
      }, SEARCH_DEBOUNCE_MS);
    } else {
      setResult(null);
      setQuery("");
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (query) {
      doSearchRef.current(query, 1);
    }
  }, [query, buildFilters]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      setQuery(searchInput);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    const lower = val.toLowerCase();
    if (lower.length > 0) {
      const uniqueSuggestions = Array.from(
        new Set(
          clientColumns
            .filter((c) => c.columnLabel.toLowerCase().includes(lower))
            .map((c) => c.columnLabel),
        ),
      ).slice(0, 8);
      setSuggestions(uniqueSuggestions);
      setShowSuggestions(uniqueSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchInput(suggestion);
    setShowSuggestions(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setQuery(suggestion);
  };

  const handleRefresh = () => {
    if (query) doSearchRef.current(query, page);
  };

  const handlePageChange = (newPage: number) => {
    if (query) doSearchRef.current(query, newPage);
  };

  const handleExport = () => {
    if (!result || result.matches.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Workspace", "Board", "Item", "Matched Column", "Match Type", "Cell Value", "Created", "Updated"];
    const rows = result.matches.map((m) => ({
      Workspace: m.workspaceName,
      Board: m.boardName,
      Item: m.recordTitle,
      MatchedColumn: m.matchedColumnLabel,
      MatchType: m.matchType,
      CellValue: m.cellValue ?? "",
      Created: m.createdAt,
      Updated: m.updatedAt,
    }));
    exportToCsv(headers, rows);
    toast.success("Exported to CSV");
  };

  const handleRowClick = (match: Client360Match) => {
    if (match.boardSlug) {
      window.location.href = `/${match.boardSlug}`;
    }
  };

  const handleToggleColumnVisibility = (columnId: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
  };

  const visibleUnifiedColumns = useMemo(() => {
    if (!result) return [];
    return result.unifiedColumns
      .filter((c) => visibleColumns.has(c.id))
      .sort((a, b) => {
        const idxA = columnOrder.indexOf(a.id);
        const idxB = columnOrder.indexOf(b.id);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
  }, [result, visibleColumns, columnOrder]);

  const displayMatches = useMemo(() => {
    if (!result) return [];
    return result.matches;
  }, [result]);

  const buildBoardObject = useCallback((match: Client360Match): BoardDefinition => ({
    id: match.boardId,
    organizationId: "",
    workspaceId: match.workspaceId,
    slug: match.boardSlug,
    name: match.boardName,
    description: "",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: [],
    createdAt: "",
    updatedAt: "",
  }), []);

  const buildColumnObject = useCallback((col: { id: string; label: string; type: string }, boardId: string): ColumnDefinition => ({
    id: col.id,
    boardId,
    key: col.label,
    label: col.label,
    type: col.type as ColumnDefinition["type"],
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
  }), []);

  const buildRecordObject = useCallback((match: Client360Match): BoardRecord => ({
    id: match.recordId,
    organizationId: "",
    workspaceId: match.workspaceId,
    boardId: match.boardId,
    title: match.recordTitle,
    status: "active",
    version: 1,
    archivedAt: null,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  }), []);

  return (
    <div className="space-y-4">
      {/* ── Day / Range sub-tabs ─────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setViewMode("search")}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
            viewMode === "search"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Search className="size-4" />
          Search
        </button>
        <button
          type="button"
          onClick={() => setViewMode("day-range")}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
            viewMode === "day-range"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarDays className="size-4" />
          Day / Range
        </button>
        <button
          type="button"
          onClick={() => setViewMode("daily-activity")}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
            viewMode === "daily-activity"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Briefcase className="size-4" />
          Daily Activity
        </button>
        <button
          type="button"
          onClick={() => setViewMode("pending-work")}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
            viewMode === "pending-work"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Briefcase className="size-4" />
          Pending Work
        </button>
      </div>

      {viewMode === "day-range" ? (
        <Client360SnapshotView />
      ) : viewMode === "daily-activity" ? (
        <Client360DailyActivityView />
      ) : viewMode === "pending-work" ? (
        <Client360PendingWorkView />
      ) : (
        <>
      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchInput}
            onChange={handleInputChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search clients across all boards..."
            className="pl-9 pr-4"
          />
          {showSuggestions && (
            <div className="absolute top-full left-0 right-0 z-[200] mt-1 rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent"
                  onClick={() => handleSuggestionClick(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading || !query}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Summary Chips */}
      {result && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <LayoutGrid className="size-3" />
            {result.workspacesMatched.length} workspace{result.workspacesMatched.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            {result.boardsMatched.length} board{result.boardsMatched.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            {result.totalItems} item{result.totalItems !== 1 ? "s" : ""}
          </Badge>
          {result.possibleMatchesCount > 0 && (
            <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300">
              {result.possibleMatchesCount} possible match{result.possibleMatchesCount !== 1 ? "es" : ""}
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Client type:</label>
            <select
              value={clientTypeFilter}
              onChange={(e) => setClientTypeFilter(e.target.value as "all" | "recurring" | "non-recurring")}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="recurring">Recurring</option>
              <option value="non-recurring">Non-recurring</option>
            </select>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{result.totalItems}</p>
          </Card>
          {STATUS_BUCKET_ORDER.map((bucket) => (
            <Card key={bucket} className="p-3">
              <p className="text-xs text-muted-foreground">{bucket}</p>
              <p className="text-lg font-semibold">{result.statusBuckets[bucket] ?? 0}</p>
            </Card>
          ))}
        </div>
      )}

      {/* No results found */}
      {result && result.totalItems === 0 && !loading && (
        <Card className="p-8 text-center">
          <Search className="mx-auto size-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-medium">No results found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No client matching &ldquo;{result.query}&rdquo; was found across your workspaces and boards.
          </p>
        </Card>
      )}

      {/* Filters */}
      {result && (
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="list-none">
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Filter className="size-3.5" />
                Filters
              </Button>
            </summary>
            <div className="absolute top-full left-0 z-[200] mt-1 w-80 rounded-lg bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Workspace</label>
                  <select
                    value={workspaceFilter}
                    onChange={(e) => setWorkspaceFilter(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">All workspaces</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Board</label>
                  <select
                    value={boardFilter}
                    onChange={(e) => setBoardFilter(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">All boards</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {availableStatuses.map((status) => (
                      <label key={status} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!statusFilters[status]}
                          onChange={(e) => {
                            setStatusFilters((prev) => {
                              const next = { ...prev };
                              if (e.target.checked) next[status] = true;
                              else delete next[status];
                              return next;
                            });
                          }}
                          className="rounded border-border"
                        />
                        {status}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </details>

          <DropdownMenu open={showColumnMenu} onOpenChange={setShowColumnMenu}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Settings2 className="size-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <EyeOff className="mr-2 size-3.5" />
                  Show / Hide columns
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {result?.unifiedColumns.map((col) => (
                    <DropdownMenuItem
                      key={col.id}
                      onSelect={() => handleToggleColumnVisibility(col.id)}
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.id)}
                        onChange={() => handleToggleColumnVisibility(col.id)}
                        className="mr-2"
                        readOnly
                      />
                      <div className="flex flex-col">
                        <span>{col.label}</span>
                        <span className="text-xs text-muted-foreground/60">{col.sourceBoardName}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowColumnMenu(false)}>
                Done
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Unified Table */}
      {result && visibleUnifiedColumns.length > 0 && displayMatches.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <div className="min-w-max">
              {/* Header */}
              <div
                className="sticky top-0 z-30 grid border-b border-border bg-white"
                style={{
                  gridTemplateColumns: `180px 180px ${visibleUnifiedColumns.map(() => "180px").join(" ")}`,
                }}
              >
                <div className="flex items-center border-r border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                  Workspace
                </div>
                <div className="flex items-center border-r border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                  Board
                </div>
                 {visibleUnifiedColumns.map((col) => (
                   <div
                     key={col.id}
                     className="flex items-center border-r border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground"
                   >
                     <span className="truncate">{col.label}</span>
                     <span className="ml-1 text-[8px] text-muted-foreground/60 uppercase">{col.type}</span>
                     <span className="ml-1 text-[8px] text-muted-foreground/60">({col.sourceBoardName})</span>
                   </div>
                 ))}
              </div>

              {/* Rows */}
              {displayMatches.map((match, rowIdx) => (
                <div
                  key={`${match.recordId}-${rowIdx}`}
                  className="grid border-b border-border hover:bg-accent/30 cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: `180px 180px ${visibleUnifiedColumns.map(() => "180px").join(" ")}`,
                  }}
                  onClick={() => handleRowClick(match)}
                >
                  <div className="px-3 py-2 border-r border-border text-sm truncate">
                    {match.workspaceName}
                  </div>
                  <div className="px-3 py-2 border-r border-border text-sm truncate">
                    {match.boardName}
                  </div>
                  {visibleUnifiedColumns.map((col) => {
                    const sourceColumnIds = col.sourceColumnIds.length > 0
                      ? col.sourceColumnIds
                      : [col.id.replace(/^unified-/, "")];
                    // A unified column can represent the same label/type
                    // across several boards. The row's cellValues map is
                    // keyed by the *source* column id of the board the row
                    // came from, so try every contributing id.
                    const isMatchedCol = !!match.matchedColumnId && sourceColumnIds.includes(match.matchedColumnId);
                    const cellText = sourceColumnIds
                      .map((cid) => match.cellValues[cid] ?? "")
                      .find((v) => v.length > 0) ?? "";
                    // Name-based fallback: if ID mapping fails (e.g. an imported
                    // board's column has a different internal ID), try resolving
                    // by column label.
                    const resolvedText = cellText || (match.cellValueByLabel?.[col.label.toLowerCase()] ?? "");
                    const value: ColumnValue = resolvedText || (isMatchedCol ? (match.cellValue ?? "") : "");
                    const board = buildBoardObject(match);
                    const column = buildColumnObject(col, match.boardId);
                    const record = buildRecordObject(match);
                    return (
                      <div
                        key={col.id}
                        className={cn(
                          "px-3 py-2 border-r border-border overflow-hidden",
                          isMatchedCol && "bg-accent/10",
                        )}
                      >
                        <CellRenderer
                          board={board}
                          column={column}
                          record={record}
                          value={value}
                          readOnly
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <Card className="p-12 text-center">
          <LayoutGrid className="mx-auto size-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium">Client 360 Search</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Enter a client name to search across all workspaces and boards.
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Pagination */}
      {result && result.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {result.pagination.page} of {result.pagination.totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm px-2">{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= result.pagination.totalPages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Export */}
      {result && result.matches.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      )}

  </>
  )}
  </div>
  );
}

export function Client360SnapshotView() {
  return <Client360SnapshotViewImpl />;
}

