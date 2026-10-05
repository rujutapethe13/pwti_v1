"use client";

/**
 * Rollup Cell Renderer
 *
 * Read-only display of an aggregated value across a one-to-many relationship.
 * Shows the aggregation result (count, sum, average, etc.).
 */

import { DefaultCellRenderer, resolveDisplayValue } from "./cell-renderer-registry";
import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function RollupCellRenderer(props: CellRendererComponentProps) {
  // Rollup columns are ALWAYS read-only
  if (!props.value && props.value !== 0 && props.value !== false) {
    return <span className="text-sm text-muted-foreground italic">—</span>;
  }

  // For numeric rollups, show formatted value
  if (typeof props.value === "number") {
    return (
      <span className="text-sm font-medium tabular-nums text-foreground">
        {props.value.toLocaleString()}
      </span>
    );
  }

  return (
    <div className="relative group">
      <DefaultCellRenderer {...props} readOnly={true} />
    </div>
  );
}

