"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";
import { cn } from "@/lib/utils";
import type { DropdownOption } from "@/features/boards/engine/types";
import { updateColumnOptions } from "@/features/boards/engine/actions";
import { SelectModePanel, EditLabelsPanel } from "@/features/boards/engine/components/cell-options-popup";
import {
  getColumnOptions,
  resolveOptionDisplay,
} from "@/features/boards/engine/lib/option-lookup";

export function DropdownCell({
  value,
  readOnly,
  onChange,
  onKeyDown: _onKeyDown,
  column,
}: CellRendererComponentProps) {
  const options = getColumnOptions(column);

  // The cell stores the option id; the column's options list is the source of
  // truth for the label. An id with no matching option resolves to
  // "Unknown option" so a raw "opt-…" id is never shown to the user.
  const resolved = resolveOptionDisplay(options, resolveDisplayValue(value));
  const effectiveValue = resolved.label;
  const effectiveId = resolved.option?.id ?? "";
  const matchedOption = resolved.option;

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "edit">("select");
  const [localOptions, setLocalOptions] = useState<DropdownOption[]>(options);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

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
    setMenuId(null);
  }, []);

  const handleEditConfirm = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const nextOptions = localOptions.map((opt) =>
        opt.id === editingId ? { ...opt, label: trimmed } : opt,
      );
      const result = await persistOptions(nextOptions);
      if (result.data) {
        setLocalOptions(nextOptions);
      }
    } finally {
      setSaving(false);
      setEditingId(null);
    }
  }, [editingId, editValue, localOptions, persistOptions]);

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
    setLocalOptions((prev) => [...prev, newOption]);
    setEditingId(newId);
    setEditValue("");
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

  useEffect(() => {
    if (!isOpen) {
      setTriggerRect(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setTriggerRect({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      const dropdownHeight = mode === "edit" ? 300 : localOptions.length * 40 + 20;
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
  }, [isOpen, mode, localOptions.length]);

  if (readOnly) {
    return (
      <span className="truncate text-sm text-foreground">
        {effectiveValue || <span className="text-muted-foreground italic">—</span>}
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
        <span
          className={cn(
            "truncate",
            !effectiveValue && "text-muted-foreground",
            resolved.isUnknown && "italic text-amber-600",
          )}
          title={resolved.isUnknown ? `Missing option: ${String(value)}` : undefined}
        >
          {effectiveValue || "Select..."}
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
                  localOptions={localOptions}
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
                  options={localOptions}
                  effectiveId={effectiveId}
                  onSelect={handleSelect}
                  onEnterEdit={() => setMode("edit")}
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
