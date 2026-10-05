"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";

export function DateCell({
  value,
  readOnly,
  onChange,
  onKeyDown,
}: CellRendererComponentProps) {
  const displayValue = resolveDisplayValue(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value || null);
    },
    [onChange],
  );

  if (readOnly) {
    return (
      <span className="truncate text-sm text-foreground">
        {displayValue ? (
          <span className="text-sm tabular-nums">{displayValue}</span>
        ) : (
          <span className="text-muted-foreground italic">No date</span>
        )}
      </span>
    );
  }

  return (
    <input
      type="date"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      className="h-8 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}
