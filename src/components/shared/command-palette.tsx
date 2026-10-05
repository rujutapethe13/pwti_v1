"use client";

/**
 * CommandPalette
 *
 * Visual-only ⌘K command palette dialog. No real search.
 * Opens via the header search button. Shows mock recent actions
 * and a search input that doesn't filter.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   const [open, setOpen] = useState(false);
 *   <CommandPalette open={open} onOpenChange={setOpen} />
 * ────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { Command, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { boards, quickCreateActions } from "@/config/navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Keyboard shortcut: ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] max-w-lg -translate-y-0 gap-0 p-0 sm:rounded-xl"
        aria-describedby="command-palette-description"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only" id="command-palette-description">
          Search for boards, actions, and settings
        </DialogDescription>

        {/* ── Search Input ─────────────────────────────── */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search boards, actions..."
            className="border-0 p-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline-flex items-center gap-0.5">
            <Command className="size-3" />
            K
          </kbd>
        </div>

        {/* ── Results (static) ─────────────────────────── */}
        <div className="max-h-72 overflow-y-auto p-2">
          {/* Boards */}
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Boards
          </p>
          {boards.slice(0, 5).map((board) => {
            const Icon = board.icon;
            return (
              <button
                key={board.id}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>{board.label}</span>
                {board.badge && (
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {board.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Quick Actions */}
          <p className="mt-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Quick Actions
          </p>
          {quickCreateActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>{action.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {action.description}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

