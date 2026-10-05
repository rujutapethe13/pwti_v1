"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { viewCatalog, type BoardView, type ColumnDefinition } from "@/features/boards/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/features/boards/engine/components/confirm-dialog";
import { buildDefaultDashboardSettings } from "@/features/boards/engine/view-engine/views/dashboard/default-dashboard-template";
import { Plus, MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react";
import { useViewTabActions } from "@/features/boards/engine/view-engine/use-view-tab-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ── View types that are fully implemented ──
const IMPLEMENTED_VIEWS = new Set(["table", "calendar", "kanban", "dashboard"]);

// ── View types that are planned but not yet built ──
const PLANNED_VIEWS = new Set(["chart", "gallery", "timeline", "form", "map", "gantt", "docs"]);

interface ViewTabsProps {
  views: BoardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onCreateView?: (data: { type: string; name?: string; settings?: Record<string, unknown> }) => void;
  onRenameView: (viewId: string, name: string) => Promise<void>;
  onDuplicateView: (viewId: string) => Promise<void>;
  onDeleteView: (viewId: string) => Promise<void>;
  className?: string;
  columns?: ColumnDefinition[];
}

export function ViewTabs({
  views,
  activeViewId,
  onViewChange,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  className,
  columns,
}: ViewTabsProps) {
  const {
    renamingViewId,
    renameValue,
    setRenameValue,
    deleteConfirmViewId,
    setDeleteConfirmViewId,
    deleting,
    handleStartRename,
    handleConfirmRename,
    handleCancelRename,
    handleDuplicate,
    handleDeleteConfirm,
  } = useViewTabActions({
    onRenameView,
    onDuplicateView,
    onDeleteView,
  });

  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingViewId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingViewId]);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newViewType, setNewViewType] = useState("");
  const [newViewName, setNewViewName] = useState("");
  const [newViewDateColumn, setNewViewDateColumn] = useState("");

  const dateColumns = (columns ?? []).filter((c) => c.type === "date" || c.type === "timeline");

  const handleOpenCreate = (viewTypeId: string) => {
    const catalogEntry = viewCatalog.find((v) => v.id === viewTypeId);
    setNewViewType(viewTypeId);
    setNewViewName(catalogEntry?.label ?? viewTypeId);
    setNewViewDateColumn(dateColumns[0]?.id ?? "");
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = () => {
    if (!newViewType) return;
    const settings: Record<string, unknown> = {};
    if (newViewType === "calendar") {
      settings.dateColumnId = newViewDateColumn;
      settings.selectedDateColumns = newViewDateColumn ? [newViewDateColumn] : [];
    }
    if (newViewType === "dashboard") {
      // Seed the column role mapping from header names and lay out the default
      // template. The mapping dialog then opens once, on first render, so the
      // user can correct any wrong suggestion. Existing dashboards are never
      // touched — this only runs on creation.
      Object.assign(settings, buildDefaultDashboardSettings(columns ?? []));
    }
    onCreateView?.({ type: newViewType, name: newViewName.trim() || undefined, settings });
    setShowCreateDialog(false);
    setNewViewName("");
    setNewViewDateColumn("");
  };

  const handleDoubleClickRename = (viewId: string, currentName: string) => {
    handleStartRename(viewId, currentName);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 border-b border-border bg-background px-4",
        className,
      )}
      role="tablist"
      aria-label="View modes"
    >
      {views.map((view) => {
        const catalogEntry = viewCatalog.find((v) => v.id === view.type);
        const Icon = catalogEntry?.icon;
        const isActive = view.id === activeViewId;
        const isRenaming = renamingViewId === view.id;

        return (
          <div key={view.id} className="flex items-center gap-0.5">
            <button
              role="tab"
              aria-selected={isActive}
              aria-label={catalogEntry?.description ?? view.name}
              onClick={() => isRenaming ? null : onViewChange(view.id)}
              onDoubleClick={() => handleDoubleClickRename(view.id, view.name)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isActive
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {Icon && <Icon className="size-3.5" aria-hidden="true" />}
              {isRenaming ? (
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleConfirmRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      handleCancelRename();
                    }
                  }}
                  className="h-6 w-32 px-1.5 py-0.5 text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span>{view.name}</span>
              )}
            </button>

            {/* View tab overflow menu */}
            {isActive && !isRenaming && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="View options"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onSelect={() => handleStartRename(view.id, view.name)}>
                    <Pencil className="mr-2 size-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleDuplicate(view.id)}>
                    <Copy className="mr-2 size-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setDeleteConfirmViewId(view.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {/* Add view button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label="Add view"
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Add view
          </DropdownMenuLabel>
          {viewCatalog.map((viewType) => {
            const Icon = viewType.icon;
            const isImplemented = IMPLEMENTED_VIEWS.has(viewType.id);
            const isPlanned = PLANNED_VIEWS.has(viewType.id);
            const isDisabled = !isImplemented && !isPlanned;
            const alreadyAdded = views.some((v) => v.type === viewType.id);

            return (
              <DropdownMenuItem
                key={viewType.id}
                disabled={isDisabled}
                onSelect={() => {
                  if (isImplemented) {
                    handleOpenCreate(viewType.id);
                  } else if (isPlanned) {
                    import("sonner").then(({ toast }) => {
                      toast(`${viewType.label} view coming soon`);
                    });
                  }
                }}
              >
                <Icon className={cn("mr-2 size-3.5", !isImplemented && "opacity-50")} />
                <span className={cn(isImplemented ? "text-foreground" : "text-muted-foreground")}>{viewType.label}</span>
                {alreadyAdded && isImplemented && (
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
                    Added
                  </span>
                )}
                {!isImplemented && (
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
                    Coming soon
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create view dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new {newViewType} view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="view-name" className="text-sm font-medium text-foreground">
                Name
              </label>
              <Input
                id="view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="My View"
                autoFocus
              />
            </div>
            {newViewType === "calendar" && (
              <div className="space-y-2">
                <label htmlFor="view-date-column" className="text-sm font-medium text-foreground">
                  Date column
                </label>
                {dateColumns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No date columns found. Add a date column to use Calendar view.
                  </p>
                ) : (
                  <select
                    id="view-date-column"
                    value={newViewDateColumn}
                    onChange={(e) => setNewViewDateColumn(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {dateColumns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirmViewId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmViewId(null)}
        title="Delete this view?"
        description="This cannot be undone. The view configuration (filters, sort, columns, settings) will be permanently removed, but your board data and records will remain intact."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleting}
      />
    </div>
  );
}
