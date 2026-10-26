"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";
import type { DropdownOption } from "@/features/boards/engine/types";
import { updateColumnLabels } from "@/features/boards/engine/actions";
import { SelectModePanel, EditLabelsPanel, PRESET_COLORS, DEFAULT_COLORS, getContrastColor } from "@/features/boards/engine/components/cell-options-popup";
import { findOptionForValue, getColumnOptions, sanitizeLabels } from "@/features/boards/engine/lib/option-lookup";

type DropdownMode = "select" | "edit";

/** Colour of a cell that holds no value (or a value that is not a label). */
const EMPTY_CELL_COLOR = "#C4C4C4";

export function StatusCell({
  value,
  readOnly,
  onChange,
  onKeyDown: _onKeyDown,
  column,
  onUpdateColumnLabels,
}: CellRendererComponentProps) {
  /**
   * The LIVE label list of the column.
   *
   * This is the only source the cell, the picker and the Edit Labels panel
   * read from — never a hardcoded list and never a copy taken at mount. The
   * column handed to a cell IS the live column of the store, so a label
   * change is picked up on the next render.
   */
  const labels = getColumnOptions(column);

  const rawValue = resolveDisplayValue(value);
  const isEmpty = rawValue === "" || rawValue === null || rawValue === undefined;
  // The cell stores the label id; the id is resolved against the live labels.
  const matchedOption = isEmpty ? null : (findOptionForValue(labels, rawValue) ?? null);
  const isUnmatched = !isEmpty && !matchedOption;

  /**
   * The edit draft. `null` means "not editing" — the picker then renders the
   * live labels. A draft is a copy of the live labels plus the user's
   * unsaved edits; it is discarded by Cancel / X and written by Apply.
   *
   * The draft is kept in a ref as well: renaming a label commits on blur, and
   * the Apply click that follows must see that rename even though React has
   * not re-rendered yet.
   */
  const draftRef = useRef<DropdownOption[] | null>(null);
  const [draft, setDraftState] = useState<DropdownOption[] | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const updateDraft = useCallback((next: DropdownOption[] | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const currentDraft = useCallback(
    () => draftRef.current ?? labels.map((opt) => ({ ...opt })),
    [labels],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<DropdownMode>("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const warnedRef = useRef<Set<string>>(new Set());

  // The list the panel renders: the draft while editing, the live labels
  // otherwise.
  const panelOptions = draft ?? labels;

  const cellColor =
    matchedOption?.color ??
    (matchedOption ? (DEFAULT_COLORS[matchedOption.label] ?? EMPTY_CELL_COLOR) : EMPTY_CELL_COLOR);
  const cellTextColor = matchedOption?.variant === "light" ? "#323338" : getContrastColor(cellColor);
  const displayText = matchedOption?.label ?? "";

  // A cell whose value is not one of the column's labels renders empty (grey)
  // instead of leaking an id or an "Unknown option" string.
  useEffect(() => {
    if (!isUnmatched) return;
    const key = `${column.id}:${rawValue}`;
    if (warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    console.warn(
      `[StatusCell] Value "${rawValue}" is not a label of column ${column.id}. The cell renders empty.`,
    );
  }, [isUnmatched, column.id, rawValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const target = e.target as Node;
        if (triggerRef.current?.contains(target)) return;
        setIsOpen(false);
        setMode("select");
        setEditingId(null);
        setColorPickerId(null);
        setMenuId(null);
        updateDraft(null);
        setDeletedIds([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [updateDraft]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode === "edit") {
          setMode("select");
          setEditingId(null);
          setColorPickerId(null);
          setMenuId(null);
          updateDraft(null);
          setDeletedIds([]);
        } else {
          setIsOpen(false);
          setMode("select");
          setEditingId(null);
          setColorPickerId(null);
          setMenuId(null);
        }
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, mode, updateDraft]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  /**
   * Write a label list.
   *
   * The list is handed to the board's update function, which writes it to the
   * live column in the store AND to the database. The panel is only closed
   * when that succeeded.
   */
  const persistLabels = useCallback(
    async (next: DropdownOption[]): Promise<boolean> => {
      const sanitized = sanitizeLabels(next);
      if (sanitized.length === 0) {
        toast.error("A column needs at least one label.");
        return false;
      }

      if (onUpdateColumnLabels) {
        return await onUpdateColumnLabels(column.id, sanitized);
      }

      // Standalone fallback (no board store wired up): write to the server.
      const result = await updateColumnLabels(column.id, sanitized);
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to save labels.");
        return false;
      }
      window.dispatchEvent(
        new CustomEvent("column-options-updated", {
          detail: { columnId: column.id, options: sanitized },
        }),
      );
      return true;
    },
    [column.id, onUpdateColumnLabels],
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setMode("select");
    // Opening the picker always starts from the live labels.
    updateDraft(null);
    setDeletedIds([]);
  }, [updateDraft]);

  const handleSelect = useCallback(
    (nextId: string) => {
      onChange?.(nextId);
      setIsOpen(false);
      setMode("select");
      setEditingId(null);
      setColorPickerId(null);
      setMenuId(null);
      updateDraft(null);
    },
    [onChange, updateDraft],
  );

  const handleStartEdit = useCallback((option: DropdownOption) => {
    setEditingId(option.id);
    setEditValue(option.label);
    setMenuId(null);
  }, []);

  /** Renaming a label only changes the draft — Apply writes it. */
  const handleEditConfirm = useCallback(() => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    updateDraft(
      currentDraft().map((opt) => (opt.id === editingId ? { ...opt, label: trimmed } : opt)),
    );
    setEditingId(null);
    setEditValue("");
  }, [editingId, editValue, currentDraft, updateDraft]);

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
      color: PRESET_COLORS[0],
    };
    updateDraft([...currentDraft(), newOption]);
    setEditingId(newId);
    setEditValue("");
    setMenuId(null);
  }, [currentDraft, updateDraft]);

  const handleDelete = useCallback((id: string) => {
    updateDraft(currentDraft().filter((opt) => opt.id !== id));
    setDeletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setEditingId(null);
    setEditValue("");
    setMenuId(null);
  }, [currentDraft, updateDraft]);

  const handleColorSelect = useCallback((optionId: string, color: string) => {
    const isLight = (() => {
      const c = color.replace("#", "").trim();
      const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
      if (full.length !== 6) return false;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.85;
    })();

    updateDraft(
      currentDraft().map((opt) =>
        opt.id === optionId
          ? { ...opt, color, variant: isLight ? ("light" as const) : ("default" as const) }
          : opt,
      ),
    );
    setColorPickerId(null);
  }, [currentDraft, updateDraft]);

  /**
   * Apply the draft.
   *
   * The panel is only closed when the write succeeded; on failure the draft
   * is kept so the user can retry, and the error is surfaced by the update
   * function.
   */
  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      const next = draftRef.current ?? labels;
      const ok = await persistLabels(next);
      if (!ok) return;
      // A cell that pointed at a deleted label is reset to empty.
      if (matchedOption && deletedIds.includes(matchedOption.id)) {
        onChange?.("");
      }
      updateDraft(null);
      setDeletedIds([]);
      setMode("select");
      setEditingId(null);
      setColorPickerId(null);
      setMenuId(null);
    } finally {
      setSaving(false);
    }
  }, [labels, deletedIds, matchedOption, onChange, persistLabels, updateDraft]);

  /** Cancel / X — the draft is discarded, the live labels stay. */
  const handleCancel = useCallback(() => {
    updateDraft(null);
    setDeletedIds([]);
    setMode("select");
    setEditingId(null);
    setColorPickerId(null);
    setMenuId(null);
  }, [updateDraft]);

  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; openUpward: boolean }>({
    top: 0,
    left: 0,
    openUpward: false,
  });
  const [triggerRect, setTriggerRect] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);

  // Calculate dropdown position with viewport boundary detection and
  // keep it in sync with scroll/resize so the panel tracks the trigger
  // when the table scroller auto-scrolls a row into view.
  useEffect(() => {
    if (!isOpen) {
      setTriggerRect(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setTriggerRect({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      const dropdownHeight = mode === "edit" ? 350 : panelOptions.length * 44 + 20;
      const dropdownWidth = 280;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const spaceRight = window.innerWidth - r.left;
      const spaceLeft = r.left;

      const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      const top = openUpward ? r.top - dropdownHeight - 4 : r.bottom + 4;

      let left = r.left;
      if (spaceRight < dropdownWidth && spaceLeft > spaceRight) {
        left = r.right - dropdownWidth;
      }
      left = Math.max(8, left);

      setDropdownPosition({ top, left, openUpward });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen, mode, panelOptions.length]);

  if (readOnly) {
    return (
      <div
        className="flex h-full w-full items-center justify-center px-4 py-2 text-sm font-bold"
        style={{ backgroundColor: cellColor, color: cellTextColor, borderRadius: "2px" }}
      >
        {displayText}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="flex h-full w-full items-center justify-center px-4 py-2 text-center text-sm font-bold border-0 bg-transparent shadow-none cursor-pointer transition-all focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        style={{
          backgroundColor: cellColor,
          color: cellTextColor,
          borderRadius: "2px",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = "brightness(0.95)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "brightness(1)";
        }}
      >
        <span className="truncate w-full">{displayText}</span>
      </button>
      {isOpen &&
        triggerRect &&
        (typeof document !== "undefined" &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed popover-surface"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                zIndex: 1000,
                minWidth: 280,
                maxHeight: dropdownPosition.openUpward
                  ? triggerRect.top - 16
                  : window.innerHeight - triggerRect.bottom - 16,
                overflowY: "auto",
                borderRadius: "8px",
                boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.12)",
              }}
            >
              {mode === "edit" ? (
                <EditLabelsPanel
                  localOptions={panelOptions}
                  editingId={editingId}
                  editValue={editValue}
                  colorPickerId={colorPickerId}
                  menuId={menuId}
                  saving={saving}
                  isStatus
                  editInputRef={editInputRef}
                  onStartEdit={handleStartEdit}
                  onEditConfirm={handleEditConfirm}
                  onEditKeyDown={handleEditKeyDown}
                  onColorSelect={handleColorSelect}
                  onDelete={handleDelete}
                  onAddLabel={handleAddLabel}
                  onApply={handleApply}
                  onCancel={handleCancel}
                  onSetEditValue={setEditValue}
                  onSetColorPickerId={setColorPickerId}
                  onSetMenuId={setMenuId}
                />
              ) : (
                <SelectModePanel
                  options={panelOptions}
                  effectiveId={matchedOption?.id ?? ""}
                  onSelect={handleSelect}
                  onEnterEdit={() => {
                    // Start editing from a copy of the live labels.
                    updateDraft(labels.map((opt) => ({ ...opt })));
                    setMode("edit");
                  }}
                  onAddLabel={handleAddLabel}
                  isStatus
                  variant="solid"
                />
              )}
            </div>,
            document.body,
          ))}
    </div>
  );
}
