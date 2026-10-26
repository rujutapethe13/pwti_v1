import type { ColumnDefinition } from "./types";

export type GroupColumnLayoutMode = "inherit" | "custom";

export interface BoardColumnLayout {
  boardId: string;
  columnIds: string[];
  columnWidths: Record<string, number>;
  hiddenColumnIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupColumnLayout {
  groupId: string;
  boardId: string;
  mode: GroupColumnLayoutMode;
  columnIds: string[];
  columnWidths: Record<string, number>;
  hiddenColumnIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function resolveGroupColumnIds(
  boardLayout: Pick<BoardColumnLayout, "columnIds">,
  groupLayout: Pick<GroupColumnLayout, "mode" | "columnIds"> | undefined,
  library: ColumnDefinition[],
): string[] {
  const allowed = new Set(library.map((column) => column.id));
  const ids = groupLayout?.mode === "custom" ? groupLayout.columnIds : boardLayout.columnIds;
  return ids.filter((id) => allowed.has(id));
}
