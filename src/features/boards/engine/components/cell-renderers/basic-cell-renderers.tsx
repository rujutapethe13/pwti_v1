"use client";

import type { ColumnValue } from "../../types";
import { cn } from "@/lib/utils";

export interface BaseCellProps {
  value: ColumnValue;
  onChange?: (value: ColumnValue) => void;
  readOnly?: boolean;
}

export function TextCellRenderer({ value, onChange, readOnly }: BaseCellProps) {
  if (readOnly) {
    return <span className="truncate text-sm text-foreground">{String(value ?? "")}</span>;
  }
  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
    />
  );
}

export function NumberCellRenderer({ value, onChange, readOnly }: BaseCellProps) {
  if (readOnly) {
    return <span className="truncate text-sm text-foreground">{String(value ?? "")}</span>;
  }
  return (
    <input
      type="number"
      value={String(value ?? "")}
      onChange={(e) => onChange?.(Number(e.target.value))}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
    />
  );
}

export function DateCellRenderer({ value, onChange, readOnly }: BaseCellProps) {
  if (readOnly) {
    return <span className="truncate text-sm text-foreground">{String(value ?? "")}</span>;
  }
  return (
    <input
      type="date"
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
    />
  );
}

export function DropdownCellRenderer({
  value,
  onChange,
  readOnly,
  options = [],
}: BaseCellProps & { options?: string[] }) {
  if (readOnly) {
    return <span className="truncate text-sm text-foreground">{String(value ?? "—")}</span>;
  }
  return (
    <select
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

const STATUS_OPTIONS = ["Not Started", "In Progress", "Review", "Approved", "Done", "Blocked"] as const;

export function StatusCellRenderer({ value, onChange, readOnly }: BaseCellProps) {
  const current = String(value ?? "Not Started");
  const colors: Record<string, string> = {
    "Not Started": "bg-gray-100 text-gray-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Review: "bg-yellow-100 text-yellow-700",
    Approved: "bg-green-100 text-green-700",
    Done: "bg-emerald-100 text-emerald-700",
    Blocked: "bg-red-100 text-red-700",
  };

  if (readOnly) {
    return (
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", colors[current] || "bg-gray-100 text-gray-700")}>
        {current}
      </span>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

export function PersonCellRenderer({ value, onChange, readOnly }: BaseCellProps) {
  if (readOnly) {
    const name = String(value ?? "Unassigned");
    const initial = name.charAt(0).toUpperCase();
    return (
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
          {initial}
        </span>
        <span className="truncate text-sm text-foreground">{name}</span>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder="Assign user"
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
    />
  );
}
