"use client";

import { useState } from "react";
import {
  ChevronDown,
  Search,
  User,
  Filter,
  ArrowUpDown,
  EyeOff,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  FileSpreadsheet,
  FileDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BoardDefinition } from "@/features/boards/engine/types";

interface BoardToolbarProps {
  board: BoardDefinition;
  onNewItem?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  importing?: boolean;
  exporting?: boolean;
}

export function BoardToolbar({ board, onNewItem, onImport, onExport, importing, exporting }: BoardToolbarProps) {
  const [showNewMenu, setShowNewMenu] = useState(false);

  const itemLabel = board.name === "Production" ? "Batch" : board.name === "Video" ? "Cut" : board.name === "CGI" ? "Shot" : board.name === "Retouching" ? "Item" : "Item";

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background px-4 py-2">
      {/* ── New Item Button ────────────────────────────── */}
      <DropdownMenu open={showNewMenu} onOpenChange={setShowNewMenu}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-8 gap-1 text-xs font-medium">
            <Plus className="size-3.5" aria-hidden="true" />
            New {itemLabel}
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Insert new {itemLabel.toLowerCase()}
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => { onNewItem?.(); setShowNewMenu(false); }}>
            At top of board
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { onNewItem?.(); setShowNewMenu(false); }}>
            At bottom of board
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { onNewItem?.(); setShowNewMenu(false); }}>
            From template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-4 w-px bg-border" />

      {/* ── Search ─────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="h-8 w-40 pl-8 text-xs"
        />
      </div>

      {/* ── Person Filter ──────────────────────────────── */}
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
        <User className="size-3.5" />
        <span className="hidden sm:inline">Person</span>
      </Button>

      {/* ── Filter ─────────────────────────────────────── */}
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
        <Filter className="size-3.5" />
        <span className="hidden sm:inline">Filter</span>
      </Button>

      {/* ── Sort ───────────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="size-3.5" />
            <span className="hidden sm:inline">Sort</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Sort by
          </DropdownMenuLabel>
          <DropdownMenuItem>Created date</DropdownMenuItem>
          <DropdownMenuItem>Last modified</DropdownMenuItem>
          <DropdownMenuItem>Name</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Hide Columns ───────────────────────────────── */}
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
        <EyeOff className="size-3.5" />
        <span className="hidden sm:inline">Hide</span>
      </Button>

      {/* ── Group by ───────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
            <LayoutTemplate className="size-3.5" />
            <span className="hidden sm:inline">Group by</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Group by
          </DropdownMenuLabel>
          <DropdownMenuItem>Status</DropdownMenuItem>
          <DropdownMenuItem>Person</DropdownMenuItem>
          <DropdownMenuItem>Date</DropdownMenuItem>
          <DropdownMenuItem>None</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* ── Overflow ───────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="More options">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onImport && (
            <DropdownMenuItem
              onSelect={() => onImport()}
              disabled={importing}
            >
              <FileSpreadsheet className="mr-2 size-3.5" />
              {importing ? "Importing…" : "Import from Excel/CSV"}
            </DropdownMenuItem>
          )}
          {onExport && (
            <DropdownMenuItem
              onSelect={() => onExport()}
              disabled={exporting}
            >
              <FileDown className="mr-2 size-3.5" />
              {exporting ? "Exporting…" : "Export to Excel"}
            </DropdownMenuItem>
          )}
          {(onImport || onExport) && <DropdownMenuSeparator />}
          <DropdownMenuItem>Board settings</DropdownMenuItem>
          <DropdownMenuItem>Automations</DropdownMenuItem>
          <DropdownMenuItem>Integrations</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
