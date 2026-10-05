"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Settings2,
  Sparkles,
  Filter,
  ArrowUpDown,
  ArrowLeftRight,
  Copy,
  Plus,
  Trash2,
  EyeOff,
  Columns,
  Text,
  User,
  Calendar,
  Tag,
  Hash,
  Link2,
  Table2,
  Pencil,
  MoreHorizontal,
  LayoutTemplate,
  Lock,
  X,
  Check,
  ChevronDown,
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
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/features/boards/engine";
import { ColumnSettingsPanel } from "@/features/boards/engine/components/column-settings-panel";
import { columnTypeRegistry } from "@/features/boards/engine/column-registry";
import type { ColumnDefinition, ColumnValue, ConnectedBoardColumnSettings } from "@/features/boards/engine/types";
import { cn } from "@/lib/utils";
import { ColumnTypePicker, ENABLED_TYPES } from "@/features/boards/engine/components/column-type-picker";
import { ConnectBoardColumnModal } from "@/features/boards/engine/components/connect-board-column-modal";
import type { ColumnTypeKey } from "@/features/boards/engine/types";

interface ColumnContextMenuProps {
  column: ColumnDefinition;
  onRename?: (columnId: string, label: string) => void;
  onDuplicate?: (columnId: string) => void;
  onDuplicateWithValues?: (columnId: string) => void;
  onToggleHidden?: (columnId: string) => void;
  onToggleFrozen?: (columnId: string) => void;
  onChangeType?: (columnId: string, type: ColumnTypeKey) => void;
  onDelete?: (columnId: string) => void;
  onAddColumn?: (type: ColumnTypeKey, afterColumnId?: string, settings?: Record<string, unknown>) => void;
  onUpdateColumnSettings?: (columnId: string, patch: Partial<ColumnDefinition>) => void;
  onFilter?: (columnId: string) => void;
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  onCollapse?: (columnId: string) => void;
  onWrapText?: (columnId: string) => void;
  onGroupBy?: (columnId: string) => void;
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  onAddDescription?: (columnId: string, description: string) => void;
  onToggleRestrictEditing?: (columnId: string) => void;
  onToggleRestrictView?: (columnId: string) => void;
  onSetFilter?: (columnId: string, operator: string, value: ColumnValue) => void;
  onClearFilter?: (columnId: string) => void;
  onToggleCollapse?: (columnId: string) => void;
  columnDescription?: string;
  restrictEditing?: boolean;
  restrictView?: boolean;
  isFiltered?: boolean;
  isCollapsed?: boolean;
  isWrapped?: boolean;
}

const FILTER_OPERATORS: Record<string, Array<{ value: string; label: string }>> = {
  text: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  long_text: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  number: [
    { value: "equals", label: "Equals" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lte", label: "Less than or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  currency: [
    { value: "equals", label: "Equals" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lte", label: "Less than or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  date: [
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "on", label: "On" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  timeline: [
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  status: [
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  priority: [
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  dropdown: [
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  multi_select: [
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  checkbox: [
    { value: "is_true", label: "Is checked" },
    { value: "is_false", label: "Is unchecked" },
  ],
  person: [
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  email: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  phone: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  url: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  tags: [
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  files: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  rating: [
    { value: "equals", label: "Equals" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  progress: [
    { value: "equals", label: "Equals" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  connected_board: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  mirror: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  lookup: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  rollup: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  ai_field: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  button: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  time_tracking: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
};

function getColumnOptions(column: ColumnDefinition): Array<{ id: string; label: string; color?: string }> {
  const settingsOptions = (column.settings?.options as Array<{ id: string; label: string; color?: string }>) || null;
  const registryOptions = columnTypeRegistry[column.type]?.defaultOptions || null;
  return settingsOptions || (registryOptions?.map((opt) => ({ ...opt })) ?? []);
}

function getFilterPlaceholder(operator: string): string {
  switch (operator) {
    case "contains":
    case "starts_with":
    case "ends_with":
    case "equals":
      return "Enter value...";
    case "gt":
    case "lt":
    case "gte":
    case "lte":
      return "Enter number...";
    case "before":
    case "after":
    case "on":
      return "Enter date...";
    default:
      return "Enter value...";
  }
}

function isValueRequired(operator: string): boolean {
  return !["is_empty", "not_empty", "is_true", "is_false"].includes(operator);
}

export function ColumnContextMenu({
  column,
  onRename,
  onDuplicate,
  onDuplicateWithValues,
  onToggleHidden,
  onToggleFrozen,
  onChangeType,
  onDelete,
  onAddColumn,
  onFilter,
  onSort,
  onCollapse,
  onWrapText,
  onGroupBy,
  sortColumnId,
  sortDirection,
  onAddDescription,
  onToggleRestrictEditing,
  onToggleRestrictView,
  onSetFilter,
  onClearFilter,
  onUpdateColumnSettings,
  onToggleCollapse,
  columnDescription,
  restrictEditing,
  restrictView,
  isFiltered,
  isCollapsed,
  isWrapped,
}: ColumnContextMenuProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(column.label);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [connectBoardOpen, setConnectBoardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(columnDescription || "");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOperator, setFilterOperator] = useState<string>("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [filterMultiSelect, setFilterMultiSelect] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renameOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renameOpen]);

  useEffect(() => {
    if (descriptionOpen) {
      setDescriptionValue(columnDescription || "");
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [descriptionOpen, columnDescription]);

  const handleRenameConfirm = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== column.label) {
      onRename?.(column.id, trimmed);
    }
    setRenameOpen(false);
  }, [renameValue, column.label, column.id, onRename]);

  const handleDescriptionConfirm = useCallback(() => {
    onAddDescription?.(column.id, descriptionValue);
    setDescriptionOpen(false);
  }, [descriptionValue, column.id, onAddDescription]);

  const handleSortClick = useCallback(
    (direction: "asc" | "desc") => {
      if (!onSort) return;
      onSort(column.id, direction);
    },
    [column.id, onSort],
  );

  const handleFilterApply = useCallback(() => {
    if (!onSetFilter) return;
    const operators = FILTER_OPERATORS[column.type] || [];
    const selectedOp = filterOperator || operators[0]?.value || "contains";
    let value: ColumnValue = filterValue;
    if (selectedOp === "is_one_of") {
      const opts = getColumnOptions(column);
      if (opts.length > 0) {
        if (filterMultiSelect.size === 0) return;
        // Cells for option-based columns store the option *id*; some legacy
        // or imported cells still hold the label. Pass BOTH so the filter
        // matches regardless of what the cell stores.
        value = opts
          .filter((o) => filterMultiSelect.has(o.id))
          .flatMap((o) => [o.id, o.label]);
      } else {
        if (!filterValue.trim()) return;
        value = [filterValue.trim()];
      }
    } else if (isValueRequired(selectedOp) && !filterValue.trim()) {
      return;
    } else if (selectedOp === "is_true") {
      value = true;
    } else if (selectedOp === "is_false") {
      value = false;
    }
    onSetFilter(column.id, selectedOp, value);
    setFilterOpen(false);
    setFilterValue("");
    setFilterMultiSelect(new Set());
    setFilterOperator("");
  }, [column.id, column.type, filterOperator, filterValue, filterMultiSelect, onSetFilter]);

  const handleFilterClear = useCallback(() => {
    onClearFilter?.(column.id);
    setFilterOpen(false);
    setFilterValue("");
    setFilterMultiSelect(new Set());
    setFilterOperator("");
  }, [column.id, onClearFilter]);

  const handleFilterToggle = useCallback(() => {
    if (isFiltered) {
      handleFilterClear();
    } else {
      setFilterOpen(true);
      const operators = FILTER_OPERATORS[column.type] || [];
      setFilterOperator(operators[0]?.value || "contains");
    }
  }, [isFiltered, column.type, handleFilterClear]);

  const operators = FILTER_OPERATORS[column.type] || [];
  const columnOptions = getColumnOptions(column);
  const needsValueInput = filterOperator ? isValueRequired(filterOperator) : false;

  const getSortLabel = (direction: "asc" | "desc"): string => {
    if (["number", "currency", "rating", "progress"].includes(column.type)) {
      return direction === "asc" ? "Sort ascending (0→9)" : "Sort descending (9→0)";
    }
    if (["date", "timeline"].includes(column.type)) {
      return direction === "asc" ? "Sort ascending (oldest→newest)" : "Sort descending (newest→oldest)";
    }
    return direction === "asc" ? "Sort ascending (A→Z)" : "Sort descending (Z→A)";
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-6 shrink-0 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
            <span className="sr-only">Column menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* ── Settings ───────────────────────────────── */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings2 className="mr-2 size-3.5" />
              Settings
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => setDescriptionOpen(true)}>
                <Pencil className="mr-2 size-3.5" />
                Add column description
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="mr-2 size-3.5" />
                Edit column settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onToggleRestrictEditing?.(column.id)}>
                <Lock className={cn("mr-2 size-3.5", restrictEditing && "fill-primary")} />
                {restrictEditing ? "Restrict column editing (on)" : "Restrict column editing"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onToggleRestrictView?.(column.id)}>
                <EyeOff className={cn("mr-2 size-3.5", restrictView && "fill-primary")} />
                {restrictView ? "Restrict column view (on)" : "Restrict column view"}
              </DropdownMenuItem>
              <DropdownMenuItem disabled onSelect={() => {}}>
                <Columns className="mr-2 size-3.5" />
                Save column as template
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── AI-powered actions (section label) ─────── */}
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            AI-powered actions
          </DropdownMenuLabel>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Sparkles className="mr-2 size-3.5" />
              Autofill this column
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => {}}>Fill empty cells</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {}}>Suggest values based on pattern</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {}}>Auto-generate from context</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── Filter ─────────────────────────────────── */}
          <DropdownMenuItem onSelect={handleFilterToggle}>
            <Filter className={cn("mr-2 size-3.5", isFiltered && "text-primary")} />
            {isFiltered ? "Filter (active)" : "Filter"}
          </DropdownMenuItem>

          {/* ── Sort ───────────────────────────────────── */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDown className="mr-2 size-3.5" />
              Sort
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => handleSortClick("asc")}>
                {getSortLabel("asc")}
                {sortColumnId === column.id && sortDirection === "asc" && (
                  <Check className="ml-auto size-3.5" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleSortClick("desc")}>
                {getSortLabel("desc")}
                {sortColumnId === column.id && sortDirection === "desc" && (
                  <Check className="ml-auto size-3.5" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem disabled onSelect={() => {}}>
                Add subsort (Ctrl+Click)
              </DropdownMenuItem>
              <DropdownMenuItem disabled onSelect={() => {}}>
                Save order of items
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* ── Collapse ───────────────────────────────── */}
          <DropdownMenuItem onSelect={() => onToggleCollapse?.(column.id)}>
            <ArrowLeftRight className="mr-2 size-3.5" />
            {isCollapsed ? "Expand column" : "Collapse"}
          </DropdownMenuItem>

          {/* ── Wrap text ──────────────────────────────── */}
          <DropdownMenuItem onSelect={() => onWrapText?.(column.id)}>
            <Text className={cn("mr-2 size-3.5", isWrapped && "fill-primary")} />
            {isWrapped ? "Wrap text (on)" : "Wrap text"}
          </DropdownMenuItem>

          {/* ── Group by ───────────────────────────────── */}
          <DropdownMenuItem onSelect={() => onGroupBy?.(column.id)}>
            <LayoutTemplate className="mr-2 size-3.5" />
            Group by
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* ── Duplicate column ───────────────────────── */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Copy className="mr-2 size-3.5" />
              Duplicate column
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => onDuplicate?.(column.id)}>
                Column only
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDuplicateWithValues?.(column.id)}>
                Column and cell values
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── Add column to the right ────────────────── */}
<DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus className="mr-2 size-3.5" />
              Add column to the right
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onAddColumn?.("text", column.id)}>
                  <Text className="mr-2 size-3.5" />
                  Text
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddColumn?.("number", column.id)}>
                  <Hash className="mr-2 size-3.5" />
                  Numbers
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddColumn?.("date", column.id)}>
                  <Calendar className="mr-2 size-3.5" />
                  Date
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddColumn?.("status", column.id)}>
                  <Tag className="mr-2 size-3.5" />
                  Status
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddColumn?.("person", column.id)}>
                  <User className="mr-2 size-3.5" />
                  People
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setConnectBoardOpen(true)}>
                  <Link2 className="mr-2 size-3.5" />
                  Connected board
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddColumn?.("mirror", column.id)}>
                  <Table2 className="mr-2 size-3.5" />
                  Mirror column
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAddColumnOpen(true)}>
                <Plus className="mr-2 size-3.5" />
                More columns...
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── Change column type ─────────────────────── */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowLeftRight className="mr-2 size-3.5" />
              Change column type
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {ENABLED_TYPES.map((type) => {
                const def = columnTypeRegistry[type];
                return (
                  <DropdownMenuItem
                    key={type}
                    disabled={type === column.type}
                    onSelect={() => onChangeType?.(column.id, type)}
                  >
                    {def.label}
                    {type === column.type && (
                      <Check className="ml-auto size-3.5" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* ── Column extensions (stub) ──────────────── */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Sparkles className="mr-2 size-3.5" />
              Column extensions
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem disabled onSelect={() => {}}>
                No extensions installed
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* ── Rename ─────────────────────────────────── */}
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil className="mr-2 size-3.5" />
            Rename
          </DropdownMenuItem>

          {/* ── Delete ─────────────────────────────────── */}
          {onDelete && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-2 size-3.5" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Rename Dialog ────────────────────────────── */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename column</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConfirm();
                if (e.key === "Escape") setRenameOpen(false);
              }}
              placeholder="Column label"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameConfirm}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Description Dialog ──────────────────────── */}
      <Dialog open={descriptionOpen} onOpenChange={setDescriptionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add column description</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              ref={inputRef}
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDescriptionConfirm();
                if (e.key === "Escape") setDescriptionOpen(false);
              }}
              placeholder="Describe this column..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescriptionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDescriptionConfirm}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Filter Dialog ───────────────────────────── */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Filter by {column.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Condition</label>
              <div className="relative">
                <select
                  value={filterOperator}
                  onChange={(e) => {
                    setFilterOperator(e.target.value);
                    setFilterValue("");
                    setFilterMultiSelect(new Set());
                  }}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm appearance-none"
                >
                  {operators.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {needsValueInput && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Value</label>
                {filterOperator === "is_one_of" && columnOptions.length > 0 ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {columnOptions.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={filterMultiSelect.has(opt.id)}
                          onChange={(e) => {
                            const next = new Set(filterMultiSelect);
                            if (e.target.checked) {
                              next.add(opt.id);
                            } else {
                              next.delete(opt.id);
                            }
                            setFilterMultiSelect(next);
                          }}
                          className="rounded border-border"
                        />
                        <span
                          className="inline-flex size-2.5 rounded-full"
                          style={{ backgroundColor: opt.color || "#94a3b8" }}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <Input
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    placeholder={getFilterPlaceholder(filterOperator)}
                    type={["before", "after", "on"].includes(filterOperator) ? "date" : ["gt", "lt", "gte", "lte", "equals"].includes(filterOperator) ? "number" : "text"}
                  />
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            {isFiltered && (
              <Button variant="outline" onClick={handleFilterClear}>
                <X className="mr-1.5 size-3.5" />
                Clear
              </Button>
            )}
            <Button
              onClick={handleFilterApply}
              disabled={
                needsValueInput &&
                (filterOperator === "is_one_of"
                  ? columnOptions.length > 0
                    ? filterMultiSelect.size === 0
                    : !filterValue.trim()
                  : !filterValue.trim())
              }
            >
              <Check className="mr-1.5 size-3.5" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────── */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete column"
        description={`Are you sure you want to delete "${column.label}"? This will permanently remove the column and all its values across all records.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onDelete?.(column.id);
        }}
      />

      {/* ── Add Column Picker ───────────────────────── */}
      <ColumnTypePicker
        open={addColumnOpen}
        onOpenChange={(open) => setAddColumnOpen(open)}
        onSelect={(type) => {
          if (type === "connected_board") {
            setConnectBoardOpen(true);
          } else {
            onAddColumn?.(type, column.id);
          }
        }}
      />

      {/* ── Connect Board Column Modal ──────────────── */}
      <ConnectBoardColumnModal
        open={connectBoardOpen}
        onOpenChange={setConnectBoardOpen}
        onConfirm={(settings: ConnectedBoardColumnSettings) =>
          onAddColumn?.("connected_board", column.id, settings as unknown as Record<string, unknown>)
        }
      />

      {/* ── Column Settings Dialog (reopen) ──────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Column settings</DialogTitle>
          </DialogHeader>
          <ColumnSettingsPanel
            column={column}
            definition={columnTypeRegistry[column.type]}
            onChange={(next) => onUpdateColumnSettings?.(column.id, next)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
