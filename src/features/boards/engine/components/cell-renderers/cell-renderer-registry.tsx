"use client";

/**
 * Cell Renderer Registry
 *
 * Resolves React components for cell rendering based on column type.
 * Built on top of the existing columnTypeRegistry — no switch statements.
 *
 * Future column types register their renderers here at app startup
 * via registerCellRenderer(), keeping the core engine pristine.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import { getCellRenderer } from "./cell-renderer-registry";
 *   const Renderer = getCellRenderer(column.type) ?? DefaultCellRenderer;
 *   return <Renderer value={value} column={column} ... />;
 * ────────────────────────────────────────────────────────────
 */

import type { ColumnTypeKey, ColumnValue, ColumnDefinition } from "../../types";
import type { ComponentType } from "react";

export interface CellRendererComponentProps {
  value: ColumnValue;
  column: ColumnDefinition;
  recordId: string;
  boardId: string;
  organizationId: string;
  workspaceId: string;
  readOnly?: boolean;
  onChange?: (value: ColumnValue) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  focused?: boolean;
}

export type CellRendererComponent = ComponentType<CellRendererComponentProps>;

// ── Registry ───────────────────────────────────────────────

const rendererMap = new Map<ColumnTypeKey, CellRendererComponent>();

export function registerCellRenderer(
  type: ColumnTypeKey,
  component: CellRendererComponent,
): void {
  rendererMap.set(type, component);
}

export function getCellRenderer(
  type: ColumnTypeKey,
): CellRendererComponent | undefined {
  return rendererMap.get(type);
}

export function registerCellRenderers(
  renderers: Record<string, CellRendererComponent>,
): void {
  for (const [type, component] of Object.entries(renderers)) {
    rendererMap.set(type as ColumnTypeKey, component);
  }
}

/**
 * Default fallback renderer — displays the value as plain text.
 */
export function DefaultCellRenderer({ value }: CellRendererComponentProps) {
  const displayValue = resolveDisplayValue(value);
  return <span className="truncate text-sm text-foreground">{displayValue}</span>;
}

export function resolveDisplayValue(value: ColumnValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
