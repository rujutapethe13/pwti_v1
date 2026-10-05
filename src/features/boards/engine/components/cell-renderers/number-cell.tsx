"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";

export function NumberCell({
  value,
  readOnly,
  onChange,
  onKeyDown,
}: CellRendererComponentProps) {
  const displayValue = resolveDisplayValue(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        onChange?.(null);
        return;
      }
      const num = Number(raw);
      if (!Number.isNaN(num)) {
        onChange?.(num);
      }
    },
    [onChange],
  );

  if (readOnly) {
    return (
      <span className="truncate text-sm tabular-nums text-foreground">
        {displayValue || <span className="text-muted-foreground italic">—</span>}
      </span>
    );
  }

  return (
    <input
      type="number"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder="0"
      className="h-8 w-full border-0 bg-transparent px-2 text-sm tabular-nums shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}
