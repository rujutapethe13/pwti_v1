/**
 * Plugin Registry Types
 *
 * The Plugin Registry enables future column types, views, automations,
 * integrations, and AI capabilities to be registered without modifying
 * core CRUD engine code.
 *
 * ── Plugin Categories ──────────────────────────────────────
 * - ColumnTypePlugin  → Custom column type with renderer/formatter/validator
 * - ViewPlugin        → Custom board view (kanban, calendar, chart, etc.)
 * - ActionPlugin      → Custom mutation behavior (before/after hooks)
 * - IntegrationPlugin → External integrations (Slack, Google Drive, etc.)
 * ────────────────────────────────────────────────────────────
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type {
  ColumnTypeKey,
  ColumnValue,
  ColumnDefinition,
  CellRendererProps,
  SettingsPanelProps,
  ColumnValidationRule,
} from "../types";
import type { ViewRendererProps } from "../view-engine/view-engine-types";

// ── Plugin Identity ─────────────────────────────────────────

export type PluginCategory =
  | "column_type"
  | "view"
  | "action"
  | "integration"
  | "automation"
  | "ai";

export interface PluginManifest {
  /** Unique plugin identifier (e.g., "powerweave.column-type.rating") */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin category */
  category: PluginCategory;

  /** Plugin version (semver) */
  version: string;

  /** Description of what the plugin does */
  description: string;

  /** Author or organization */
  author?: string;

  /** Whether this plugin is enabled */
  enabled: boolean;

  /** Plugin-level metadata */
  metadata?: Record<string, unknown>;
}

// ── Column Type Plugin ─────────────────────────────────────

export interface ColumnTypeRenderer {
  /** React component for inline cell editing */
  cell: ComponentType<CellRendererProps>;

  /** React component for column settings panel */
  settings?: ComponentType<SettingsPanelProps>;

  /** Read-only display component */
  display?: ComponentType<CellRendererProps>;
}

export interface ColumnTypePlugin extends PluginManifest {
  category: "column_type";

  /** The column type key this plugin provides */
  columnType: ColumnTypeKey;

  /** Renderer components */
  renderers: ColumnTypeRenderer;

  /** Default value for new records */
  defaultValue: ColumnValue;

  /** Types this column can be migrated to */
  compatibleTypes: ColumnTypeKey[];

  /** Validation rules */
  validation?: ColumnValidationRule[];

  /** Custom format function */
  format?: (value: ColumnValue, column: ColumnDefinition) => string;

  /** Custom parse function (input → stored value) */
  parse?: (input: string | number | boolean, column: ColumnDefinition) => ColumnValue;

  /** Custom filter operators */
  filterOperators?: Array<{
    operator: string;
    label: string;
    apply: (value: ColumnValue, filterValue: ColumnValue) => boolean;
  }>;
}

// ── View Plugin ─────────────────────────────────────────────

export interface ViewPlugin extends PluginManifest {
  category: "view";

  /** View type identifier */
  viewType: string;

  /** Display icon */
  icon: LucideIcon;

  /** View component — receives ViewRendererProps from the View Engine */
  component: ComponentType<ViewRendererProps>;

  /** Whether this view is a placeholder (not yet implemented) */
  placeholder: boolean;
}

// ── Action Plugin ───────────────────────────────────────────

export interface ActionPlugin extends PluginManifest {
  category: "action";

  /** Which entity events to hook into */
  hooks: Array<{
    entity: string;
    action: string;
    phase: "before" | "after";
    handler: (context: ActionHookContext) => Promise<ActionHookResult>;
  }>;
}

export interface ActionHookContext {
  entityId: string;
  entityType: string;
  actorUserId: string;
  before: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ActionHookResult {
  /** Whether the action should proceed */
  proceed: boolean;
  /** Modified payload (allows hooks to transform data) */
  modifiedPayload?: Record<string, unknown>;
  /** Error message if not proceeding */
  error?: string;
}

// ── Integration Plugin ──────────────────────────────────────

export interface IntegrationPlugin extends PluginManifest {
  category: "integration";

  /** Connection configuration schema */
  configSchema: Record<string, unknown>;

  /** Test the connection */
  testConnection: (config: Record<string, unknown>) => Promise<boolean>;

  /** Webhook handler */
  handleWebhook?: (payload: Record<string, unknown>) => Promise<void>;
}

// ── Plugin Registry Interface ───────────────────────────────

export interface PluginRegistry {
  /** Register a plugin */
  register(plugin: BasePlugin): void;

  /** Unregister a plugin */
  unregister(pluginId: string): void;

  /** Get a plugin by ID */
  get(pluginId: string): BasePlugin | undefined;

  /** Get all plugins of a category */
  getByCategory(category: PluginCategory): BasePlugin[];

  /** Get column type renderers */
  getColumnTypeRenderer(columnType: ColumnTypeKey): ColumnTypeRenderer | undefined;

  /** Get view plugin */
  getViewPlugin(viewType: string): ViewPlugin | undefined;

  /** Get action plugins for a specific hook */
  getActionPlugins(
    entity: string,
    action: string,
    phase: "before" | "after",
  ): ActionPlugin[];

  /** Check if a plugin is registered */
  has(pluginId: string): boolean;

  /** Get all registered plugins */
  getAll(): BasePlugin[];

  /** Enable/disable a plugin */
  setEnabled(pluginId: string, enabled: boolean): void;
}

// ── Union Type ──────────────────────────────────────────────

export type BasePlugin =
  | ColumnTypePlugin
  | ViewPlugin
  | ActionPlugin
  | IntegrationPlugin;

// ── Future Service Interfaces ───────────────────────────────

/**
 * Import/Export Service Interface
 * To be implemented later for CSV, Excel, JSON import/export.
 */
export interface ImportExportService {
  exportBoard(boardId: string, format: "csv" | "json" | "xlsx"): Promise<Blob>;
  importBoard(boardId: string, file: File, format: "csv" | "json" | "xlsx"): Promise<void>;
}

/**
 * Background Job Interface
 * To be implemented later for async processing.
 */
export interface BackgroundJob {
  id: string;
  type: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Feature Flag Interface
 * To be implemented later for gradual feature rollout.
 */
export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  rules?: Array<{
    type: "percentage" | "user" | "workspace" | "org";
    value: string;
  }>;
}

