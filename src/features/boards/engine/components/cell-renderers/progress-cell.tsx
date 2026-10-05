"use client";

import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function ProgressCell({
  value,
}: CellRendererComponentProps) {
  const progress = typeof value === "number" ? Math.min(Math.max(value, 0), 100) : 0;
  const displayValue = `${Math.round(progress)}%`;

  return (
    <div className="flex items-center gap-2 px-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {displayValue}
      </span>
    </div>
  );
}
