"use client";

/**
 * Kanban Settings Panel
 *
 * Right-side slide-out panel with accordion sections for configuring
 * the Kanban view. Includes Kanban Column selector, Divide by options,
 * card customization, and display toggles.
 */

import { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Settings2,
  GripVertical,
  Check,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { KanbanViewSettings, ColumnDefinition } from "../../types";

// ── Props ──────────────────────────────────────────────────

interface KanbanSettingsPanelProps {
  settings: KanbanViewSettings;
  columns: ColumnDefinition[];
  groups: Array<{ id: string; name: string; color?: string }>;
  onSettingsChange: (settings: Partial<KanbanViewSettings>) => void;
  onClose: () => void;
}

// ── Section IDs ─────────────────────────────────────────────

type SectionId = "kanbanColumn" | "divideBy" | "customizeCard";

// ── Component ───────────────────────────────────────────────

export function KanbanSettingsPanel({
  settings,
  columns,
  groups: _groups,
  onSettingsChange,
  onClose,
}: KanbanSettingsPanelProps) {
  const [expandedSection, setExpandedSection] = useState<SectionId | null>("kanbanColumn");

  const statusColumns = columns.filter((c) => c.type === "status");
  const selectedStatusColumn = columns.find((c) => c.id === settings.groupBy.columnId);

  const toggleSection = (section: SectionId) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const handleColumnSelect = (columnId: string) => {
    onSettingsChange({
      groupBy: { ...settings.groupBy, columnId },
    });
  };

  const handleDivideByToggle = (enabled: boolean) => {
    onSettingsChange({
      divideBy: { ...settings.divideBy, enabled },
    });
  };

  const handleDivideByPrimaryTypeChange = (type: "status" | "group") => {
    onSettingsChange({
      divideBy: {
        ...settings.divideBy,
        primaryType: type,
        primaryColumnId: type === "group" ? "" : settings.divideBy.primaryColumnId,
        secondaryType: type === "group" ? "status" : "group",
        secondaryColumnId: type === "group"
          ? (statusColumns[0]?.id || "")
          : settings.divideBy.secondaryColumnId,
      },
    });
  };

  const handleDivideBySecondaryTypeChange = (type: "status" | "group" | null) => {
    onSettingsChange({
      divideBy: {
        ...settings.divideBy,
        secondaryType: type,
        secondaryColumnId: type === "status" ? (statusColumns[0]?.id || "") : "",
      },
    });
  };

  const handleDivideByPrimaryColumnChange = (columnId: string) => {
    onSettingsChange({
      divideBy: { ...settings.divideBy, primaryColumnId: columnId },
    });
  };

  const handleDivideBySecondaryColumnChange = (columnId: string) => {
    onSettingsChange({
      divideBy: { ...settings.divideBy, secondaryColumnId: columnId },
    });
  };

  const handleCardFieldToggle = (columnId: string) => {
    const newFields = settings.cardFields.includes(columnId)
      ? settings.cardFields.filter((id) => id !== columnId)
      : [...settings.cardFields, columnId];
    onSettingsChange({ cardFields: newFields });
  };

  const handleCardFieldRemove = (columnId: string) => {
    onSettingsChange({ cardFields: settings.cardFields.filter((id) => id !== columnId) });
  };

  const handleCardFieldReorder = (fromIndex: number, toIndex: number) => {
    const newFields = [...settings.cardFields];
    const [moved] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, moved);
    onSettingsChange({ cardFields: newFields });
  };

  // ── Drag-and-drop state ──────────────────────────────────
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleColDragStart = useCallback((colId: string) => (e: React.DragEvent) => {
    setDraggedColId(colId);
    setDraggedFieldIndex(null);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", colId);
  }, []);

  const handleFieldDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDraggedFieldIndex(index);
    setDraggedColId(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handlePreviewDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedColId ? "copy" : "move";
  }, [draggedColId]);

  const handlePreviewDrop = useCallback(() => {
    if (draggedColId) {
      handleCardFieldToggle(draggedColId);
    } else if (draggedFieldIndex !== null && dragOverIndex !== null && draggedFieldIndex !== dragOverIndex) {
      handleCardFieldReorder(draggedFieldIndex, dragOverIndex);
    }
    setDraggedColId(null);
    setDraggedFieldIndex(null);
    setDragOverIndex(null);
  }, [draggedColId, draggedFieldIndex, dragOverIndex, handleCardFieldToggle, handleCardFieldReorder]);

  const handleFieldDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedFieldIndex !== null && draggedFieldIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedFieldIndex]);

  const handleTrashDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleTrashDrop = useCallback(() => {
    if (draggedFieldIndex !== null) {
      const fieldId = settings.cardFields[draggedFieldIndex];
      handleCardFieldRemove(fieldId);
    }
    setDraggedFieldIndex(null);
    setDragOverIndex(null);
    setDraggedColId(null);
  }, [draggedFieldIndex, settings.cardFields, handleCardFieldRemove]);

  const handleDragEnd = useCallback(() => {
    setDraggedColId(null);
    setDraggedFieldIndex(null);
    setDragOverIndex(null);
  }, []);

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-xs font-semibold text-foreground">Widget settings</h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close settings">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Kanban Column ────────────────────────────────── */}
        <SectionHeader
          title="Kanban Column"
          icon={<Columns3 className="size-4" />}
          expanded={expandedSection === "kanbanColumn"}
          onClick={() => toggleSection("kanbanColumn")}
        />
        {expandedSection === "kanbanColumn" && (
          <div className="px-4 mt-3 pb-4 space-y-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-xs">
                  {selectedStatusColumn?.label || "Select status column"}
                  <ChevronDown className="ml-auto size-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                {statusColumns.length === 0 ? (
                  <DropdownMenuItem disabled>No status columns available</DropdownMenuItem>
                ) : (
                  statusColumns.map((col) => (
                    <DropdownMenuItem
                      key={col.id}
                      onSelect={() => handleColumnSelect(col.id)}
                    >
                      {col.label}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-muted-foreground">
              Only status-type columns can be used for Kanban grouping.
            </p>
          </div>
        )}

        {/* ── Divide by ────────────────────────────────────── */}
        <SectionHeader
          title="Divide by"
          icon={<Settings2 className="size-4" />}
          expanded={expandedSection === "divideBy"}
          onClick={() => toggleSection("divideBy")}
        />
        {expandedSection === "divideBy" && (
          <div className="px-4 mt-3 pb-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                className={cn(
                  "flex size-4 items-center justify-center rounded border transition-colors",
                  settings.divideBy.enabled
                    ? "border-primary bg-primary"
                    : "border-input bg-background group-hover:border-primary/50",
                )}
                onClick={() => handleDivideByToggle(!settings.divideBy.enabled)}
              >
                {settings.divideBy.enabled && <Check className="size-3 text-primary-foreground" />}
              </div>
              <span className="text-xs text-foreground">Divide by</span>
            </label>

            {settings.divideBy.enabled && (
              <>
                {/* Primary divide type */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-xs">
                      {settings.divideBy.primaryType === "status" ? "Status" : "Group"}
                      <ChevronDown className="ml-auto size-3 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full">
                    <DropdownMenuItem onSelect={() => handleDivideByPrimaryTypeChange("status")}>
                      Status
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleDivideByPrimaryTypeChange("group")}>
                      Group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Primary column selector (when primaryType === "status") */}
                {settings.divideBy.primaryType === "status" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-xs">
                        {columns.find((c) => c.id === settings.divideBy.primaryColumnId)?.label || "Select status column"}
                        <ChevronDown className="ml-auto size-3 opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      {statusColumns.map((col) => (
                        <DropdownMenuItem
                          key={col.id}
                          onSelect={() => handleDivideByPrimaryColumnChange(col.id)}
                        >
                          {col.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                 {/* Secondary divide type */}
                 <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <button className="flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-xs">
                       {settings.divideBy.secondaryType === "status"
                         ? "Status"
                         : settings.divideBy.secondaryType === "group"
                           ? "Group"
                           : "None"}
                       <ChevronDown className="ml-auto size-3 opacity-50" />
                     </button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent className="w-full">
                     <DropdownMenuItem onSelect={() => handleDivideBySecondaryTypeChange(null)}>
                       None
                     </DropdownMenuItem>
                     {settings.divideBy.primaryType !== "status" && (
                       <DropdownMenuItem onSelect={() => handleDivideBySecondaryTypeChange("status")}>
                         Status
                       </DropdownMenuItem>
                     )}
                     {settings.divideBy.primaryType !== "group" && (
                       <DropdownMenuItem onSelect={() => handleDivideBySecondaryTypeChange("group")}>
                         Group
                       </DropdownMenuItem>
                     )}
                   </DropdownMenuContent>
                 </DropdownMenu>

                 {/* Hide empty groups toggle */}
                {(settings.divideBy.primaryType === "group" || settings.divideBy.secondaryType === "group") && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded border transition-colors",
                        settings.showEmptyGroups
                          ? "border-input bg-background group-hover:border-primary/50"
                          : "border-primary bg-primary",
                      )}
                      onClick={() => onSettingsChange({ showEmptyGroups: !settings.showEmptyGroups })}
                    >
                      {!settings.showEmptyGroups && <Check className="size-3 text-primary-foreground" />}
                    </div>
                    <span className="text-xs text-foreground">Hide empty groups</span>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Customize your Kanban card ───────────────────── */}
        <SectionHeader
          title="Customize your Kanban card"
          icon={<Columns3 className="size-4" />}
          expanded={expandedSection === "customizeCard"}
          onClick={() => toggleSection("customizeCard")}
        />
        {expandedSection === "customizeCard" && (
          <div className="px-4 mt-3 pb-4 space-y-3">
            {/* Available columns chips */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Available columns
              </p>
              <div className="flex flex-wrap gap-2">
                {columns.map((col) => {
                  const isSelected = settings.cardFields.includes(col.id);
                  return (
                    <button
                      key={col.id}
                      draggable
                      onDragStart={handleColDragStart(col.id)}
                      onClick={() => handleCardFieldToggle(col.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-grab active:cursor-grabbing",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      <GripVertical className="size-2.5 opacity-50" />
                      {col.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected fields preview */}
            {settings.cardFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Card preview fields
                </p>
                <div
                  className="space-y-2 min-h-[48px] rounded-md border border-dashed border-border bg-muted/10 p-1.5 transition-colors"
                  onDragOver={handlePreviewDragOver}
                  onDrop={handlePreviewDrop}
                  onDragLeave={() => setDragOverIndex(null)}
                >
                  {settings.cardFields.map((fieldId, index) => {
                    const col = columns.find((c) => c.id === fieldId);
                    if (!col) return null;
                    const isDragOver = dragOverIndex === index && draggedFieldIndex !== null && draggedFieldIndex !== index;
                    return (
                      <div
                        key={fieldId}
                        draggable
                        onDragStart={handleFieldDragStart(index)}
                        onDragOver={handleFieldDragOver(index)}
                        onDrop={handlePreviewDrop}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors cursor-grab active:cursor-grabbing",
                          isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
                        )}
                      >
                         <GripVertical className="size-3 text-muted-foreground" />
                         <span className="flex-1 text-xs text-foreground">{col.label}</span>
                        <div className="flex items-center gap-1">
                          {index > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCardFieldReorder(index, index - 1); }}
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label="Move up"
                            >
                              <ChevronDown className="size-3 rotate-180" />
                            </button>
                          )}
                          {index < settings.cardFields.length - 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCardFieldReorder(index, index + 1); }}
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label="Move down"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCardFieldRemove(fieldId); }}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                            aria-label="Remove field"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Trash drop zone */}
                <div
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground transition-colors",
                    draggedFieldIndex !== null ? "border-destructive bg-destructive/5" : "border-border",
                  )}
                  onDragOver={handleTrashDragOver}
                  onDrop={handleTrashDrop}
                >
                  <X className="size-3.5" />
                  <span>Drag here to remove</span>
                </div>
              </div>
            )}

            {/* Card preview mock */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Card preview
              </p>
              <div
                className="rounded-lg border border-dashed border-border bg-muted/20 p-4 space-y-2 transition-colors"
                onDragOver={handlePreviewDragOver}
                onDrop={handlePreviewDrop}
                onDragLeave={() => setDragOverIndex(null)}
              >
                <div className="h-2.5 w-3/4 rounded bg-muted" />
                {settings.cardFields.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {settings.cardFields.slice(0, 4).map((fieldId) => {
                      const col = columns.find((c) => c.id === fieldId);
                      if (!col) return null;
                      return (
                        <div key={fieldId} className="flex items-center gap-2">
                          {settings.showColumnName && (
                            <span className="text-xs text-muted-foreground shrink-0">{col.label}:</span>
                          )}
                          <div className="h-2 w-12 rounded bg-muted/60" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Select fields to display on card</p>
                )}
                {settings.displayCoverImage && (
                  <div className="mt-3 h-16 w-full rounded bg-muted/40 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">Cover image</span>
                  </div>
                )}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border transition-colors",
                    settings.showColumnName
                      ? "border-primary bg-primary"
                      : "border-input bg-background group-hover:border-primary/50",
                  )}
                  onClick={() => onSettingsChange({ showColumnName: !settings.showColumnName })}
                >
                  {settings.showColumnName && <Check className="size-3 text-primary-foreground" />}
                </div>
                 <span className="text-xs text-foreground">Show column name</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border transition-colors",
                    settings.displayCoverImage
                      ? "border-primary bg-primary"
                      : "border-input bg-background group-hover:border-primary/50",
                  )}
                  onClick={() => onSettingsChange({ displayCoverImage: !settings.displayCoverImage })}
                >
                  {settings.displayCoverImage && <Check className="size-3 text-primary-foreground" />}
                </div>
                 <span className="text-xs text-foreground">Display cover image</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  expanded,
  onClick,
  disabled = false,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 border-b border-border px-4 py-2 text-left transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50",
      )}
    >
      {icon}
      <span className="flex-1 text-[10px] font-medium text-foreground">{title}</span>
      <ChevronDown
        className={cn(
          "size-3 text-muted-foreground transition-transform",
          expanded && "rotate-180",
        )}
      />
    </button>
  );
}
