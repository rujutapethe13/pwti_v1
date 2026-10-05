"use client";

/**
 * Connect Board Column Modal
 *
 * Opened when a user chooses the "Connect Boards" column type while
 * adding a column. Captures the connect_board column settings:
 *   - connected_board_ids:  array of { workspace_id, board_id } pairs
 *   - allow_multiple_items: toggle
 *   - two_way_sync:         toggle
 *
 * Validation: at least one board must be selected before "Create"
 * is enabled.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, Search, AlertCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import type { ConnectedBoardColumnSettings } from "../types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface BoardEntry {
  workspace_id: string;
  board_id: string;
  board_name: string;
  workspace_name: string;
}

interface ConnectBoardColumnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (settings: ConnectedBoardColumnSettings) => void;
}

export function ConnectBoardColumnModal({
  open,
  onOpenChange,
  onConfirm,
}: ConnectBoardColumnModalProps) {
  const [boards, setBoards] = useState<BoardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedEntries, setSelectedEntries] = useState<BoardEntry[]>([]);
  const [allowMultipleItems, setAllowMultipleItems] = useState(false);
  const [twoWaySync, setTwoWaySync] = useState(false);
  const { activeWorkspace } = useWorkspace();

  const reset = () => {
    setQuery("");
    setSelectedEntries([]);
    setAllowMultipleItems(false);
    setTwoWaySync(false);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      const client = createClient();
      const [{ data: wsData, error: wsError }, { data: boardData, error: boardError }] =
        await Promise.all([
          client.from("workspaces").select("id, name"),
          client.from("boards").select("id, name, workspace_id, status").neq("status", "archived"),
        ]);

      if (cancelled) return;

      if (wsError) {
        console.error("[ConnectBoardColumnModal] workspaces query failed:", wsError);
      }
      if (boardError) {
        console.error("[ConnectBoardColumnModal] boards query failed:", boardError);
      }

      console.warn("[ConnectBoardColumnModal] raw board count:", boardData?.length ?? 0);

      if (boardError) {
        setError(boardError.message || "Failed to load boards");
        setBoards([]);
        setLoading(false);
        return;
      }

      const wsMap = new Map((wsData ?? []).map((w: { id: string; name: string }) => [w.id, w.name]));

      const entries: BoardEntry[] = (boardData ?? [])
        .filter((b: { status?: string }) => b.status === "active")
        .map((b: { id: string; name: string; workspace_id: string }) => ({
          workspace_id: b.workspace_id,
          board_id: b.id,
          board_name: b.name,
          workspace_name: wsMap.get(b.workspace_id) ?? "Unknown workspace",
        }))
        .sort((a, b) => a.board_name.localeCompare(b.board_name));

      setBoards(entries);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return boards;
    return boards.filter(
      (b) =>
        b.board_name.toLowerCase().includes(q) ||
        b.workspace_name.toLowerCase().includes(q),
    );
  }, [boards, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, BoardEntry[]>();
    for (const entry of filtered) {
      const key = entry.workspace_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [filtered]);

  const toggleEntry = (entry: BoardEntry) => {
    setSelectedEntries((prev) => {
      const idx = prev.findIndex(
        (e) => e.workspace_id === entry.workspace_id && e.board_id === entry.board_id,
      );
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, entry];
    });
  };

  const isSelected = (entry: BoardEntry) =>
    selectedEntries.some(
      (e) => e.workspace_id === entry.workspace_id && e.board_id === entry.board_id,
    );

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleCreate = () => {
    if (selectedEntries.length === 0) return;
    onConfirm({
      connected_board_ids: selectedEntries.map((e) => ({
        workspace_id: e.workspace_id,
        board_id: e.board_id,
      })),
      allow_multiple_items: allowMultipleItems,
      two_way_sync: twoWaySync,
      linked_column_id_on_other_board: null,
    });
    reset();
    onOpenChange(false);
  };

  const canCreate = selectedEntries.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            Connect Boards
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Board multi-select (searchable, grouped by workspace) */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Boards to connect
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search boards..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border border-border p-1">
              {loading && (
                <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading boards…
                </p>
              )}
              {error && !loading && (
                <div className="flex items-start gap-2 px-2 py-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {!loading && !error && filtered.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  No boards found.{" "}
                  {activeWorkspace && boards.length === 0
                    ? `No active boards in "${activeWorkspace.name}" or other accessible workspaces.`
                    : "Try adjusting your search."}
                </p>
              )}
              {!loading &&
                Array.from(grouped.entries()).map(([wsName, entries]) => (
                  <div key={wsName}>
                    <p className="px-2 pt-2 pb-1 text-xs font-medium uppercase text-muted-foreground">
                      {wsName}
                    </p>
                    {entries.map((entry) => {
                      const selected = isSelected(entry);
                      return (
                        <button
                          key={`${entry.workspace_id}:${entry.board_id}`}
                          type="button"
                          onClick={() => toggleEntry(entry)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <span
                            className={
                              "inline-flex size-4 items-center justify-center rounded border " +
                              (selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border")
                            }
                          >
                            {selected && <Check className="size-3" />}
                          </span>
                          <span className="truncate">{entry.board_name}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>
            {selectedEntries.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedEntries.length} board{selectedEntries.length !== 1 ? "s" : ""} selected.
              </p>
            )}
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <ToggleRow
              label="Allow linking to multiple items"
              checked={allowMultipleItems}
              onChange={setAllowMultipleItems}
            />
            <ToggleRow label="Two-way sync" checked={twoWaySync} onChange={setTwoWaySync} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
    >
      <span>{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        className={
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
          (checked ? "bg-primary" : "bg-muted")
        }
      >
        <span
          className={
            "inline-block size-4 transform rounded-full bg-white transition-transform " +
            (checked ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </span>
    </button>
  );
}
