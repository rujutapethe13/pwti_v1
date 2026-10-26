"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  viewCatalog,
  type BoardView,
  type ColumnDefinition,
} from "@/features/boards/engine";
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
import { Plus, MoreHorizontal, Pencil, Copy, Trash2, X } from "lucide-react";
import { useViewTabActions } from "@/features/boards/engine/view-engine/use-view-tab-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── View types that are fully implemented ──
const IMPLEMENTED_VIEWS = new Set(["table", "calendar", "kanban", "dashboard"]);

// ── View types that are planned but not yet built ──
const PLANNED_VIEWS = new Set([
  "chart",
  "gallery",
  "timeline",
  "form",
  "map",
  "gantt",
  "docs",
]);

// ── Create-view dialog design tokens (monday.com) ───────────
const DIALOG_FONT =
  'var(--font-inter, "Inter"), "DM Sans", Roboto, system-ui, -apple-system, "Segoe UI", sans-serif';
const DIALOG_TEXT = "#323338";
const DIALOG_MUTED = "#676879";
const DIALOG_BORDER = "#C3C6D4";
const DIALOG_ACCENT = "#0073EA";

interface ViewTabsProps {
  views: BoardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onCreateView?: (data: {
    type: string;
    name?: string;
    settings?: Record<string, unknown>;
  }) => void;
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
  const nameInputRef = useRef<HTMLInputElement>(null);

  const dateColumns = (columns ?? []).filter(
    (c) => c.type === "date" || c.type === "timeline",
  );

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
      settings.mode = "month";
      settings.weekStart = 0;
    }
    if (newViewType === "dashboard") {
      // Seed the column role mapping from header names and lay out the default
      // template. The mapping dialog then opens once, on first render, so the
      // user can correct any wrong suggestion. Existing dashboards are never
      // touched — this only runs on creation.
      Object.assign(settings, buildDefaultDashboardSettings(columns ?? []));
    }
    onCreateView?.({
      type: newViewType,
      name: newViewName.trim() || undefined,
      settings,
    });
    setShowCreateDialog(false);
    setNewViewName("");
    setNewViewDateColumn("");
  };

  const handleCreateDialogChange = (open: boolean) => {
    setShowCreateDialog(open);
    if (!open) {
      setNewViewName("");
      setNewViewDateColumn("");
    }
  };

  /**
   * Enter submits the dialog. Radix renders the Select trigger with
   * `role="combobox"`, its listbox with `role="listbox"` and the
   * options with `role="option"`; all of them own the Enter key, so
   * they are excluded here to avoid submitting while a dropdown is
   * being operated.
   */
  const handleCreateDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.getAttribute("role") === "combobox") return;
    if (
      target.closest(
        '[role="listbox"], [role="option"], [data-radix-popper-content-wrapper]',
      )
    ) {
      return;
    }
    event.preventDefault();
    handleConfirmCreate();
  };

  const handleDoubleClickRename = (viewId: string, currentName: string) => {
    handleStartRename(viewId, currentName);
  };

  return (
    <div
      className={cn(
        "border-border bg-background flex shrink-0 items-center gap-0.5 border-b px-4",
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
              onClick={() => (isRenaming ? null : onViewChange(view.id))}
              onDoubleClick={() => handleDoubleClickRename(view.id, view.name)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all duration-150",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                isActive
                  ? "border-primary text-foreground border-b-2"
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
                    className="text-muted-foreground hover:text-foreground size-6 shrink-0"
                    aria-label="View options"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onSelect={() => handleStartRename(view.id, view.name)}
                  >
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
            className="text-muted-foreground hover:text-foreground size-8"
            aria-label="Add view"
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
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
                <span
                  className={cn(
                    isImplemented ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {viewType.label}
                </span>
                {alreadyAdded && isImplemented && (
                  <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[8px] font-medium">
                    Added
                  </span>
                )}
                {!isImplemented && (
                  <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[8px] font-medium">
                    Coming soon
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create view dialog */}
      <Dialog open={showCreateDialog} onOpenChange={handleCreateDialogChange}>
        <DialogContent
          className="max-w-[440px] gap-0 p-6 [&>button]:hidden"
          style={{
            backgroundColor: "#ffffff",
            border: "none",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.24)",
            fontFamily: DIALOG_FONT,
            fontSize: "14px",
            color: DIALOG_TEXT,
          }}
          onKeyDown={handleCreateDialogKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const input = nameInputRef.current;
            if (!input) return;
            input.focus();
            input.select();
          }}
        >
          <DialogHeader className="mb-4 flex-row items-center justify-between gap-4 space-y-0 text-left">
            <DialogTitle
              className="text-[20px] leading-6 font-semibold tracking-normal"
              style={{ color: DIALOG_TEXT, fontFamily: DIALOG_FONT }}
            >
              Create new {newViewType} view
            </DialogTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={() => handleCreateDialogChange(false)}
              className="-mt-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-[#F1F2F5]"
              style={{ color: DIALOG_MUTED }}
            >
              <X className="size-4" />
            </button>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="view-name"
                className="text-[13px] leading-4"
                style={{ color: DIALOG_MUTED, fontFamily: DIALOG_FONT }}
              >
                Name
              </label>
              <input
                id="view-name"
                ref={nameInputRef}
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="My View"
                className="h-10 w-full rounded-[4px] border bg-white px-3 text-[14px] transition-[border-color,box-shadow] outline-none"
                style={{
                  borderColor: DIALOG_BORDER,
                  color: DIALOG_TEXT,
                  fontFamily: DIALOG_FONT,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = DIALOG_ACCENT;
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0, 115, 234, 0.18)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = DIALOG_BORDER;
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {newViewType === "calendar" && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="view-date-column"
                  className="text-[13px] leading-4"
                  style={{ color: DIALOG_MUTED, fontFamily: DIALOG_FONT }}
                >
                  Date column
                </label>
                {dateColumns.length === 0 ? (
                  <p
                    className="text-[13px]"
                    style={{ color: DIALOG_MUTED, fontFamily: DIALOG_FONT }}
                  >
                    Add a date column to use the calendar view.
                  </p>
                ) : (
                  <Select value={newViewDateColumn} onValueChange={setNewViewDateColumn}>
                    <SelectTrigger
                      id="view-date-column"
                      className="h-10 rounded-[4px] border-[#C3C6D4] px-3 text-[14px] shadow-none focus:border-[#0073EA] focus:ring-2 focus:ring-[#0073EA] focus:ring-offset-0"
                      style={{
                        borderColor: DIALOG_BORDER,
                        color: DIALOG_TEXT,
                        fontFamily: DIALOG_FONT,
                      }}
                    >
                      <SelectValue placeholder="Select a date column" />
                    </SelectTrigger>
                    <SelectContent style={{ fontFamily: DIALOG_FONT }}>
                      {dateColumns.map((col) => (
                        <SelectItem key={col.id} value={col.id}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 flex-row items-center justify-end gap-2 sm:space-x-2">
            <button
              type="button"
              onClick={() => handleCreateDialogChange(false)}
              className="h-10 rounded-[4px] border bg-white px-4 text-[14px] font-medium transition-colors"
              style={{
                borderColor: DIALOG_BORDER,
                color: DIALOG_TEXT,
                fontFamily: DIALOG_FONT,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F7F8FA";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ffffff";
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCreate}
              className="h-10 rounded-[4px] px-4 text-[14px] font-medium text-white transition-colors"
              style={{ backgroundColor: DIALOG_ACCENT, fontFamily: DIALOG_FONT }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0063C7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = DIALOG_ACCENT;
              }}
            >
              Create
            </button>
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
