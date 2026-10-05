"use client";

import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function PlaceholderCell({ column }: CellRendererComponentProps) {
  return (
    <span className="truncate text-sm italic text-muted-foreground">
      {column.label} ({column.type})
    </span>
  );
}
