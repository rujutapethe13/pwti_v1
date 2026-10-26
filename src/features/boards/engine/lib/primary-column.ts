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
