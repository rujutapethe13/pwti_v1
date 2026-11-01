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
  UserPlus,
  Eye,
  Zap,
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
import { useScopeAccess } from "@/lib/members-client";
import { MembersAccessModal } from "@/components/shared/members-access-modal";
import { BoardSettingsDialog } from "@/components/shared/board-settings-dialog";
import { AutomationCenterModal } from "@/features/automations/automation-center-modal";
import type { BoardDefinition, ColumnDefinition } from "@/features/boards/engine/types";

interface BoardToolbarProps {
  board: BoardDefinition;
  onNewItem?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  importing?: boolean;
  exporting?: boolean;
  previewAsUserId?: string | null;
  onPreviewAsChange?: (userId: string | null) => void;
  columns?: ColumnDefinition[];
  groups?: any[];
}

export function BoardToolbar({ board, onNewItem, onImport, onExport, importing, exporting, previewAsUserId, onPreviewAsChange, columns, groups }: BoardToolbarProps) {
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);

  // A view user gets the read-only affordances: no new items, no inline writes,
  // no import, no automations. A `null` access means we could not resolve it at
  // all — a catalog board with no real workspace, or a failed lookup — so
  // nothing is disabled, because gating on "unknown" would turn a transient error
  // into a board somebody cannot use.
  const { access, canEdit, members } = useScopeAccess("board", board.workspaceId ?? null, board.id);
  const readOnly = access !== null && !canEdit;

  const itemLabel = board.name === "Production" ? "Batch" : board.name === "Video" ? "Cut" : board.name === "CGI" ? "Shot" : board.name === "Retouching" ? "Item" : "Item";

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background px-4 py-2">
      {/* ── New Item Button ────────────────────────────── */}
      <DropdownMenu open={showNewMenu} onOpenChange={setShowNewMenu}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-8 gap-1 text-xs font-medium" disabled={readOnly}>
            <Plus className="size-3.5" aria-hidden="true" />
            New {itemLabel}
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 z-[1000]">
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
        <DropdownMenuContent align="start" className="w-40 z-[1000]">
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
        <DropdownMenuContent align="start" className="w-48 z-[1000]">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Group by
          </DropdownMenuLabel>
          <DropdownMenuItem disabled={readOnly}>Status</DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly}>Person</DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly}>Date</DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly}>None</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

            {!readOnly && members && members.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 gap-1.5 text-xs font-medium",
                previewAsUserId && "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              )}
            >
              <Eye className="size-3.5" />
              <span>
                {previewAsUserId
                  ? `Preview: ${members.find((m) => m.user_id === previewAsUserId)?.name || "Client"}`
                  : "View as..."}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[1000]">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Simulate board as a specific member or client
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onPreviewAsChange?.(null)}
              className={cn(!previewAsUserId && "font-semibold text-primary")}
            >
              Default (Full Studio View)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {members.map((member) => (
              <DropdownMenuItem
                key={member.user_id}
                onClick={() => onPreviewAsChange?.(member.user_id)}
                className={cn(
                  "flex items-center justify-between text-xs cursor-pointer",
                  previewAsUserId === member.user_id && "bg-accent font-medium text-primary"
                )}
              >
                <span className="truncate">{member.name || member.email}</span>
                <span className="text-[10px] text-muted-foreground uppercase ml-1">
                  {member.role === "view" ? "Client" : member.role}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {readOnly && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" title="You have view-only access to this board">
          <Eye className="size-3" aria-hidden="true" />
          View only
        </span>
      )}

      {/* ── Overflow ───────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="More options">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 z-[1000]">
          {onImport && (
            <DropdownMenuItem
              onSelect={() => onImport()}
              disabled={importing || readOnly}
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
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>Board settings</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMembersOpen(true)}>
            <UserPlus className="mr-2 size-3.5" />
            Members
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={readOnly}
            onSelect={() => setAutomationsOpen(true)}
          >
            <Zap className="mr-2 size-3.5 text-amber-500" />
            Automations
          </DropdownMenuItem>
          <DropdownMenuItem>Integrations</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BoardSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        boardId={board.id}
        workspaceId={board.workspaceId}
        boardName={board.name}
        description={board.description}
      />

      <MembersAccessModal
        open={membersOpen}
        onOpenChange={setMembersOpen}
        scope={board.id ? { kind: "board", id: board.id } : null}
        workspaceId={board.workspaceId}
        subjectName={board.name}
      />

      <AutomationCenterModal
        open={automationsOpen}
        onOpenChange={setAutomationsOpen}
        boardId={board.id}
        boardName={board.name}
        columns={columns}
        groups={groups}
      />
    </div>
  );
}
