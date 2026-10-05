"use client";

import type { ChangeEvent } from "react";

import { columnTypeRegistry } from "../column-registry";
import type { CellRendererProps, ColumnValue } from "../types";
import { cn } from "@/lib/utils";
import { getCellRenderer } from "./cell-renderers/cell-renderer-registry";

function readValue(value: ColumnValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function CellRenderer({ board, record, column, value, readOnly, onChange }: CellRendererProps) {
  const definition = columnTypeRegistry[column.type];
  const displayValue = readValue(value ?? definition.defaultValue);

  const Renderer = getCellRenderer(column.type);

  if (Renderer) {
    return (
      <Renderer
        value={value ?? definition.defaultValue}
        column={column}
        recordId={record.id}
        boardId={board.id}
        organizationId={record.organizationId}
        workspaceId={record.workspaceId}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }

  if (readOnly || ["formula", "mirror", "lookup", "rollup"].includes(column.type)) {
    return <span className="truncate text-sm text-foreground">{displayValue || "—"}</span>;
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    onChange?.(event.target.value);
  };

  switch (column.type) {
    case "checkbox":
      return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange?.(event.target.checked)} className="size-4 rounded border-border" />;
    case "number":
    case "currency":
    case "rating":
    case "progress":
      return <input type="number" value={displayValue} onChange={handleChange} className={cn("w-full rounded-md border border-border bg-background px-2 py-1 text-sm") } />;
    case "long_text":
      return <textarea value={displayValue} onChange={handleChange} className="min-h-20 w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />;
    case "files":
      return <button type="button" className="rounded-md border border-dashed border-border px-2 py-1 text-sm text-muted-foreground">Upload</button>;
    case "status":
    case "priority":
    case "dropdown":
      return <input value={displayValue} onChange={handleChange} className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />;
    case "person":
      return <input value={displayValue} onChange={handleChange} placeholder="Assign user" className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />;
    default:
      return <input value={displayValue} onChange={handleChange} className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />;
  }
}
