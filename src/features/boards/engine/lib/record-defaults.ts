import { EMPTY_CONNECTED_BOARD_VALUE, type ColumnDefinition, type ColumnValue } from "../types";
import { getColumnTypeDefinition } from "../column-registry";

const DERIVED_COLUMN_TYPES = new Set(["mirror", "lookup", "rollup", "formula"]);

export function buildInitialCellValues(
  columns: ColumnDefinition[],
): Record<string, ColumnValue> {
  const values: Record<string, ColumnValue> = {};
  for (const column of columns) {
    if (DERIVED_COLUMN_TYPES.has(column.type)) continue;

    let value = column.defaultValue;
    if (value === undefined || value === "null") {
      value = getColumnTypeDefinition(column.type).defaultValue;
    }
    if (column.type === "connected_board" && (value === null || value === "null")) {
      value = { ...EMPTY_CONNECTED_BOARD_VALUE };
    }
    values[column.id] = value;
  }
  return values;
}
