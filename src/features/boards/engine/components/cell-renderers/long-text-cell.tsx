"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";

export function LongTextCell({
  value,
  readOnly,
  onChange,
  onKeyDown,
}: CellRendererComponentProps) {
  const displayValue = resolveDisplayValue(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e.target.value);
    },
    [onChange],
  );

  if (readOnly) {
    return (
      <span className="line-clamp-2 text-sm text-foreground">
        {displayValue || <span className="text-muted-foreground italic">—</span>}
      </span>
    );
  }

  return (
    <textarea
      value={displayValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder="Write..."
      rows={3}
      className="min-h-10 w-full border-0 bg-transparent px-2 py-1 text-sm shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}
