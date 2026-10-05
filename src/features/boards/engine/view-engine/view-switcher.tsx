"use client";

/**
 * ViewSwitcher
 *
 * Full-featured view tab bar supporting:
 * - Tab-style view switching
 * - "Add View" dropdown
 * - Per-view actions: rename, duplicate, favorite, delete, set default
 * - Drag-and-drop reorder
 *
 * ── Design ─────────────────────────────────────────────────
 * Follows the premium design language: editorial typography, calm
 * semantic colors, soft shadows, restrained accent usage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Copy,
  EllipsisVertical,
  Heart,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "../components/confirm-dialog";

import type { BoardView } from "../types";
import { viewCatalog } from "../registry";
import { useViewTabActions } from "./use-view-tab-actions";

// ── Props ──────────────────────────────────────────────────

interface ViewSwitcherProps {
  views: BoardView[];
  activeViewId: string | null;
  onViewChange: (viewId: string) => void;
  onCreateView?: (data: { name: string; type: string }) => Promise<void>;
  onUpdateView?: (viewId: string, data: Partial<BoardView>) => Promise<void>;
  onDuplicateView?: (viewId: string) => Promise<void>;
  onDeleteView?: (viewId: string) => Promise<void>;
  onSetDefaultView?: (viewId: string) => Promise<void>;
  onFavoriteView?: (viewId: string, favorite: boolean) => Promise<void>;
  onReorderViews?: (viewIds: string[]) => Promise<void>;
  className?: string;
}

// ── Sortable Tab ───────────────────────────────────────────

function SortableTab({
  view,
  isActive,
  isDefault,
  onSelect,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onRenameStart,
  onRenameConfirm,
  onRenameCancel,
  onDuplicate,
  onDelete,
  onSetDefault,
  onToggleFavorite,
}: {
  view: BoardView;
  isActive: boolean;
  isDefault: boolean;
  onSelect: () => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameStart: (viewId: string, name: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onToggleFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: view.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const catalogEntry = viewCatalog.find((v) => v.id === view.type);
  const Icon = catalogEntry?.icon;
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        aria-selected={isActive}
        onClick={onSelect}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          isActive
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        {...attributes}
        {...listeners}
      >
        {Icon && <Icon className="size-3.5" aria-hidden="true" />}
        {isRenaming ? (
          <Input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => onRenameValueChange?.(e.target.value)}
            onBlur={onRenameConfirm}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRenameConfirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onRenameCancel();
              }
            }}
            className="h-6 w-32 px-1.5 py-0.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="max-w-[120px] truncate">{view.name}</span>
        )}
        {isDefault && (
          <Star className="size-3 fill-amber-400 text-amber-400" aria-label="Default view" />
        )}
      </button>

      {/* Per-view actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100",
              "rounded p-0.5 text-muted-foreground hover:text-foreground",
            )}
            aria-label={`${view.name} actions`}
          >
            <EllipsisVertical className="size-3" />
          </button>
        </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onRenameStart(view.id, view.name)}>
            <Pencil className="mr-2 size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="mr-2 size-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleFavorite}>
            <Heart className="mr-2 size-3.5" />
            {view.isDefault ? "Remove favorite" : "Favorite"}
          </DropdownMenuItem>
          {!isDefault && (
            <DropdownMenuItem onSelect={onSetDefault}>
              <Star className="mr-2 size-3.5" />
              Set as default
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── ViewSwitcher ───────────────────────────────────────────

export function ViewSwitcher({
  views,
  activeViewId,
  onViewChange,
  onCreateView,
  onUpdateView,
  onDuplicateView,
  onDeleteView,
  onSetDefaultView,
  onFavoriteView,
  onReorderViews,
  className,
}: ViewSwitcherProps) {
  const [showNewViewDialog, setShowNewViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState("table");

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
    onRenameView: onUpdateView
      ? (viewId, name) => onUpdateView(viewId, { name })
      : async () => {},
    onDuplicateView: onDuplicateView ?? (async () => {}),
    onDeleteView: onDeleteView ?? (async () => {}),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = views.findIndex((v) => v.id === active.id);
      const newIndex = views.findIndex((v) => v.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...views];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      onReorderViews?.(reordered.map((v) => v.id));
    },
    [views, onReorderViews],
  );

  const handleCreateView = useCallback(async () => {
    if (!newViewName.trim()) return;
    await onCreateView?.({ name: newViewName.trim(), type: newViewType });
    setNewViewName("");
    setShowNewViewDialog(false);
  }, [newViewName, newViewType, onCreateView]);

  const nonTableViews = viewCatalog.filter(
    (v) => v.id !== "table" && !v.placeholder,
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Tabs */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={views.map((v) => v.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
            role="tablist"
            aria-label="Board views"
          >
            {views.map((view) => (
              <SortableTab
                key={view.id}
                view={view}
                isActive={view.id === activeViewId}
                isDefault={view.isDefault}
                onSelect={() => onViewChange(view.id)}
                isRenaming={renamingViewId === view.id}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onRenameStart={handleStartRename}
                onRenameConfirm={handleConfirmRename}
                onRenameCancel={handleCancelRename}
                onDuplicate={() => handleDuplicate(view.id)}
                onDelete={() => setDeleteConfirmViewId(view.id)}
                onSetDefault={() => onSetDefaultView?.(view.id)}
                onToggleFavorite={() => onFavoriteView?.(view.id, !view.isDefault)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add View Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Plus className="size-3.5" />
            <span className="sr-only">Add view</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {nonTableViews.map((viewType) => {
            const Icon = viewType.icon;
            return (
              <DropdownMenuItem
                key={viewType.id}
                onSelect={() => {
                  setNewViewType(viewType.id);
                  setNewViewName(viewType.label);
                  setShowNewViewDialog(true);
                }}
              >
                <Icon className="mr-2 size-3.5" />
                {viewType.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create View Dialog */}
      <Dialog open={showNewViewDialog} onOpenChange={setShowNewViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">View type</label>
              <p className="text-sm text-muted-foreground capitalize">
                {newViewType}
              </p>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewViewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateView}>Create</Button>
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

