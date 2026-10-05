/**
 * Widget Plugin Registry
 *
 * Self-registration pattern for widget plugins.
 * Widgets register themselves via registerWidget() — the registry
 * never imports a widget-specific switch/if-chain.
 *
 * New widget types (AI Insights, Automation, Realtime, Frame.io,
 * Power BI export, public/embedded dashboards) can be added later
 * by dropping in a new folder + registerWidget() call, with zero
 * changes to the engine.
 */

import type { ComponentType } from "react";
import type { WidgetPlugin, WidgetRenderProps } from "../dashboard-engine/types";

// ── Registry ───────────────────────────────────────────────

const widgetMap = new Map<string, WidgetPlugin>();

/**
 * Register a widget plugin.
 * Call this at app bootstrap from each widget's index.ts.
 */
export function registerWidget<TConfig = Record<string, unknown>>(
  plugin: WidgetPlugin<TConfig>,
): void {
  if (widgetMap.has(plugin.type)) {
    console.warn(`[WidgetRegistry] Widget "${plugin.type}" is already registered. Overwriting.`);
  }
  widgetMap.set(plugin.type, plugin as unknown as WidgetPlugin);
}

/**
 * Get a widget plugin by type key.
 */
export function getWidget(type: string): WidgetPlugin | undefined {
  return widgetMap.get(type);
}

/**
 * Get all registered widget plugins.
 */
export function getAllWidgets(): WidgetPlugin[] {
  return Array.from(widgetMap.values()).filter((w) => w);
}

/**
 * Get widget types by category (e.g. "chart.bar", "chart.line").
 */
export function getWidgetsByCategory(category: string): WidgetPlugin[] {
  return Array.from(widgetMap.values()).filter(
    (w) => w.type.startsWith(`${category}.`),
  );
}

/**
 * Get the render component for a widget type.
 */
export function getWidgetRenderer(type: string): ComponentType<WidgetRenderProps> | undefined {
  const plugin = widgetMap.get(type);
  return plugin?.render as ComponentType<WidgetRenderProps> | undefined;
}

/**
 * Check if a widget type is registered.
 */
export function hasWidget(type: string): boolean {
  return widgetMap.has(type);
}

/**
 * Get all registered widget type keys.
 */
export function getWidgetTypes(): string[] {
  return Array.from(widgetMap.keys());
}
