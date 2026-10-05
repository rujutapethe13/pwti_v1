"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";

export function PersonCell({
  value,
  readOnly,
  onChange,
  onKeyDown,
}: CellRendererComponentProps) {
  const displayValue = resolveDisplayValue(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value);
    },
    [onChange],
  );

  if (readOnly) {
    return (
      <span className="truncate text-sm text-foreground">
        {displayValue || <span className="text-muted-foreground italic">Unassigned</span>}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {displayValue && (
        <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {displayValue.charAt(0).toUpperCase()}
        </div>
      )}
      <input
        value={displayValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder="Assign..."
        className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      />
    </div>
  );
}
