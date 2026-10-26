"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";
import { cn } from "@/lib/utils";
import type { DropdownOption } from "@/features/boards/engine/types";
import { updateColumnLabels } from "@/features/boards/engine/actions";
import { SelectModePanel, EditLabelsPanel } from "@/features/boards/engine/components/cell-options-popup";
import {
  findOptionForValue,
  getColumnOptions,
  sanitizeLabels,
} from "@/features/boards/engine/lib/option-lookup";

export function DropdownCell({
  value,
  readOnly,
  onChange,
  onKeyDown: _onKeyDown,
  column,
  onUpdateColumnLabels,
}: CellRendererComponentProps) {
  /**
   * The LIVE option list of the column — the only source the cell and the
   * picker read from.
   */
  const options = getColumnOptions(column);

  const rawValue = resolveDisplayValue(value);
  const isEmpty = rawValue === "" || rawValue === null || rawValue === undefined;
  // The cell stores the option id; the id is resolved against the live list.
  const matchedOption = isEmpty ? null : (findOptionForValue(options, rawValue) ?? null);
  const isUnmatched = !isEmpty && !matchedOption;

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "edit">("select");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const warnedRef = useRef<Set<string>>(new Set());

  /**
   * The edit draft (`null` = not editing). Kept in a ref as well so an Apply
   * that follows a blur-committed rename sees that rename.
   */
  const draftRef = useRef<DropdownOption[] | null>(null);
  const [draft, setDraftState] = useState<DropdownOption[] | null>(null);

  const updateDraft = useCallback((next: DropdownOption[] | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const currentDraft = useCallback(
    () => draftRef.current ?? options.map((opt) => ({ ...opt })),
    [options],
  );

  const panelOptions = draft ?? options;

  // A value that is not one of the column's options renders empty instead of
  // leaking an id or an "Unknown option" string.
  useEffect(() => {
    if (!isUnmatched) return;
    const key = `${column.id}:${rawValue}`;
    if (warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    console.warn(
      `[DropdownCell] Value "${rawValue}" is not an option of column ${column.id}. The cell renders empty.`,
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
   * Write the option list to the live column in the store AND the database.
   * Resolves to `true` only when that succeeded.
   */
  const persistOptions = useCallback(
    async (nextOptions: DropdownOption[]): Promise<boolean> => {
      const sanitized = sanitizeLabels(nextOptions);
      if (sanitized.length === 0) {
        toast.error("A column needs at least one option.");
        return false;
      }

      if (onUpdateColumnLabels) {
        return await onUpdateColumnLabels(column.id, sanitized);
      }

      const result = await updateColumnLabels(column.id, sanitized);
      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to save options.");
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
    updateDraft(null);
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

  /** Renaming an option only changes the draft — Apply writes it. */
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
      color: "#3b82f6",
    };
    updateDraft([...currentDraft(), newOption]);
    setEditingId(newId);
    setEditValue("");
    setMenuId(null);
  }, [currentDraft, updateDraft]);

  const handleDelete = useCallback(
    (id: string) => {
      const optionToDelete = currentDraft().find((opt) => opt.id === id);
      if (!optionToDelete) return;

      const confirmed = window.confirm(
        `Delete '${optionToDelete.label || "this label"}'? Cells using this label will reset to empty.`,
      );
      if (!confirmed) return;

      updateDraft(currentDraft().filter((opt) => opt.id !== id));
      setEditingId(null);
      setEditValue("");
      setMenuId(null);
    },
    [currentDraft, updateDraft],
  );

  const handleColorSelect = useCallback(
    (optionId: string, color: string) => {
      updateDraft(
        currentDraft().map((opt) => (opt.id === optionId ? { ...opt, color } : opt)),
      );
      setColorPickerId(null);
    },
    [currentDraft, updateDraft],
  );

  /**
   * Apply the draft. The panel is only closed when the write succeeded; on
   * failure the draft is kept so the user can retry.
   */
  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      const ok = await persistOptions(draftRef.current ?? options);
      if (!ok) return;
      // A cell that pointed at a deleted option is reset to empty.
      if (matchedOption && !(draftRef.current ?? []).some((opt) => opt.id === matchedOption.id)) {
        onChange?.("");
      }
      updateDraft(null);
      setMode("select");
      setEditingId(null);
      setColorPickerId(null);
      setMenuId(null);
    } finally {
      setSaving(false);
    }
  }, [options, matchedOption, onChange, persistOptions, updateDraft]);

  /** Cancel / X — the draft is discarded, the live options stay. */
  const handleCancel = useCallback(() => {
    updateDraft(null);
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

  useEffect(() => {
    if (!isOpen) {
      setTriggerRect(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setTriggerRect({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      const dropdownHeight = mode === "edit" ? 300 : panelOptions.length * 40 + 20;
      const dropdownWidth = 200;
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
    // Reposition on scroll/resize so the panel tracks the trigger if the
    // table scroller auto-scrolls the row into view after focus, and
    // so it stays correct when the window changes size.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen, mode, panelOptions.length]);

  if (readOnly) {
    return (
      <span className="truncate text-sm text-foreground">
        {matchedOption?.label || (isEmpty ? <span className="text-muted-foreground italic">—</span> : null)}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 text-left text-sm shadow-none transition-colors hover:border-primary focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <span className={cn("truncate", !matchedOption && "text-muted-foreground")}>
          {matchedOption?.label || (isEmpty ? "Select..." : "")}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {isOpen &&
        triggerRect &&
        (typeof document !== "undefined" &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed min-w-[200px] popover-surface"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                zIndex: 1000,
                maxHeight: dropdownPosition.openUpward
                  ? triggerRect.top - 16
                  : window.innerHeight - triggerRect.bottom - 16,
                overflowY: "auto",
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
                  isStatus={false}
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
                    // Start editing from a copy of the live options.
                    updateDraft(options.map((opt) => ({ ...opt })));
                    setMode("edit");
                  }}
                  onAddLabel={handleAddLabel}
                  isStatus={false}
                  variant="subtle"
                />
              )}
            </div>,
            document.body,
          ))}
    </div>
  );
}
