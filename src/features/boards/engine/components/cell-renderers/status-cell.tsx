"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";
import type { DropdownOption } from "@/features/boards/engine/types";
import { updateColumnOptions } from "@/features/boards/engine/actions";
import { SelectModePanel, EditLabelsPanel, PRESET_COLORS, DEFAULT_COLORS, getContrastColor } from "@/features/boards/engine/components/cell-options-popup";
import { getColumnOptions, resolveOptionDisplay } from "@/features/boards/engine/lib/option-lookup";

type DropdownMode = "select" | "edit";

export function StatusCell({
  value,
  readOnly,
  onChange,
  onKeyDown: _onKeyDown,
  column,
}: CellRendererComponentProps) {
  const options = getColumnOptions(column);

  // The cell stores the option id; the column's options list provides the
  // label. An id with no matching option renders "Unknown option" rather than
  // leaking the raw id.
  const resolved = resolveOptionDisplay(options, resolveDisplayValue(value));
  const effectiveValue = resolved.label;
  const effectiveId = resolved.option?.id ?? "";
  const matchedOption = resolved.option;

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<DropdownMode>("select");
  const [localOptions, setLocalOptions] = useState<DropdownOption[]>(options);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editColor, setEditColor] = useState(PRESET_COLORS[9]);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // An unknown option gets a neutral grey so it is visibly distinct from a
  // real, resolved status.
  const cellColor = matchedOption?.color ?? DEFAULT_COLORS[effectiveValue] ?? "#3b82f6";
  const cellTextColor = getContrastColor(cellColor);

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
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode === "edit") {
          setMode("select");
          setEditingId(null);
          setColorPickerId(null);
          setMenuId(null);
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
  }, [isOpen, mode]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const persistOptions = useCallback(
    async (nextOptions: DropdownOption[]) => {
      const result = await updateColumnOptions(column.id, nextOptions);
      if (result.data) {
        window.dispatchEvent(
          new CustomEvent("column-options-updated", { detail: { columnId: column.id, options: nextOptions } }),
        );
      }
      return result;
    },
    [column.id],
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setLocalOptions(options);
    setMode("select");
  }, [options]);

  const handleSelect = useCallback(
    (nextId: string) => {
      onChange?.(nextId);
      setIsOpen(false);
      setMode("select");
      setEditingId(null);
      setColorPickerId(null);
      setMenuId(null);
    },
    [onChange],
  );

  const handleStartEdit = useCallback((option: DropdownOption) => {
    setEditingId(option.id);
    setEditValue(option.label);
    setEditColor(option.color ?? DEFAULT_COLORS[option.label] ?? PRESET_COLORS[9]);
    setMenuId(null);
  }, []);

  const handleEditConfirm = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const nextOptions = localOptions.map((opt) =>
        opt.id === editingId ? { ...opt, label: trimmed, color: editColor } : opt,
      );
      const result = await persistOptions(nextOptions);
      if (result.data) {
        setLocalOptions(nextOptions);
      }
    } finally {
      setSaving(false);
      setEditingId(null);
    }
  }, [editingId, editValue, editColor, localOptions, persistOptions]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleEditConfirm();
      } else if (e.key === "Escape") {
        setEditingId(null);
        setEditValue("");
        setEditColor(PRESET_COLORS[9]);
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
    setLocalOptions((prev) => [...prev, newOption]);
    setEditingId(newId);
    setEditValue("");
    setEditColor(PRESET_COLORS[0]);
    setMenuId(null);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const optionToDelete = localOptions.find((opt) => opt.id === id);
      if (!optionToDelete) return;

      const confirmed = window.confirm(
        `Delete '${optionToDelete.label || "this label"}'? Cells using this label will reset to empty.`,
      );
      if (!confirmed) return;

      setSaving(true);
      try {
        if (matchedOption?.id === id) {
          onChange?.("");
        }
        const nextOptions = localOptions.filter((opt) => opt.id !== id);
        const result = await persistOptions(nextOptions);
        if (result.data) {
          setLocalOptions(nextOptions);
        }
      } finally {
        setSaving(false);
        setEditingId(null);
        setMenuId(null);
      }
    },
    [localOptions, matchedOption, onChange, persistOptions],
  );

  const handleColorSelect = useCallback(
    (optionId: string, color: string) => {
      setLocalOptions((prev) => {
        const next = prev.map((opt) =>
          opt.id === optionId ? { ...opt, color } : opt,
        );
        return next;
      });
      setColorPickerId(null);
    },
    [],
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
      const result = await persistOptions(cleaned);
      if (result.data) {
        setLocalOptions(cleaned);
      }
      setMode("select");
      setEditingId(null);
      setColorPickerId(null);
      setMenuId(null);
    } finally {
      setSaving(false);
    }
  }, [localOptions, persistOptions]);

  const handleCancel = useCallback(() => {
    setLocalOptions(options);
    setMode("select");
    setEditingId(null);
    setColorPickerId(null);
    setMenuId(null);
  }, [options]);

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
      const dropdownHeight = mode === "edit" ? 350 : localOptions.length * 44 + 20;
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
  }, [isOpen, mode, localOptions.length]);

  if (readOnly) {
    return (
      <div
        className="flex h-full w-full items-center justify-center px-4 py-2 text-sm font-bold -mx-4 -my-2"
        style={{ backgroundColor: cellColor, color: cellTextColor }}
      >
        {effectiveValue || "—"}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="flex h-full w-full items-center justify-between px-4 py-2 text-left text-sm font-bold -mx-4 -my-2 border-0 bg-transparent shadow-none cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        style={{ backgroundColor: cellColor, color: cellTextColor }}
      >
        <span className="truncate">{effectiveValue || "Select..."}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-80" />
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
              }}
            >
              {mode === "edit" ? (
                <EditLabelsPanel
                    localOptions={localOptions}
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
                     options={localOptions}
                     effectiveId={effectiveId}
                     onSelect={handleSelect}
                     onEnterEdit={() => setMode("edit")}
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
