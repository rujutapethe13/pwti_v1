import type { ColumnDefinition } from "../types";

const TEXT_COMPATIBLE_TYPES = new Set(["text", "long_text", "email", "phone", "url"]);

export function isTextCompatibleColumn(column: ColumnDefinition): boolean {
  return TEXT_COMPATIBLE_TYPES.has(column.type);
}

/**
 * Resolve the primary column without relying on its display position.
 * Legacy boards fall back to their first text column, then their first column.
 */
export function getPrimaryColumn(
  columns: ColumnDefinition[],
  scope?: { groupId?: string | null },
): ColumnDefinition | undefined {
  const scoped = scope?.groupId
    ? columns.filter((column) => column.groupId === scope.groupId)
    : columns.filter((column) => !column.groupId);
  return scoped.find((column) => column.isPrimary)
    ?? scoped.find(isTextCompatibleColumn)
    ?? scoped[0];
}

export function repairPrimaryColumn(columns: ColumnDefinition[]): ColumnDefinition[] {
  const hasPrimary = columns.some((c) => c.isPrimary);
  if (hasPrimary) return columns;
  // mark first text-compatible (or first) column as primary
  const target = columns.find(isTextCompatibleColumn) ?? columns[0];
  if (!target) return columns;
  return columns.map((c) => (c.id === target.id ? { ...c, isPrimary: true } : c));
}
export function setPrimaryColumn(
  columns: ColumnDefinition[],
  columnId: string,
): ColumnDefinition[] {
  const target = columns.find((column) => column.id === columnId);
  if (!target || !isTextCompatibleColumn(target)) return columns;
  return columns.map((column) => {
    const sameScope = (column.groupId ?? null) === (target.groupId ?? null);
    return sameScope ? { ...column, isPrimary: column.id === columnId } : column;
  });
}
