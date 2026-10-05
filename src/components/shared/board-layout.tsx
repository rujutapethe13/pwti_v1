"use client";

import { cn } from "@/lib/utils";
import { getBoardDefinition, type BoardView, type ColumnDefinition } from "@/features/boards/engine";
import { ViewTabs } from "@/components/shared/view-tabs";
import { BoardToolbar } from "@/components/shared/board-toolbar";
import type { BoardDefinition } from "@/features/boards/engine/types";

interface BoardLayoutProps {
  boardId: string;
  board?: BoardDefinition;
  description?: string;
  children: React.ReactNode;
  className?: string;
  onNewItem?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  importing?: boolean;
  exporting?: boolean;
  views: BoardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onRenameView?: (viewId: string, name: string) => Promise<void>;
  onDuplicateView?: (viewId: string) => Promise<void>;
  onDeleteView?: (viewId: string) => Promise<void>;
  onCreateView?: (data: { type: string; name?: string; settings?: Record<string, unknown> }) => void;
  columns?: ColumnDefinition[];
}

export function BoardLayout({
  boardId,
  board,
  description,
  children,
  className,
  onNewItem,
  onImport,
  onExport,
  importing,
  exporting,
  views,
  activeViewId,
  onViewChange,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  onCreateView,
  columns,
}: BoardLayoutProps) {
  const catalogBoard = getBoardDefinition(boardId);
  const boardDefinition = board ?? catalogBoard;

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", className)}>
      {/* ── View Tabs ─────────────────────────────────── */}
      <ViewTabs
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onRenameView={onRenameView ?? (async () => {})}
        onDuplicateView={onDuplicateView ?? (async () => {})}
        onDeleteView={onDeleteView ?? (async () => {})}
        columns={columns}
      />

      {/* ── Toolbar ───────────────────────────────────── */}
      {boardDefinition && (
        <BoardToolbar
          board={boardDefinition}
          onNewItem={onNewItem}
          onImport={onImport}
          onExport={onExport}
          importing={importing}
          exporting={exporting}
        />
      )}

      {/* ── Content ────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
