"use client";

import { useState } from "react";
import { Plus, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nextGroupTitle } from "../lib/title-column";
import type { AddGroupColumnSpec, AddGroupMode, AddGroupPayload } from "../types";

export type { AddGroupColumnSpec, AddGroupMode, AddGroupPayload };

interface GroupOption {
  id: string;
  name: string;
  color?: string;
  columnCount: number;
}

const COLORS = ["#579bfc", "#00c875", "#e2445c", "#fdab3d", "#a25ddc", "#0086c0", "#cab641", "#ff642e"];

export function AddGroupPopover({
  groups,
  defaultTitle,
  onConfirm,
  onClose,
}: {
  groups: GroupOption[];
  defaultTitle?: string;
  onConfirm: (payload: AddGroupPayload) => void | Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle ?? nextGroupTitle(groups.map((g) => g.name)));
  const [color, setColor] = useState(COLORS[0]);
  const [mode, setMode] = useState<AddGroupMode>("blank");
  const [sourceGroupId, setSourceGroupId] = useState(groups[0]?.id ?? "");
  const [columns, setColumns] = useState<AddGroupColumnSpec[]>([{ name: "Name", type: "text" }]);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");

  const addColumn = () => {
    if (!newColName.trim()) return;
    setColumns([...columns, { name: newColName.trim(), type: newColType }]);
    setNewColName("");
  };
  const removeColumn = (i: number) => setColumns(columns.filter((_, idx) => idx !== i));
  const moveColumn = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    setColumns(next);
  };

  const confirm = async () => {
    const payload: AddGroupPayload = {
      title: title.trim() || nextGroupTitle(groups.map((g) => g.name)),
      color,
      mode,
    };
    if (mode === "copy") payload.sourceGroupId = sourceGroupId;
    if (mode === "custom") payload.columns = columns;
    await onConfirm(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[420px] rounded-[12px] border border-border p-4 relative z-20"
        style={{
          backgroundColor: "hsl(var(--popover-bg))",
          opacity: 1,
          backdropFilter: "none",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") confirm();
        }}
        tabIndex={-1}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add new group</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted-foreground">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted-foreground">Color</label>
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("size-6 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted-foreground">Mode</label>
          <div className="flex flex-col gap-1">
            {(["blank", "copy", "custom"] as AddGroupMode[]).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                {m === "blank" ? "Blank group" : m === "copy" ? "Same columns as existing group" : "Custom columns"}
              </label>
            ))}
          </div>
        </div>

        {mode === "copy" && (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-muted-foreground">Copy from</label>
            <select
              value={sourceGroupId}
              onChange={(e) => setSourceGroupId(e.target.value)}
              className="h-8 w-full rounded border border-border bg-background px-2 text-sm"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.columnCount} columns)
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "custom" && (
          <div className="mb-3">
            <div className="mb-2 space-y-1">
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={col.name} onChange={(e) => {
                    const next = [...columns]; next[i] = { ...next[i], name: e.target.value }; setColumns(next);
                  }} className="h-7 text-xs" />
                  <select value={col.type} onChange={(e) => {
                    const next = [...columns]; next[i] = { ...next[i], type: e.target.value }; setColumns(next);
                  }} className="h-7 rounded border border-border bg-background px-1 text-xs">
                    {["text", "number", "status", "person", "date", "dropdown", "checkbox", "link"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button onClick={() => moveColumn(i, -1)} className="text-xs text-muted-foreground">↑</button>
                  <button onClick={() => moveColumn(i, 1)} className="text-xs text-muted-foreground">↓</button>
                  {col.name !== "Name" && (
                    <button onClick={() => removeColumn(i)} className="text-xs text-destructive">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Column name" className="h-7 text-xs" />
              <select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="h-7 rounded border border-border bg-background px-1 text-xs">
                {["text", "number", "status", "person", "date", "dropdown", "checkbox", "link"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={addColumn}>
                <Plus className="size-3" /> Add
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={confirm}>Create group</Button>
        </div>
      </div>
    </div>
  );
}
