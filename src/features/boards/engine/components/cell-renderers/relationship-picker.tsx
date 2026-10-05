"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Plus, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { LinkedRecord } from "./connected-board-cell";

export interface PickerRecord {
  id: string;
  title: string;
  subtitle?: string;
  groupName?: string;
  status?: string;
}

interface RelationshipPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetBoardId: string;
  organizationId: string;
  workspaceId: string;
  linkedRecords: LinkedRecord[];
  onSelect: (records: LinkedRecord[]) => void;
  allowMultiple?: boolean;
  allowCreateNew?: boolean;
}

export function RelationshipPicker({
  open,
  onOpenChange,
  targetBoardId,
  organizationId,
  workspaceId,
  linkedRecords,
  onSelect,
  allowMultiple = true,
  allowCreateNew = true,
}: RelationshipPickerProps) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<PickerRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIds(new Set(linkedRecords.map((r) => r.id)));
      setActiveIndex(0);
      searchInputRef.current?.focus();
    }
  }, [open, linkedRecords]);

  const loadRecords = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          boardId: targetBoardId,
          organizationId,
          workspaceId,
          query: searchQuery,
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(`/api/connected-data/picker?${params}`);
        const json = await res.json();
        if (json.data) {
          const items: PickerRecord[] = json.data.records ?? [];
          setRecords(items);
        }
      } catch {
        // keep previous records on error
      } finally {
        setLoading(false);
      }
    },
    [targetBoardId, organizationId, workspaceId],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      loadRecords(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, loadRecords]);

  const visibleRecords = useMemo(() => records, [records]);

  const toggleSelection = useCallback(
    (recordId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(recordId)) {
          next.delete(recordId);
        } else if (allowMultiple) {
          next.add(recordId);
        } else {
          next.clear();
          next.add(recordId);
        }
        return next;
      });
      setActiveIndex((prev) => Math.max(0, Math.min(visibleRecords.length - 1, prev)));
    },
    [allowMultiple, visibleRecords.length],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onOpenChange(false);
        return;
      }
      onOpenChange(true);
    },
    [onOpenChange],
  );

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    const selected = records.filter((r) => selectedIds.has(r.id));
    const mapped: LinkedRecord[] = selected.map((r) => ({ id: r.id, title: r.title, boardId: targetBoardId }));
    onSelect(mapped);
    onOpenChange(false);
    setSubmitting(false);
  }, [selectedIds, records, targetBoardId, onSelect, onOpenChange]);

  const handleCreateNew = useCallback(async () => {
    const title = query.trim();
    if (!title) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/connected-data/picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: targetBoardId, organizationId, workspaceId, title }),
      });
      const json = await res.json();
      if (json.data) {
        const newRecord: LinkedRecord = { id: json.data.id, title: json.data.title, boardId: targetBoardId };
        onSelect([...linkedRecords, newRecord]);
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  }, [query, targetBoardId, organizationId, workspaceId, linkedRecords, onSelect, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(visibleRecords.length - 1, prev + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < visibleRecords.length) {
          toggleSelection(visibleRecords[activeIndex].id);
        }
        return;
      }
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [visibleRecords, activeIndex, toggleSelection, onOpenChange],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, PickerRecord[]> = { Favorites: [], Recent: [], All: [] };
    for (const r of visibleRecords) {
      groups.All.push(r);
      if (recentIds.has(r.id)) groups.Recent.push(r);
      if (favoriteIds.has(r.id)) groups.Favorites.push(r);
    }
    return groups;
  }, [visibleRecords, recentIds, favoriteIds]);

  const renderRecord = (record: PickerRecord, index: number) => {
    const checked = selectedIds.has(record.id);
    const isActive = index === activeIndex;
    return (
      <button
        key={record.id}
        type="button"
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => toggleSelection(record.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm",
          isActive && "bg-accent",
          checked && "border-primary/40 bg-accent/40",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium">
          {record.title?.slice(0, 2).toUpperCase() ?? "??"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground">{record.title ?? "Untitled"}</div>
          {record.subtitle && <div className="truncate text-xs text-muted-foreground">{record.subtitle}</div>}
        </div>
        {checked && <Check className="size-4 shrink-0 text-primary" />}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle>Link records</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 pb-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search records..."
            className="h-9"
          />
          {query && (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setQuery("")}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        <div ref={listRef} className="flex max-h-[50vh] flex-1 flex-col overflow-hidden px-2">
          {loading && records.length === 0 && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Searching...
            </div>
          )}

          {!loading && records.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Search className="size-5" />
              No records found.
            </div>
          )}

          <div className="flex flex-col gap-1 overflow-y-auto">
            {grouped.Favorites.length > 0 && (
              <div className="px-2 pt-2">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                  <Star className="size-3.5" /> Favorites
                </div>
                <div className="flex flex-col gap-1">
                  {grouped.Favorites.map((r, idx) => renderRecord(r, idx))}
                </div>
              </div>
            )}

            {grouped.Recent.length > 0 && (
              <div className="px-2 pt-2">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                  <ArrowRight className="size-3.5" /> Recent
                </div>
                <div className="flex flex-col gap-1">
                  {grouped.Recent.map((r, idx) => renderRecord(r, idx))}
                </div>
              </div>
            )}

            {query === "" && grouped.Favorites.length === 0 && grouped.Recent.length === 0 && (
              <div className="px-2 pt-1 text-xs text-muted-foreground">All records</div>
            )}

            {records.map((r, idx) => renderRecord(r, idx))}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              Loading more...
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `${records.length} record${records.length === 1 ? "" : "s"}`}
          </div>
          <div className="flex items-center gap-2">
            {allowCreateNew && (
              <Button variant="outline" size="sm" onClick={handleCreateNew} disabled={submitting || !query.trim()}>
                <Plus className="mr-2 size-3.5" />
                Create new
              </Button>
            )}
            <Button variant="default" size="sm" onClick={handleConfirm} disabled={submitting || selectedIds.size === 0}>
              {submitting && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              Link
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
