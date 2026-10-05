"use client";

/**
 * Lookup Cell Renderer
 *
 * Read-only display of a value resolved across a relationship chain.
 * Uses the DefaultCellRenderer to display the resolved value.
 */

import { DefaultCellRenderer } from "./cell-renderer-registry";
import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function LookupCellRenderer(props: CellRendererComponentProps) {
  // Lookup columns are ALWAYS read-only
  if (!props.value && props.value !== 0 && props.value !== false) {
    return <span className="text-sm text-muted-foreground italic">—</span>;
  }

  return (
    <div className="relative group">
      <DefaultCellRenderer {...props} readOnly={true} />
    </div>
  );
}

