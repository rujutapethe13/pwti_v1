"use client";

import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";

export function EmailCell({
  value,
  readOnly,
}: CellRendererComponentProps) {
  const displayValue = resolveDisplayValue(value);

  if (readOnly) {
    return (
      <span className="truncate text-sm text-foreground">
        {displayValue || <span className="text-muted-foreground italic">—</span>}
      </span>
    );
  }

  if (displayValue) {
    return (
      <a
        href={`mailto:${displayValue}`}
        className="truncate text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        onClick={(e) => e.stopPropagation()}
      >
        {displayValue}
      </a>
    );
  }

  return (
    <span className="truncate text-sm italic text-muted-foreground">—</span>
  );
}
