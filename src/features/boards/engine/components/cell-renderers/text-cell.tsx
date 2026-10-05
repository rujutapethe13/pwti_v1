"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { resolveDisplayValue } from "./cell-renderer-registry";
import { Input } from "@/components/ui/input";

export function TextCell({
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
        {displayValue || <span className="text-muted-foreground italic">Empty</span>}
      </span>
    );
  }

  return (
    <Input
      value={displayValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder="Type here..."
      className="h-8 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}
