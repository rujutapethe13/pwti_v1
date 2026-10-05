"use client";

/**
 * Connected Board Cell Renderer + Picker
 *
 * Renders linked items as chips and lets the user pick items to link.
 *
 * Cell value shape:
 *   { linked_item_ids: [{ workspace_id, board_id, item_id }, ...] }
 *
 * Column settings shape:
 *   { connected_board_ids: Array<{ workspace_id, board_id }>, allow_multiple_items: boolean, ... }
 *
 * Data sources:
 *   - Board names are fetched from the `boards` table by id.
 *   - Items come live from the `records` table for the selected board,
 *     re-fetched every time the picker opens or the board is switched.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import type { ColumnDefinition, ColumnValue, ConnectedBoardColumnValue, ConnectedBoardLinkItem } from "../../types";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type BoardItem = { id: string; title: string };

/** Kept for backward-compat with the (now-unused) RelationshipPicker. */
export interface LinkedRecord {
  id: string;
  boardId: string;
  title?: string;
}
type ConnectedBoardEntry = { workspace_id: string; board_id: string };

// ── Helpers ───────────────────────────────────────────────

function getLinkedItems(value: ColumnValue): ConnectedBoardLinkItem[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "linked_item_ids" in value
  ) {
    const arr = (value as unknown as ConnectedBoardColumnValue).linked_item_ids;
    return Array.isArray(arr) ? (arr as ConnectedBoardLinkItem[]) : [];
  }
  return [];
}

function getConnectedBoardEntries(column: ColumnDefinition): ConnectedBoardEntry[] {
  const settings = (column.settings ?? {}) as Record<string, unknown>;
  const ids = settings.connected_board_ids;
  if (!Array.isArray(ids)) return [];
  if (ids.length === 0) return [];
  if (typeof ids[0] === "string") {
    return (ids as string[]).map((boardId) => ({ workspace_id: "", board_id: boardId }));
  }
  return ids as ConnectedBoardEntry[];
}

// ── Picker ────────────────────────────────────────────────

interface ConnectBoardPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectedBoards: ConnectedBoardEntry[];
  allowMultiple: boolean;
  linkedItems: ConnectedBoardLinkItem[];
  onSelect: (next: ConnectedBoardLinkItem[]) => void;
  items: BoardItem[];
  loading: boolean;
  activeBoardId: string;
  onActiveBoardChange: (boardId: string) => void;
  boardName: (boardId: string) => string;
}

function ConnectBoardPicker({
  open,
  onOpenChange,
  connectedBoards,
  allowMultiple,
  linkedItems,
  onSelect,
  items,
  loading,
  activeBoardId,
  onActiveBoardChange,
  boardName,
}: ConnectBoardPickerProps) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((r) => r.title.toLowerCase().includes(q));
  }, [items, query]);

  const isLinked = useCallback(
    (itemId: string) =>
      linkedItems.some(
        (it) => it.board_id === activeBoardId && it.item_id === itemId,
      ),
    [linkedItems, activeBoardId],
  );

  const toggleItem = useCallback(
    (itemId: string) => {
      const alreadyLinked = linkedItems.some(
        (it) => it.board_id === activeBoardId && it.item_id === itemId,
      );
      let next: ConnectedBoardLinkItem[];
      if (alreadyLinked) {
        next = linkedItems.filter(
          (it) => !(it.board_id === activeBoardId && it.item_id === itemId),
        );
      } else if (allowMultiple) {
        next = [...linkedItems, { board_id: activeBoardId, item_id: itemId, workspace_id: "" }];
      } else {
        next = [
          ...linkedItems.filter((it) => it.board_id !== activeBoardId),
          { board_id: activeBoardId, item_id: itemId, workspace_id: "" },
        ];
      }
      onSelect(next);
    },
    [linkedItems, activeBoardId, allowMultiple, onSelect],
  );

  if (connectedBoards.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link records</DialogTitle>
          </DialogHeader>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No connected boards configured for this column.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle>Link records</DialogTitle>
        </DialogHeader>

        {/* Board switcher (only when multiple boards are connected) */}
        {connectedBoards.length > 1 && (
          <div className="flex flex-wrap gap-1 border-b border-border px-4 pb-3">
            {connectedBoards.map((entry) => (
              <button
                key={entry.board_id}
                type="button"
                onClick={() => onActiveBoardChange(entry.board_id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  entry.board_id === activeBoardId
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {boardName(entry.board_id)}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${boardName(activeBoardId)}...`}
            className="h-9"
            autoFocus
          />
          {query && (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setQuery("")}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Item list */}
        <div className="flex max-h-[50vh] flex-1 flex-col gap-1 overflow-y-auto px-2">
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading items…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Search className="size-5" />
              No items yet.
            </div>
          )}
          {filteredItems.map((item) => {
            const linked = isLinked(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm",
                  linked ? "bg-accent/50" : "hover:bg-accent",
                )}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium">
                  {item.title?.slice(0, 2).toUpperCase() ?? "??"}
                </div>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {item.title}
                </span>
                {linked && <X className="size-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        <DialogFooter className="border-t px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {linkedItems.length} linked
          </div>
          <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cell renderer ─────────────────────────────────────────

export function ConnectedBoardCellRenderer({
  value,
  column,
  recordId,
  boardId,
  organizationId,
  workspaceId,
  readOnly,
  onChange,
}: CellRendererComponentProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string>("");
  const [boardRecords, setBoardRecords] = useState<Record<string, BoardItem[]>>({});
  const [boardNames, setBoardNames] = useState<Record<string, string>>({});
  const [loadingRecords, setLoadingRecords] = useState(false);

  const settings = (column.settings ?? {}) as Record<string, unknown>;
  const connectedBoards = getConnectedBoardEntries(column);
  const allowMultiple = Boolean(settings.allow_multiple_items ?? true);

  const linkedItems = useMemo(() => getLinkedItems(value), [value]);

  // Fetch board names for all connected boards
  const loadBoardNames = useCallback(async (boardIds: string[]) => {
    const uniqueIds = Array.from(new Set(boardIds));
    if (uniqueIds.length === 0) return;
    const { data } = await supabase
      .from("boards")
      .select("id, name")
      .in("id", uniqueIds);
    if (data) {
      const map: Record<string, string> = {};
      for (const b of data as { id: string; name: string }[]) {
        map[b.id] = b.name;
      }
      setBoardNames((prev) => ({ ...prev, ...map }));
    }
  }, []);

  // Fetch live items for a board straight from the records table.
  const loadRecords = useCallback(async (targetBoardId: string) => {
    if (!targetBoardId) return;
    setLoadingRecords(true);
    try {
      const { data } = await supabase
        .from("records")
        .select("id, title, board_id")
        .eq("board_id", targetBoardId)
        .order("created_at", { ascending: true });
      setBoardRecords((prev) => ({
        ...prev,
        [targetBoardId]: (data ?? []).map((r) => ({ id: r.id, title: r.title })),
      }));
    } catch {
      // Leave previous data in place on failure.
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const boardName = useCallback(
    (id: string) => boardNames[id] ?? id,
    [boardNames],
  );

  const recordTitle = useCallback(
    (id: string, itemId: string) => boardRecords[id]?.find((r) => r.id === itemId)?.title ?? itemId.slice(0, 8),
    [boardRecords],
  );

  // Resolve titles for already-linked items (so chips show real names).
  useEffect(() => {
    const boardIds = Array.from(new Set(linkedItems.map((i) => i.board_id)));
    boardIds.forEach((b) => void loadRecords(b));
    void loadBoardNames(boardIds);
  }, [linkedItems, loadRecords, loadBoardNames]);

  // Reset/select the active board when the picker opens.
  useEffect(() => {
    if (pickerOpen && (!activeBoardId || !connectedBoards.some((e) => e.board_id === activeBoardId))) {
      setActiveBoardId(connectedBoards[0]?.board_id ?? "");
    }
  }, [pickerOpen, activeBoardId, connectedBoards]);

  useEffect(() => {
    if (pickerOpen && activeBoardId) void loadRecords(activeBoardId);
  }, [pickerOpen, activeBoardId, loadRecords]);

  const emit = useCallback(
    (next: ConnectedBoardLinkItem[]) => {
      onChange?.({ linked_item_ids: next } as unknown as ColumnValue);
    },
    [onChange],
  );

  const handleUnlink = useCallback(
    (item: ConnectedBoardLinkItem) => {
      emit(
        linkedItems.filter(
          (it) => !(it.board_id === item.board_id && it.item_id === item.item_id),
        ),
      );
    },
    [linkedItems, emit],
  );

  const canPick = connectedBoards.length > 0 && !readOnly;
  const activeItems = boardRecords[activeBoardId] ?? [];

  const renderPicker = () =>
    pickerOpen && canPick ? (
      <ConnectBoardPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        connectedBoards={connectedBoards}
        allowMultiple={allowMultiple}
        linkedItems={linkedItems}
        onSelect={emit}
        items={activeItems}
        loading={loadingRecords}
        activeBoardId={activeBoardId}
        onActiveBoardChange={(id) => setActiveBoardId(id)}
        boardName={boardName}
      />
    ) : null;

  if (linkedItems.length === 0) {
    if (readOnly) {
      return <span className="text-sm text-muted-foreground italic">—</span>;
    }
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="mr-1 size-3" />
          Link
        </Button>
        {renderPicker()}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 max-w-full">
      {linkedItems.map((item) => (
        <Badge
          key={`${item.board_id}:${item.item_id}`}
          variant="secondary"
          className="flex items-center gap-1 text-xs"
          title={`${boardName(item.board_id)} · ${recordTitle(item.board_id, item.item_id)}`}
        >
          <span className="max-w-[160px] truncate">
            {recordTitle(item.board_id, item.item_id)}
          </span>
          <ExternalLink className="size-3 shrink-0 opacity-60" />
          {!readOnly && (
            <button
              type="button"
              aria-label="Unlink"
              onClick={(e) => {
                e.stopPropagation();
                handleUnlink(item);
              }}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-3" />
        </Button>
      )}
      {renderPicker()}
    </div>
  );
}
