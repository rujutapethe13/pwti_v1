"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Plus, MoreHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DropdownOption } from "@/features/boards/engine/types";
import { DEFAULT_STATUS_LABELS } from "@/features/boards/engine/column-registry";

// Base colors per the spec (row by row)
const STATUS_BASE_COLORS = [
  "#3D7F4C", "#ADCF45", "#C9B452", "#F4CC3D",
  "#E8794A", "#F0B0B2", "#E8807B", "#A8404F",
  "#CC3070", "#E86BC0", "#E8A8EC", "#9558D6",
  "#7852CF", "#744088", "#3D2090", "#5C5CD6",
  "#35508F", "#759CF5", "#7ECBC4", "#8CCDF8",
  "#84AECB", "#9FADBC", "#777777", "#333333",
  "#7A5548", "#D48CB8", "#B8A68C", "#B3E0F2",
  "#C49484", "#4670D8", "#2D5A60", "#BBAAF0",
  "#B0C0E6", "#9C9BB8", "#50403D",
];

// Keep old PRESET_COLORS for backward compatibility
const PRESET_COLORS = STATUS_BASE_COLORS;

/**
 * Fallback colour per standard label name.
 *
 * Derived from the column registry so the picker, the cell renderer and a
 * newly created Status column all agree on the same palette.
 */
const DEFAULT_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_STATUS_LABELS.map((option) => [option.label, option.color ?? "#C4C4C4"]),
);

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
  // Mix with white at 55% per spec
  const lr = Math.round(r + (255 - r) * 0.55);
  const lg = Math.round(g + (255 - g) * 0.55);
  const lb = Math.round(b + (255 - b) * 0.55);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

export { getLightVariant, getContrastColor, PRESET_COLORS, DEFAULT_COLORS, STATUS_BASE_COLORS };

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
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {options.map((option) => {
            const optionColor = option.color ?? DEFAULT_COLORS[option.label] ?? "#C4C4C4";
            const isSelected = option.id === effectiveId;
            const isSubtle = variant === "subtle";
            const textColor = isSubtle ? "inherit" : (option.variant === "light" ? "#323338" : getContrastColor(optionColor));
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-center text-sm font-medium transition-colors",
                  isSubtle && isSelected && "bg-accent",
                )}
                style={
                  !isSubtle
                    ? {
                        backgroundColor: optionColor,
                        color: textColor,
                        borderRadius: "2px",
                        height: "32px",
                      }
                    : undefined
                }
              >
                {isSubtle ? (
                  <>
                    <span
                      className="mr-2 size-3 rounded-sm shrink-0"
                      style={{ backgroundColor: optionColor }}
                    />
                    <span className="truncate flex-1">{option.label}</span>
                    {isSelected && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
                  </>
                ) : (
                  <span className="w-full text-center truncate">{option.label || " "}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-border p-2 space-y-1">
        <button
          type="button"
          onClick={onEnterEdit}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <path d="M11.3333 2.00004C11.5084 1.82494 11.7163 1.68605 11.9447 1.59129C12.1731 1.49653 12.4173 1.44775 12.6667 1.44775C12.916 1.44775 13.1602 1.49653 13.3886 1.59129C13.617 1.68605 13.8249 1.82494 14 2.00004C14.1751 2.17513 14.314 2.383 14.4087 2.6114C14.5035 2.8398 14.5523 3.08403 14.5523 3.33337C14.5523 3.58271 14.5035 3.82694 14.4087 4.05534C14.314 4.28374 14.1751 4.49161 14 4.66671L5.00001 13.6667L1.33334 14.6667L2.33334 11L11.3333 2.00004Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Edit Labels
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
        <span className="text-sm font-medium text-foreground">Edit Labels</span>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Options list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {localOptions.map((option) => {
            const isEditing = editingId === option.id;
            const optionColor = option.color ?? DEFAULT_COLORS[option.label] ?? "#C4C4C4";
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
                      <div
                        className="flex size-4 items-center justify-center rounded-sm"
                        style={{ backgroundColor: optionColor }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1.66666 6.66667L3.33332 8.33333L8.33332 3.33333M1.66666 3.33333L3.33332 5L5 3.33333" stroke={getContrastColor(optionColor)} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
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
                      className="flex-1 truncate px-2 py-1 text-left text-xs text-foreground hover:bg-accent rounded"
                    >
                      {option.label || (
                        <span className="text-muted-foreground italic">Add Label</span>
                      )}
                    </button>
                  )}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onSetMenuId(menuId === option.id ? null : option.id)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                    {menuId === option.id && (
                      <div className="absolute right-0 top-full z-[var(--z-popover)] mt-0.5 w-28 popover-surface">
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(option.id);
                            onSetMenuId(null);
                          }}
                          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetMenuId(null)}
                          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
                        >
                          Reorder
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isStatus && colorPickerId === option.id && (
                  <div className="mt-1.5 popover-surface p-2">
                    <div className="mb-1 text-xs text-muted-foreground">Colors</div>
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {STATUS_BASE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            onColorSelect(option.id, color);
                            // Also set as default variant
                          }}
                          className={cn(
                            "size-10 rounded-sm border border-border hover:scale-105 transition-transform relative",
                            optionColor === color && "ring-2 ring-blue-500",
                          )}
                          style={{ backgroundColor: color }}
                        >
                          {optionColor === color && (
                            <svg className="absolute inset-0 m-auto" width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6L4.5 8.5L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="mb-1 text-xs text-muted-foreground">Light shades</div>
                    <div className="grid grid-cols-4 gap-1">
                      {STATUS_BASE_COLORS.map((color) => {
                        const lightColor = getLightVariant(color);
                        return (
                          <button
                            key={`light-${color}`}
                            type="button"
                            onClick={() => {
                              onColorSelect(option.id, lightColor);
                              // Mark as light variant - we'll need to pass this info
                            }}
                            className={cn(
                              "size-10 rounded-sm border border-border hover:scale-105 transition-transform relative",
                              optionColor === lightColor && "ring-2 ring-blue-500",
                            )}
                            style={{ backgroundColor: lightColor }}
                          >
                            {optionColor === lightColor && (
                              <svg className="absolute inset-0 m-auto" width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L4.5 8.5L10 3" stroke="#323338" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        );
                      })}
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
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          <Plus className="size-4" />
          + New label
        </button>
        {isStatus && (
          <button
            type="button"
            onClick={() => {}}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Auto-assign labels
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Apply"}
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
      className="absolute z-[var(--z-popover)] mt-1 min-w-[200px] popover-surface"
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
              let colorClass = "bg-card text-foreground shadow-sm";
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
    <div className="flex max-h-80 flex-col popover-surface">
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
                      <div className="absolute right-0 top-full z-[var(--z-popover)] mt-0.5 w-24 popover-surface">
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
                    <div className="mt-1.5 popover-surface p-2">
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
