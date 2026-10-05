import { columnCompatibilityMatrix, columnTypeRegistry, getColumnTypeDefinition } from "./column-registry";
import type { ColumnDefinition, ColumnDefinitionSnapshot, ColumnTypeKey, MigrationPreview, MigrationResult, ColumnValue } from "./types";

function snapshotColumn(column: ColumnDefinition): ColumnDefinitionSnapshot {
  return {
    key: column.key,
    label: column.label,
    description: column.description,
    type: column.type,
    required: column.required,
    hidden: column.hidden,
    frozen: column.frozen,
    defaultValue: column.defaultValue,
    settings: column.settings,
    validation: column.validation,
  };
}

function isConvertibleValue(fromType: ColumnTypeKey, toType: ColumnTypeKey, value: ColumnValue): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (!columnCompatibilityMatrix[fromType].includes(toType)) {
    return false;
  }

  if (fromType === toType) {
    return true;
  }

  if (toType === "checkbox") {
    return typeof value === "boolean" || value === 0 || value === 1 || value === "true" || value === "false";
  }

  if (["number", "currency", "rating", "progress"].includes(toType)) {
    return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)));
  }

  return true;
}

export function previewColumnTypeMigration(args: {
  column: ColumnDefinition;
  toType: ColumnTypeKey;
  values: Array<{ recordId: string; value: ColumnValue }>;
}): MigrationPreview {
  const { column, toType, values } = args;
  const sampleValues = values.slice(0, 5).map((entry) => ({
    recordId: entry.recordId,
    before: entry.value,
    after: isConvertibleValue(column.type, toType, entry.value) ? coerceValue(toType, entry.value) : null,
  }));

  return {
    fromType: column.type,
    toType,
    affectedRecordCount: values.length,
    clearedValueCount: values.filter((entry) => !isConvertibleValue(column.type, toType, entry.value)).length,
    coercibleValueCount: values.filter((entry) => isConvertibleValue(column.type, toType, entry.value)).length,
    sampleValues,
  };
}

export function migrateColumnType(args: {
  column: ColumnDefinition;
  toType: ColumnTypeKey;
  values: Array<{ recordId: string; value: ColumnValue }>;
}): MigrationResult {
  const { column, toType, values } = args;
  const nextDefinition = getColumnTypeDefinition(toType);
  const updatedValues = values.map((entry) => ({
    recordId: entry.recordId,
    value: isConvertibleValue(column.type, toType, entry.value) ? coerceValue(toType, entry.value) : nextDefinition.defaultValue,
  }));

  return {
    columnId: column.id,
    fromType: column.type,
    toType,
    snapshot: snapshotColumn(column),
    updatedValues,
    clearedValueCount: updatedValues.filter((entry) => entry.value === nextDefinition.defaultValue || entry.value === null).length,
    warnings: columnCompatibilityMatrix[column.type].includes(toType)
      ? []
      : [`Migrating from ${column.type} to ${toType} may clear incompatible values.`],
  };
}

export function coerceValue(type: ColumnTypeKey, value: ColumnValue): ColumnValue {
  if (value === null || value === undefined) {
    return getColumnTypeDefinition(type).defaultValue;
  }

  switch (type) {
    case "number":
    case "currency":
    case "rating":
    case "progress":
      return typeof value === "number" ? value : Number(value);
    case "checkbox":
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      return String(value).toLowerCase() === "true";
    case "multi_select":
    case "tags":
      return Array.isArray(value) ? value : [String(value)];
    case "timeline":
      return typeof value === "object" ? value : { start: String(value), end: null };
    default:
      return value;
  }
}
