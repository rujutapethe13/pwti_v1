// ── Core Types & Definitions ───────────────────────────────
export * from "./types";
export * from "./registry";
export * from "./column-registry";
export * from "./migration";
export * from "./validation";
export * from "./dependency-graph";
export * from "./schema";
export * from "./state";

// ── Zod Schemas ────────────────────────────────────────────
export * from "./schemas";

// ── Event Bus & Subscribers ────────────────────────────────
export * from "./events";
export { eventBus } from "./events/event-bus";

// ── Plugin Registry ────────────────────────────────────────
export * from "./plugins";
export { pluginRegistry } from "./plugins/plugin-registry";

// ── Client Hooks ───────────────────────────────────────────
export * from "./hooks";

// ── Components ─────────────────────────────────────────────
export * from "./components/cell-renderer";
export * from "./components/cell-renderers";
export { registerAllCellRenderers } from "./components/cell-renderers";
export * from "./components/column-header";
export * from "./components/column-settings-panel";
export * from "./components/table-view";
export * from "./components/crud-toolbar";
export * from "./components/confirm-dialog";
export * from "./components/loading-overlay";

// ── Legacy Exports ─────────────────────────────────────────
export { viewCatalog as viewModes } from "./registry";
export type { ViewCatalogItem as ViewMode } from "./registry";

// ── View Engine ────────────────────────────────────────────
export { getDefaultSettings } from "./view-engine/view-engine-types";
export type { ViewEngineProps, ViewRendererProps } from "./view-engine/view-engine-types";
export { ViewEngine } from "./view-engine/view-engine";
export { ViewSwitcher } from "./view-engine/view-switcher";
