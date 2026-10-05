"use client";

/**
 * Cell Renderers Barrel
 *
 * Registers all built-in cell renderers with the cell renderer registry.
 * Import this once at the app root to populate the registry.
 * Future column types can call registerCellRenderer() directly from plugins.
 */

import type { ColumnTypeKey } from "../../types";
import { registerCellRenderer } from "./cell-renderer-registry";
import { DefaultCellRenderer } from "./cell-renderer-registry";
import { TextCell } from "./text-cell";
import { NumberCell } from "./number-cell";
import { CheckboxCell } from "./checkbox-cell";
import { StatusCell } from "./status-cell";
import { DateCell } from "./date-cell";
import { EmailCell } from "./email-cell";
import { UrlCell } from "./url-cell";
import { PersonCell } from "./person-cell";
import { LongTextCell } from "./long-text-cell";
import { ProgressCell } from "./progress-cell";
import { TagsCell } from "./tags-cell";
import { RatingCell } from "./rating-cell";
import { PlaceholderCell } from "./placeholder-cell";
import { ConnectedBoardCellRenderer } from "./connected-board-cell";
import { MirrorCellRenderer } from "./mirror-cell";
import { LookupCellRenderer } from "./lookup-cell";
import { RollupCellRenderer } from "./rollup-cell";
import { FormulaCellRenderer } from "./formula-cell";
import { DropdownCell } from "./dropdown-cell";

/**
 * Call this once at app bootstrap to register all built-in cell renderers.
 * Can be called in a layout or root provider.
 */
export function registerAllCellRenderers(): void {
  const coreTypes: Array<{ type: ColumnTypeKey; component: typeof DefaultCellRenderer }> = [
    { type: "text", component: TextCell },
    { type: "number", component: NumberCell },
    { type: "currency", component: NumberCell },
    { type: "date", component: DateCell },
    { type: "timeline", component: DateCell },
    { type: "checkbox", component: CheckboxCell },
    { type: "status", component: StatusCell },
    { type: "priority", component: StatusCell },
    { type: "dropdown", component: DropdownCell },
    { type: "multi_select", component: TagsCell },
    { type: "email", component: EmailCell },
    { type: "phone", component: TextCell },
    { type: "url", component: UrlCell },
    { type: "person", component: PersonCell },
    { type: "long_text", component: LongTextCell },
    { type: "progress", component: ProgressCell },
    { type: "tags", component: TagsCell },
    { type: "rating", component: RatingCell },
    { type: "files", component: TagsCell },
    // Connected Data Engine types
    { type: "connected_board", component: ConnectedBoardCellRenderer },
    { type: "mirror", component: MirrorCellRenderer },
    { type: "lookup", component: LookupCellRenderer },
    { type: "rollup", component: RollupCellRenderer },
    { type: "formula", component: FormulaCellRenderer },
    { type: "ai_field", component: PlaceholderCell },
    { type: "button", component: PlaceholderCell },
    { type: "time_tracking", component: PlaceholderCell },
  ];

  for (const { type, component } of coreTypes) {
    registerCellRenderer(type, component);
  }
}

export {
  registerCellRenderer,
  getCellRenderer,
  DefaultCellRenderer,
  resolveDisplayValue,
} from "./cell-renderer-registry";

export type { CellRendererComponentProps, CellRendererComponent } from "./cell-renderer-registry";
