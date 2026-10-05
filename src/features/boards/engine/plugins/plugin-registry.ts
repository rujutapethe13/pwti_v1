/**
 * Plugin Registry
 *
 * Central registry for all plugins:
 * - Column Type Plugins (custom renderers, validators, formatters)
 * - View Plugins (kanban, calendar, chart, etc.)
 * - Action Plugins (before/after hooks for CRUD)
 * - Integration Plugins (Slack, Google Drive, etc.)
 *
 * Future column types, views, automations, integrations, and AI
 * capabilities register here without modifying core engine code.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import { pluginRegistry } from "./plugins/plugin-registry";
 *   import { RatingColumnPlugin } from "./plugins/rating-column";
 *
 *   pluginRegistry.register(ratingColumnPlugin);
 *   const renderer = pluginRegistry.getColumnTypeRenderer("rating");
 * ────────────────────────────────────────────────────────────
 */

import type {
  BasePlugin,
  ColumnTypePlugin,
  ColumnTypeRenderer,
  PluginCategory,
  PluginRegistry,
  ViewPlugin,
  ActionPlugin,
} from "./plugin-types";

import type { ColumnTypeKey } from "../types";

class DefaultPluginRegistry implements PluginRegistry {
  private plugins = new Map<string, BasePlugin>();

  register(plugin: BasePlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[PluginRegistry] Plugin "${plugin.id}" is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, { ...plugin, enabled: plugin.enabled ?? true });
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  get(pluginId: string): BasePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getByCategory(category: PluginCategory): BasePlugin[] {
    return Array.from(this.plugins.values()).filter(
      (p) => p.category === category && p.enabled,
    );
  }

  getColumnTypeRenderer(columnType: ColumnTypeKey): ColumnTypeRenderer | undefined {
    const plugin = Array.from(this.plugins.values()).find(
      (p): p is ColumnTypePlugin =>
        p.category === "column_type" &&
        p.enabled &&
        (p as ColumnTypePlugin).columnType === columnType,
    );

    return plugin?.renderers;
  }

  getViewPlugin(viewType: string): ViewPlugin | undefined {
    return Array.from(this.plugins.values()).find(
      (p): p is ViewPlugin =>
        p.category === "view" && p.enabled && p.viewType === viewType,
    );
  }

  getActionPlugins(
    entity: string,
    action: string,
    phase: "before" | "after",
  ): ActionPlugin[] {
    return Array.from(this.plugins.values()).filter((p): p is ActionPlugin => {
      if (p.category !== "action" || !p.enabled) {
        return false;
      }
      const actionPlugin = p as ActionPlugin;
      return actionPlugin.hooks.some(
        (hook) =>
          hook.entity === entity &&
          hook.action === action &&
          hook.phase === phase,
      );
    });
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  getAll(): BasePlugin[] {
    return Array.from(this.plugins.values());
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.enabled = enabled;
    }
  }
}

// Singleton instance
export const pluginRegistry: PluginRegistry = new DefaultPluginRegistry();

