"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Plus, Trash2, Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#78716c", "#71717a", "#64748b",
  "#94a3b8", "#b91c1c", "#c2410c", "#a16207", "#4d7c0f",
  "#15803d", "#0f766e", "#0e7490", "#1d4ed8", "#4338ca",
];

interface DropdownOption {
  id: string;
  label: string;
  color?: string;
}

interface LabelManagementPanelProps {
  columnId: string;
  columnType: string;
  options: DropdownOption[];
  onApply: (options: DropdownOption[]) => Promise<void>;
  onCancel: () => void;
}

export function LabelManagementPanel({
  columnId: _columnId,
  columnType,
  options,
  onApply,
  onCancel,
}: LabelManagementPanelProps) {
  const [localOptions, setLocalOptions] = useState<DropdownOption[]>(options);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isStatus = columnType === "status";

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartEdit = useCallback((option: DropdownOption) => {
    setEditingId(option.id);
    setEditValue(option.label);
  }, []);

  const handleEditConfirm = useCallback(() => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setLocalOptions((prev) =>
      prev.map((opt) => (opt.id === editingId ? { ...opt, label: trimmed } : opt))
    );
    setEditingId(null);
    setEditValue("");
  }, [editingId, editValue]);

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
    setLocalOptions((prev) => [...prev, newOption]);
    setEditingId(newId);
    setEditValue("");
  }, [isStatus]);

  const handleDelete = useCallback((id: string) => {
    setLocalOptions((prev) => prev.filter((opt) => opt.id !== id));
  }, []);

  const handleColorSelect = useCallback((optionId: string, color: string) => {
    setLocalOptions((prev) =>
      prev.map((opt) => (opt.id === optionId ? { ...opt, color } : opt))
    );
    setColorPickerId(null);
  }, []);

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
      await onApply(cleaned);
    } finally {
      setSaving(false);
    }
  }, [localOptions, onApply]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  return (
    <div className="flex max-h-80 flex-col rounded-lg border border-border bg-background shadow-lg">
      {/* Header */}
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

      {/* Options list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {localOptions.map((option) => (
            <div
              key={option.id}
              className="rounded-md border border-transparent hover:border-border group"
            >
              <div className="flex items-center gap-1.5">
                {/* Color swatch for status */}
                {isStatus && (
                  <button
                    type="button"
                    onClick={() => setColorPickerId(colorPickerId === option.id ? null : option.id)}
                    className="flex size-6 shrink-0 items-center justify-center rounded border border-border hover:border-primary"
                    title="Pick color"
                  >
                    <span
                      className="block size-3.5 rounded-sm"
                      style={{ backgroundColor: option.color ?? "#94a3b8" }}
                    />
                  </button>
                )}

                {/* Label input or text */}
                {editingId === option.id ? (
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
                    {option.label || <span className="text-muted-foreground italic">Empty label</span>}
                  </button>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDelete(option.id)}
                  className="flex size-6 shrink-0 items-center justify-center rounded opacity-0 text-muted-foreground hover:text-destructive group-hover:opacity-100"
                  title="Delete label"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>

              {isStatus && colorPickerId === option.id && (
                <div className="mt-1.5 rounded-md border border-border bg-background p-2 shadow-lg">
                  <div className="grid grid-cols-7 gap-1">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleColorSelect(option.id, color)}
                        className={cn(
                          "size-5 rounded-sm border border-border hover:scale-110",
                          option.color === color && "ring-1 ring-ring",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add label button */}
        <button
          type="button"
          onClick={handleAddLabel}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add Label
        </button>
      </div>

      {/* Footer */}
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
