import type { ColumnDefinition, ColumnValue, ValidationContext, ValidationResult } from "./types";

export function validateCellValue(column: ColumnDefinition, value: ColumnValue, recordValues: Record<string, ColumnValue>): ValidationResult[] {
  const context: ValidationContext = {
    boardId: column.boardId,
    columnId: column.id,
    value,
    recordValues,
    column,
  };

  const results: ValidationResult[] = [];

  if (column.required && (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0))) {
    results.push({ valid: false, message: `${column.label} is required.` });
  }

  for (const rule of column.validation) {
    const result = rule.validate(context);
    if (!result.valid) {
      results.push(result);
    }
  }

  return results;
}

export function validateRecordValues(columns: ColumnDefinition[], recordValues: Record<string, ColumnValue>): ValidationResult[] {
  return columns.flatMap((column) => validateCellValue(column, recordValues[column.id] ?? column.defaultValue, recordValues));
}
