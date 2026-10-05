"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Share2,
  Settings2,
  Bot,
  MessageSquare,
  UserPlus,
  MoreHorizontal,
  Pencil,
  ArrowLeftRight,
  Trash2,
  Copy,
  Download,
  FileSpreadsheet,
  ChevronDown,
  Menu,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { mockUser } from "@/config/navigation";
import type { BoardDefinition } from "@/features/boards/engine/types";
import { renameBoard as renameBoardAction } from "@/features/boards/engine/actions";
import { useWorkspace } from "@/lib/workspace-context";
import { FavoriteStar } from "@/components/shared/favorite-star";
import { Client360SearchInput } from "@/features/client-360/client-360-search-input";
import { exportBoardToExcel, openImportWizard } from "@/features/boards/engine/lib/import-export-events";

interface BoardTopBarProps {
  board: BoardDefinition;
  onMenuClick?: () => void;
  onRename?: (name: string) => void;
}

export function BoardTopBar({ board, onMenuClick, onRename }: BoardTopBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(board.name);
  const [localName, setLocalName] = useState(board.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { renameBoard } = useWorkspace();

  useEffect(() => {
    setLocalName(board.name);
  }, [board.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleNameClick = useCallback(() => {
    setEditName(localName);
    setIsEditing(true);
  }, [localName]);

  const handleNameBlur = useCallback(async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== localName) {
      const formData = new FormData();
      formData.set("boardId", board.id);
      formData.set("name", trimmed);
      formData.set("updateSlug", "false");
      const response = await renameBoardAction(formData);
      if (!response.error) {
        setLocalName(trimmed);
        onRename?.(trimmed);
        renameBoard(board.id, trimmed);
      }
    }
    setIsEditing(false);
  }, [editName, board.id, localName, onRename, renameBoard]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleNameBlur();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setEditName(localName);
      }
    },
    [handleNameBlur, localName],
  );

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6"
      role="banner"
    >
      {/* ── Mobile Menu ──────────────────────────────── */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      {/* ── Board Name Dropdown ──────────────────────── */}
      <div className="flex items-center gap-2">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="h-8 w-48 text-sm font-medium"
          />
        ) : (
          <button
            onClick={handleNameClick}
            className="group flex items-center gap-1 text-left text-lg font-semibold transition-colors hover:text-primary"
          >
            <span className="truncate">{localName}</span>
            <ChevronDown className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
       </div>

      {/* ── Star (favorite) Toggle ────────────────────── */}
      <FavoriteStar
        itemId={board.id}
        itemType="board"
        isFavorited={board.favorite}
        variant="topBar"
      />

      <div className="flex-1" />

      {/* ── Right Actions ────────────────────────────── */}
      <div className="flex items-center gap-1">
        <Client360SearchInput />

        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <span className="hidden sm:inline">Integrate</span>
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <span className="hidden sm:inline">Automate</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium">0</span>
        </Button>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Agents">
                <Bot className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agents</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Comments">
                <MessageSquare className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Comments</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs">
          <UserPlus className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Invite</span>
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-medium">0</span>
        </Button>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Share">
                <Share2 className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ── Overflow Menu ────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={openImportWizard}>
              <FileSpreadsheet className="mr-2 size-3.5" />
              Import from Excel/CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportBoardToExcel}>
              <Download className="mr-2 size-3.5" />
              Export to Excel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Settings2 className="mr-2 size-3.5" />
                Settings
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>General</DropdownMenuItem>
                <DropdownMenuItem>Permissions</DropdownMenuItem>
                <DropdownMenuItem>Integrations</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 size-3.5" />
              Delete board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
