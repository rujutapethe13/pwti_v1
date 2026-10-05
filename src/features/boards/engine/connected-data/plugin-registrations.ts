/**
 * Connected Data — Plugin Registrations
 *
 * Registers the five new column types (Connected Board, Mirror, Lookup,
 * Rollup, Formula) through the existing Plugin Registry.
 *
 * The core engine dispatches by looking up the plugin, never via
 * switch/case on column type.
 *
 * ── How to Add a Sixth Derived Column Type ──────────────────
 * 1. Create the config type in types.ts
 * 2. Create the resolver service
 * 3. Create the cell renderer component
 * 4. Add a ColumnTypePlugin definition here
 * 5. Call pluginRegistry.register(yourPlugin)
 * 6. Register the cell renderer in the cell renderer registry
 *
 * No changes to the core engine are needed.
 * ────────────────────────────────────────────────────────────
 */

import { pluginRegistry } from "../plugins/plugin-registry";
import type { ColumnTypePlugin, ColumnTypeRenderer } from "../plugins/plugin-types";
import type { ColumnTypeKey } from "../types";

// ── Helper ──────────────────────────────────────────────────

import type { ColumnValue } from "../types";

function createColumnTypePlugin(
  columnType: ColumnTypeKey,
  name: string,
  description: string,
  defaultValue: ColumnValue,
  compatibleTypes: ColumnTypeKey[],
  renderers: ColumnTypeRenderer,
): ColumnTypePlugin {
  return {
    id: `powerweave.column-type.${columnType}`,
    name: `${name} Column`,
    category: "column_type",
    version: "1.0.0",
    description,
    enabled: true,
    columnType,
    renderers,
    defaultValue,
    compatibleTypes,
  };
}

// ── Connected Board Column Plugin ───────────────────────────

// Cell renderers are imported and registered at the component level.
// Here we register the plugin metadata so the core engine knows
// how to handle this column type.

export const connectedBoardPlugin: ColumnTypePlugin = createColumnTypePlugin(
  "connected_board",
  "Connected Board",
  "Reference to records in another board. Creates a relationship between boards.",
  null,
  ["text"],
  {
    cell: null as unknown as ColumnTypeRenderer["cell"], // Registered in cell-renderers/index.tsx
  },
);

// ── Mirror Column Plugin ────────────────────────────────────

export const mirrorPlugin: ColumnTypePlugin = createColumnTypePlugin(
  "mirror",
  "Mirror",
  "Read-only value mirrored from a connected record's column. Updates live when the source changes.",
  null,
  ["text", "number", "status", "date"],
  {
    cell: null as unknown as ColumnTypeRenderer["cell"],
  },
);

// ── Lookup Column Plugin ────────────────────────────────────

export const lookupPlugin: ColumnTypePlugin = createColumnTypePlugin(
  "lookup",
  "Lookup",
  "Retrieves a value across a relationship chain (e.g., Production → PO → Vendor → Vendor GST).",
  null,
  ["text", "number", "status", "date"],
  {
    cell: null as unknown as ColumnTypeRenderer["cell"],
  },
);

// ── Rollup Column Plugin ────────────────────────────────────

export const rollupPlugin: ColumnTypePlugin = createColumnTypePlugin(
  "rollup",
  "Rollup",
  "Aggregates values across a one-to-many relationship: count, sum, average, min, max, etc.",
  null,
  ["number", "currency", "text"],
  {
    cell: null as unknown as ColumnTypeRenderer["cell"],
  },
);

// ── Formula Column Plugin ───────────────────────────────────

export const formulaPlugin: ColumnTypePlugin = createColumnTypePlugin(
  "formula",
  "Formula",
  "Computed value using expressions over Mirrors, Lookups, Rollups, and static values.",
  null,
  ["number", "currency", "text", "status", "date", "checkbox"],
  {
    cell: null as unknown as ColumnTypeRenderer["cell"],
  },
);

// ── Register All Plugins ────────────────────────────────────

/**
 * Register all connected data column type plugins with the Plugin Registry.
 * Call once during application startup.
 */
export function registerConnectedDataPlugins(): void {
  pluginRegistry.register(connectedBoardPlugin);
  pluginRegistry.register(mirrorPlugin);
  pluginRegistry.register(lookupPlugin);
  pluginRegistry.register(rollupPlugin);
  pluginRegistry.register(formulaPlugin);
}

