"use client";

/**
 * Formula Cell Renderer
 *
 * Read-only display of a computed formula value.
 * Supports all formula return types: string, number, boolean, date.
 */

import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function FormulaCellRenderer({ value }: CellRendererComponentProps) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground italic">—</span>;
  }

  // Display #ERROR messages from the Formula Engine
  if (typeof value === "string" && value.startsWith("#ERROR")) {
    return (
      <span className="text-sm text-destructive italic" title={value}>
        {value}
      </span>
    );
  }

  // Boolean values
  if (typeof value === "boolean") {
    return (
      <span className="text-sm">
        {value ? (
          <span className="text-green-600 dark:text-green-400">✓ True</span>
        ) : (
          <span className="text-muted-foreground">✗ False</span>
        )}
      </span>
    );
  }

  // Number values
  if (typeof value === "number") {
    return (
      <span className="text-sm font-medium tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
    );
  }

  // String values (including dates)
  return (
    <span className="text-sm text-foreground truncate">
      {String(value)}
    </span>
  );
}

