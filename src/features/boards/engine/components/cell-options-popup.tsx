"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Plus, MoreHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DropdownOption } from "@/features/boards/engine/types";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#78716c", "#71717a", "#64748b",
  "#94a3b8", "#b91c1c", "#c2410c", "#a16207", "#4d7c0f",
  "#15803d", "#0f766e", "#0e7490", "#1d4ed8", "#4338ca",
];

const DEFAULT_COLORS: Record<string, string> = {
  Done: "#22c55e",
  "Working on it": "#f59e0b",
  Stuck: "#ef4444",
  "Not Started": "#94a3b8",
};

function getContrastColor(hex?: string): string {
  if (!hex) return "#1f2937";
  const c = hex.replace("#", "").trim();
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  if (full.length !== 6) return "#1f2937";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#1f2937";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

function getLightVariant(hex: string): string {
  const c = hex.replace("#", "").trim();
  if (c.length !== 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  const lr = Math.round(r + (255 - r) * 0.65);
  const lg = Math.round(g + (255 - g) * 0.65);
  const lb = Math.round(b + (255 - b) * 0.65);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

export { getLightVariant, getContrastColor, PRESET_COLORS, DEFAULT_COLORS };

export interface SelectModePanelProps {
  options: DropdownOption[];
  effectiveId: string;
  onSelect: (id: string) => void;
  onEnterEdit: () => void;
  onAddLabel: () => void;
  isStatus?: boolean;
  variant?: "solid" | "subtle";
}

export function SelectModePanel({ options, effectiveId, onSelect, onEnterEdit, onAddLabel, isStatus = false, variant = "solid" }: SelectModePanelProps) {
  return (
    <div className="flex max-h-80 flex-col">
      <div className="flex-1 overflow-y-auto p-1.5">
        <div className="flex flex-col gap-0.5">
          {options.map((option) => {
            const optionColor = option.color ?? DEFAULT_COLORS[option.label] ?? "#3b82f6";
            const isSelected = option.id === effectiveId;
            const isSubtle = variant === "subtle";
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className={cn(
                  "flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  isSubtle && isSelected && "bg-accent",
                )}
                style={
                  !isSubtle
                    ? {
                        backgroundColor: isSelected ? optionColor : "transparent",
                        color: isSelected ? getContrastColor(optionColor) : "inherit",
                      }
                    : undefined
                }
              >
                <span
                  className="mr-2 size-3 rounded-sm shrink-0"
                  style={{ backgroundColor: optionColor }}
                />
                <span className="truncate flex-1">{option.label}</span>
                {isSelected && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-border p-1.5 space-y-0.5">
        <button
          type="button"
          onClick={onEnterEdit}
          className="flex w-full items-center justify-center rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Edit Labels
        </button>
        <button
          type="button"
          onClick={onAddLabel}
          className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          New label
        </button>
      </div>
    </div>
  );
}

export interface EditLabelsPanelProps {
  localOptions: DropdownOption[];
  editingId: string | null;
  editValue: string;
  colorPickerId: string | null;
  menuId: string | null;
  saving: boolean;
  isStatus?: boolean;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onStartEdit: (option: DropdownOption) => void;
  onEditConfirm: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onColorSelect: (optionId: string, color: string) => void;
  onDelete: (id: string) => void;
  onAddLabel: () => void;
  onApply: () => void;
  onCancel: () => void;
  onSetEditValue: (value: string) => void;
  onSetColorPickerId: (id: string | null) => void;
  onSetMenuId: (id: string | null) => void;
}

export function EditLabelsPanel({
  localOptions,
  editingId,
  editValue,
  colorPickerId,
  menuId,
  saving,
  isStatus = false,
  editInputRef,
  onStartEdit,
  onEditConfirm,
  onEditKeyDown,
  onColorSelect,
  onDelete,
  onAddLabel,
  onApply,
  onCancel,
  onSetEditValue,
  onSetColorPickerId,
  onSetMenuId,
}: EditLabelsPanelProps) {
  return (
    <div className="flex max-h-96 flex-col rounded-lg" style={{ width: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground">Edit Labels</span>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <span className="text-xs">✕</span>
        </button>
      </div>

      {/* Options list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {localOptions.map((option) => {
            const isEditing = editingId === option.id;
            const optionColor = option.color ?? DEFAULT_COLORS[option.label] ?? "#3b82f6";
            return (
              <div
                key={option.id}
                className={cn(
                  "rounded-md border border-transparent group",
                  isEditing && "border-blue-500",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {isStatus && (
                    <button
                      type="button"
                      onClick={() =>
                        onSetColorPickerId(colorPickerId === option.id ? null : option.id)
                      }
                      className="flex size-6 shrink-0 items-center justify-center rounded border border-border hover:border-primary"
                      title="Pick color"
                    >
                      <span
                        className="block size-3.5 rounded-sm"
                        style={{ backgroundColor: optionColor }}
                      />
                    </button>
                  )}

                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => onSetEditValue(e.target.value)}
                      onBlur={onEditConfirm}
                      onKeyDown={onEditKeyDown}
                      className="h-7 flex-1 rounded-md border border-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      onFocus={(e) => e.target.select()}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEdit(option)}
                      className="flex-1 truncate px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
                    >
                      {option.label || (
                        <span className="text-muted-foreground italic">Empty label</span>
                      )}
                    </button>
                  )}

                  <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onSetMenuId(menuId === option.id ? null : option.id)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                    {menuId === option.id && (
                      <div className="absolute right-0 top-full z-[200] mt-0.5 w-24 rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(option.id);
                            onSetMenuId(null);
                          }}
                          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-destructive hover:bg-accent"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isStatus && colorPickerId === option.id && (
                  <div className="mt-1.5 rounded-lg bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                    <div className="grid grid-cols-7 gap-1">
                      {PRESET_COLORS.map((color) => (
                        <div key={color} className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => onColorSelect(option.id, color)}
                            className={cn(
                              "size-4 rounded-sm border border-border hover:scale-110 transition-transform",
                              optionColor === color && "ring-1 ring-ring",
                            )}
                            style={{ backgroundColor: color }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onColorSelect(option.id, getLightVariant(color))
                            }
                            className={cn(
                              "size-4 rounded-sm border border-border hover:scale-110 transition-transform",
                              optionColor === getLightVariant(color) && "ring-1 ring-ring",
                            )}
                            style={{ backgroundColor: getLightVariant(color) }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddLabel}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          New label
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Check className="size-3.5" />
              Apply
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface CellOptionsPopupProps {
  columnId: string;
  columnType: string;
  options: DropdownOption[];
  value: string;
  onSelect: (value: string) => void;
  onCreate: (label: string) => void;
  onClose: () => void;
}

export function CellOptionsPopup({
  columnId,
  columnType,
  options,
  value,
  onSelect,
  onCreate,
  onClose,
}: CellOptionsPopupProps) {
  const [newLabel, setNewLabel] = useState("");
  const [showLabelPanel, setShowLabelPanel] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isStatus = columnType === "status";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleCreate = useCallback(() => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewLabel("");
  }, [newLabel, onCreate]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate],
  );

  const handleEditLabelsClick = useCallback(() => {
    setShowLabelPanel(true);
  }, []);

  const handleLabelPanelClose = useCallback(() => {
    setShowLabelPanel(false);
  }, []);

  const handleLabelPanelApply = useCallback(() => {
    setShowLabelPanel(false);
    onClose();
  }, [onClose]);

  if (showLabelPanel) {
    return (
      <div ref={popupRef} className="absolute z-50 mt-1">
        <LabelManagementSubPanel
          columnId={columnId}
          columnType={columnType}
          options={options}
          onApply={handleLabelPanelApply}
          onCancel={handleLabelPanelClose}
        />
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className="absolute z-[200] mt-1 min-w-[200px] rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
    >
      <div className="flex max-h-64 flex-col">
        {/* Create label input */}
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-1">
            <Plus className="size-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              placeholder="Create a label"
              className="h-7 flex-1 border-0 text-xs shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={handleCreate}
              disabled={!newLabel.trim()}
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Options list */}
        <div className="flex-1 overflow-y-auto p-1.5">
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => {
              const isSelected = option.label === value;
              let colorClass = "bg-white text-foreground shadow-sm";
              let colorStyle: Record<string, string> | undefined;
              if (isStatus && option.color) {
                colorStyle = { backgroundColor: option.color };
                colorClass = "text-white shadow-sm";
              }
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelect(option.label);
                    onClose();
                  }}
                  className={cn(
                    "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-border",
                    isSelected ? "border-primary" : "border-border hover:border-primary",
                    colorClass,
                  )}
                  style={colorStyle}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="ml-1.5 size-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Edit Labels link */}
        <div className="border-t border-border p-1.5">
          <button
            type="button"
            onClick={handleEditLabelsClick}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <span>Edit Labels</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface LabelManagementSubPanelProps {
  columnId: string;
  columnType: string;
  options: DropdownOption[];
  onApply: () => void;
  onCancel: () => void;
}

function LabelManagementSubPanel({
  columnId,
  columnType,
  options,
  onApply,
  onCancel,
}: LabelManagementSubPanelProps) {
  const [localOptions, setLocalOptions] = useState<DropdownOption[]>(options);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isStatus = columnType === "status";

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const syncOptions = useCallback(
    (next: DropdownOption[]) => {
      window.dispatchEvent(
        new CustomEvent("column-options-updated", { detail: { columnId, options: next } }),
      );
    },
    [columnId],
  );

  const handleStartEdit = useCallback((option: DropdownOption) => {
    setEditingId(option.id);
    setEditValue(option.label);
    setMenuId(null);
  }, []);

  const handleEditConfirm = useCallback(() => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    setLocalOptions((prev) => {
      const next = prev.map((opt) =>
        opt.id === editingId ? { ...opt, label: trimmed } : opt,
      );
      syncOptions(next);
      return next;
    });
    setEditingId(null);
    setEditValue("");
  }, [editingId, editValue, syncOptions]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleEditConfirm();
      } else if (e.key === "Escape") {
        setEditingId(null);
        setEditValue("");
      }
    },
    [handleEditConfirm],
  );

  const handleAddLabel = useCallback(() => {
    const newId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newOption: DropdownOption = {
      id: newId,
      label: "",
      color: isStatus ? PRESET_COLORS[0] : undefined,
    };
    setLocalOptions((prev) => {
      const next = [...prev, newOption];
      syncOptions(next);
      return next;
    });
    setEditingId(newId);
    setEditValue("");
    setMenuId(null);
  }, [isStatus, syncOptions]);

  const handleDelete = useCallback(
    (id: string) => {
      const confirmed = window.confirm("Delete this label? Cells using it will be reset to empty.");
      if (!confirmed) return;
      setLocalOptions((prev) => {
        const next = prev.filter((opt) => opt.id !== id);
        syncOptions(next);
        return next;
      });
      setEditingId(null);
      setEditValue("");
      setMenuId(null);
    },
    [syncOptions],
  );

  const handleColorSelect = useCallback(
    (optionId: string, color: string) => {
      setLocalOptions((prev) => {
        const next = prev.map((opt) =>
          opt.id === optionId ? { ...opt, color } : opt,
        );
        syncOptions(next);
        return next;
      });
      setColorPickerId(null);
    },
    [syncOptions],
  );

  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      const cleaned = localOptions
        .filter((opt) => opt.label.trim() !== "")
        .map(({ id, label, color }) => ({
          id,
          label: label.trim(),
          ...(color ? { color } : {}),
        }));
      const { updateColumnOptions } = await import("@/features/boards/engine/actions");
      const result = await updateColumnOptions(columnId, cleaned);
      if (result.data) {
        window.dispatchEvent(
          new CustomEvent("column-options-updated", { detail: { columnId, options: cleaned } }),
        );
      }
      onApply();
    } finally {
      setSaving(false);
    }
  }, [localOptions, columnId, onApply]);

  const handleCancel = useCallback(() => {
    syncOptions(options);
    onCancel();
  }, [options, onCancel, syncOptions]);

  return (
    <div className="flex max-h-80 flex-col rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground">Edit Labels</span>
        <button
          type="button"
          onClick={handleCancel}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {localOptions.map((option) => {
            const isEditing = editingId === option.id;
            return (
              <div
                key={option.id}
                className={cn(
                  "rounded-md border border-transparent group",
                  isEditing && "border-blue-500",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {isStatus && (
                    <button
                      type="button"
                      onClick={() =>
                        setColorPickerId(colorPickerId === option.id ? null : option.id)
                      }
                      className="flex size-6 shrink-0 items-center justify-center rounded border border-border hover:border-primary"
                      title="Pick color"
                    >
                      <span
                        className="block size-3.5 rounded-sm"
                        style={{ backgroundColor: option.color ?? "#94a3b8" }}
                      />
                    </button>
                  )}

                  {isEditing ? (
                    <Input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleEditConfirm}
                      onKeyDown={handleEditKeyDown}
                      className="h-7 flex-1 text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(option)}
                      className="flex-1 truncate px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
                    >
                      {option.label || (
                        <span className="text-muted-foreground italic">Empty label</span>
                      )}
                    </button>
                  )}

                  <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setMenuId(menuId === option.id ? null : option.id)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                    {menuId === option.id && (
                      <div className="absolute right-0 top-full z-[200] mt-0.5 w-24 rounded-lg bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                        <button
                          type="button"
                          onClick={() => handleDelete(option.id)}
                          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-destructive hover:bg-accent"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

{isStatus && colorPickerId === option.id && (
                    <div className="mt-1.5 rounded-lg bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                    <div className="grid grid-cols-7 gap-1">
                      {PRESET_COLORS.map((color) => (
                        <div
                          key={color}
                          className="flex flex-col gap-0.5"
                        >
                          <button
                            type="button"
                            onClick={() => handleColorSelect(option.id, color)}
                            className={cn(
                              "size-4 rounded-sm border border-border hover:scale-110 transition-transform",
                              option.color === color && "ring-1 ring-ring",
                            )}
                            style={{ backgroundColor: color }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleColorSelect(option.id, getLightVariant(color))
                            }
                            className={cn(
                              "size-4 rounded-sm border border-border hover:scale-110 transition-transform",
                              option.color === getLightVariant(color) && "ring-1 ring-ring",
                            )}
                            style={{ backgroundColor: getLightVariant(color) }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddLabel}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          New label
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleApply} disabled={saving}>
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Check className="mr-1 size-3.5" />
              Apply
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
