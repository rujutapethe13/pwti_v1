"use client";

/**
 * Advanced Filter Panel
 *
 * Right-side slide-out panel for building complex filters with multiple
 * conditions. Supports column-specific condition types and dynamically
 * populated value dropdowns based on actual board data.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronRight,
  Plus,
  X,
  Check,
  Filter,
  ChevronDown,
} from "lucide-react";
import { isAfter, isBefore, isToday, isPast, isFuture, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, addDays, subDays } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { ColumnDefinition, ColumnValue } from "../../types";
import {
  getColumnOptions,
  isOptionColumnType,
  resolveOptionDisplay,
} from "../../lib/option-lookup";

// ── Types ──────────────────────────────────────────────────

interface FilterCondition {
  id: string;
  columnId: string;
  operator: string;
  value: ColumnValue;
}

interface AdvancedFilterPanelProps {
  columns: ColumnDefinition[];
  records: Array<{ id: string; title: string }>;
  cellValues: Map<string, ColumnValue>;
  onClose: () => void;
  onApply: (filters: FilterCondition[]) => void;
  /** Pre-existing filters to edit (defaults to a single empty row). */
  initialFilters?: FilterCondition[];
}

// ── Condition options by column type ──────────────────────

const CONDITION_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  text: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  long_text: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  number: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lte", label: "Less than or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  currency: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lte", label: "Less than or equal" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  date: [
    { value: "relative", label: "Relative date" },
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Is between" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  timeline: [
    { value: "relative", label: "Relative date" },
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Is between" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  status: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  priority: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  dropdown: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  multi_select: [
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does not contain" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  checkbox: [
    { value: "is_true", label: "Is checked" },
    { value: "is_false", label: "Is unchecked" },
  ],
  person: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "is_one_of", label: "Is one of" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  email: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  phone: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  url: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  tags: [
    { value: "contains", label: "Contains" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  files: [
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  rating: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
  progress: [
    { value: "is", label: "Is" },
    { value: "is_not", label: "Is not" },
    { value: "gt", label: "Greater than" },
    { value: "lt", label: "Less than" },
    { value: "is_empty", label: "Is empty" },
    { value: "not_empty", label: "Is not empty" },
  ],
};

const DEFAULT_CONDITIONS: Array<{ value: string; label: string }> = [
  { value: "is", label: "Is" },
  { value: "is_not", label: "Is not" },
  { value: "contains", label: "Contains" },
  { value: "is_empty", label: "Is empty" },
  { value: "not_empty", label: "Is not empty" },
];

// ── Relative date options ───────────────────────────────────

const RELATIVE_DATE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "done_on_time", label: "Done on time" },
  { value: "done_overdue", label: "Done overdue" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "next_week", label: "Next week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "next_month", label: "Next month" },
  { value: "past_dates", label: "Past Dates" },
  { value: "future_dates", label: "Future Dates" },
  { value: "upcoming", label: "Upcoming" },
  { value: "blank", label: "Blank" },
];

// ── Helpers ────────────────────────────────────────────────

let conditionIdCounter = 0;
function generateConditionId(): string {
  return `cond-${++conditionIdCounter}`;
}

function getUniqueValues(column: ColumnDefinition, records: Array<{ id: string; title: string }>, cellValues: Map<string, ColumnValue>, isClientName = false): Array<{ id: string; label: string }> {
  const values = new Set<string>();
  for (const record of records) {
    // For Client Name pseudo-column, use record title
    if (isClientName) {
      if (record.title) {
        values.add(record.title);
      }
      continue;
    }
    const val = cellValues.get(`${record.id}:${column.id}`);
    if (val != null && val !== "") {
      values.add(String(val));
    }
  }
  // Option columns store the option id in the cell but the filter UI must show
  // the option's label. The id stays as the filter value so matching against
  // cells (which hold ids) keeps working.
  const optionValues = isOptionColumnType(column.type);
  return Array.from(values)
    .map((v) =>
      optionValues
        ? (() => {
            const resolved = resolveOptionDisplay(getColumnOptions(column), v);
            return { id: v, label: resolved.isUnknown ? "" : resolved.label };
          })()
        : { id: v, label: v },
    )
    .filter((v) => v.label !== "")
    .sort((a, b) => a.label.localeCompare(b.label));
}

function needsValueInput(operator: string): boolean {
  return !["is_empty", "not_empty", "is_true", "is_false", "overdue", "today", "this_week", "this_month", "next_month", "last_month", "done_on_time", "done_overdue", "tomorrow", "yesterday", "last_week", "next_week", "past_dates", "future_dates", "upcoming", "blank"].includes(operator);
}

function isRelativeDateOperator(operator: string): boolean {
  return operator === "relative";
}

function isMultiSelectOperator(operator: string): boolean {
  return ["is_one_of", "contains", "not_contains"].includes(operator);
}

function isDateOperator(operator: string): boolean {
  return ["relative", "overdue", "today", "this_week", "this_month", "next_month", "last_month", "done_on_time", "done_overdue", "tomorrow", "yesterday", "last_week", "next_week", "past_dates", "future_dates", "upcoming", "blank"].includes(operator);
}

function isSingleDateOperator(operator: string): boolean {
  return ["before", "after", "is", "is_not"].includes(operator);
}

function isDateRangeOperator(operator: string): boolean {
  return operator === "between";
}

// ── Component ───────────────────────────────────────────────

export function AdvancedFilterPanel({
  columns,
  records,
  cellValues,
  onClose,
  onApply,
  initialFilters,
}: AdvancedFilterPanelProps) {
  const [filters, setFilters] = useState<FilterCondition[]>(
    initialFilters && initialFilters.length > 0
      ? initialFilters
      : [{ id: generateConditionId(), columnId: "", operator: "is", value: "" }],
  );
  const [filterValidity, setFilterValidity] = useState<Record<string, boolean>>({});

  // Check if any filter has invalid state (e.g., invalid date range)
  const hasInvalidFilters = Object.values(filterValidity).some((valid) => !valid);

  const handleFilterValidation = useCallback((filterId: string, isValid: boolean) => {
    setFilterValidity((prev) => ({ ...prev, [filterId]: isValid }));
  }, []);

  // Filterable columns (exclude certain types)
  // Add "Client Name" as a pseudo-column that maps to record titles
  const filterableColumns = useMemo(() => {
    const clientNameColumn: ColumnDefinition = {
      id: "__client_name",
      boardId: "",
      key: "client_name",
      label: "Client Name",
      type: "text",
      required: false,
      hidden: false,
      frozen: false,
      defaultValue: "",
      settings: {},
      permissions: { view: [], edit: [], configure: [] },
      validation: [],
      version: 1,
      order: -1,
      createdAt: "",
      updatedAt: "",
    };
    return [clientNameColumn, ...columns.filter((c) => !["formula", "button", "ai_field", "mirror", "lookup", "rollup"].includes(c.type))];
  }, [columns]);

  const getColumn = useCallback((columnId: string) => {
    if (columnId === "__client_name") {
      return filterableColumns.find((c) => c.id === "__client_name") || null;
    }
    return columns.find((c) => c.id === columnId);
  }, [columns, filterableColumns]);

  const getConditionsForColumn = useCallback((columnId: string) => {
    const col = getColumn(columnId);
    if (!col) return DEFAULT_CONDITIONS;
    return CONDITION_OPTIONS[col.type] || DEFAULT_CONDITIONS;
  }, [getColumn]);

  const getValueOptions = useCallback((columnId: string) => {
    const col = getColumn(columnId);
    if (!col) return [];
    if (["status", "priority", "dropdown"].includes(col.type)) {
      return getColumnOptions(col);
    }
    if (col.type === "person" || col.type === "text") {
      return getUniqueValues(col, records, cellValues, columnId === "__client_name");
    }
    return [];
  }, [getColumn, records, cellValues]);

  const addFilter = useCallback(() => {
    setFilters((prev) => [
      ...prev,
      { id: generateConditionId(), columnId: "", operator: "is", value: "" },
    ]);
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.length > 1 ? prev.filter((f) => f.id !== id) : prev);
  }, []);

  const updateFilter = useCallback((id: string, updates: Partial<FilterCondition>) => {
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...updates };
        // Reset value when column or operator changes
        if (updates.columnId && updates.columnId !== f.columnId) {
          updated.value = Array.isArray(updates.value) ? updates.value : [];
        }
        if (updates.operator && updates.operator !== f.operator) {
          if (isDateOperator(updates.operator)) {
            updated.value = "";
          } else if (!needsValueInput(updates.operator)) {
            updated.value = "";
          }
        }
        return updated;
      })
    );
  }, []);

  const handleClearAll = useCallback(() => {
    setFilters([{ id: generateConditionId(), columnId: "", operator: "is", value: "" }]);
  }, []);

  const handleApply = useCallback(() => {
    if (hasInvalidFilters) return;
    const validFilters = filters.filter((f) => f.columnId && f.operator);
    onApply(validFilters);
  }, [filters, onApply, hasInvalidFilters]);

  const filteredCount = useMemo(() => {
    // Simulate filtered count based on active filters
    const activeFilters = filters.filter((f) => f.columnId && f.operator);
    if (activeFilters.length === 0) return records.length;
    return records.filter((record) => {
      return activeFilters.every((filter) => {
        // Handle Client Name pseudo-column
        if (filter.columnId === "__client_name") {
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          if (values.length === 0 || (values.length === 1 && values[0] === "")) return true;
          return values.some((v) => String(v).toLowerCase() === record.title.toLowerCase());
        }
        const col = getColumn(filter.columnId);
        if (!col) return true;
        const cellValue = cellValues.get(`${record.id}:${filter.columnId}`);
        return evaluateFilter(cellValue, filter.operator, filter.value, col.type);
      });
    }).length;
  }, [filters, records, cellValues, getColumn]);

  const totalCount = records.length;

  return (
    <div className="flex h-full w-96 flex-col border-l border-border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Advanced filters</h2>
        </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close filters">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Task count + actions */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm text-muted-foreground">
          {filteredCount === totalCount
            ? `Showing all of ${totalCount} tasks`
            : `Showing ${filteredCount} of ${totalCount} tasks`}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-sm text-muted-foreground hover:text-foreground" onClick={handleClearAll}>
            Clear all
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-sm text-blue-600 hover:text-blue-700">
            Save to this view
          </Button>
        </div>
      </div>

      {/* Filter rows */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="space-y-3">
          {/* "Where" label */}
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground">Where</span>
          </div>

          {filters.map((filter, index) => (
            <FilterRow
              key={filter.id}
              filter={filter}
              index={index}
              columns={filterableColumns}
              conditions={getConditionsForColumn(filter.columnId)}
              valueOptions={getValueOptions(filter.columnId)}
              onUpdate={(updates) => updateFilter(filter.id, updates)}
              onRemove={() => removeFilter(filter.id)}
              canRemove={filters.length > 1}
              onValidationChange={(isValid) => handleFilterValidation(filter.id, isValid)}
            />
          ))}

          {/* Add buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={addFilter}>
              <Plus className="size-3" />
              New filter
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-sm text-muted-foreground hover:text-foreground">
              <Plus className="size-3" />
              New group
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" className="h-7 text-sm text-muted-foreground hover:text-foreground">
          Switch to quick filters
        </Button>
        <Button
          size="sm"
          className="h-7 text-sm"
          onClick={handleApply}
          disabled={hasInvalidFilters}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

// ── Filter Row Component ────────────────────────────────────

interface FilterRowProps {
  filter: FilterCondition;
  index: number;
  columns: ColumnDefinition[];
  conditions: Array<{ value: string; label: string }>;
  valueOptions: Array<{ id: string; label: string; color?: string }>;
  onUpdate: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

function FilterRow({ filter, index, columns, conditions, valueOptions, onUpdate, onRemove, canRemove, onValidationChange }: FilterRowProps) {
  const [valueInput, setValueInput] = useState("");
  const [relativeDateValue, setRelativeDateValue] = useState("");
  const [singleDateValue, setSingleDateValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const onValidationChangeRef = useRef(onValidationChange);
  onValidationChangeRef.current = onValidationChange;

   const selectedColumn = columns.find((c) => c.id === filter.columnId);
   const showValueInput = filter.columnId && needsValueInput(filter.operator);
   const isMultiSelect = isMultiSelectOperator(filter.operator);
   const isDateColumn = selectedColumn?.type === "date" || selectedColumn?.type === "timeline";
   const isDateOp = isDateColumn && isDateOperator(filter.operator);
   const isRelativeDate = isDateColumn && isRelativeDateOperator(filter.operator);
   const isSingleDate = isDateColumn && isSingleDateOperator(filter.operator);
   const isDateRange = isDateColumn && isDateRangeOperator(filter.operator);

  // Validate date range: end date must be after start date
  const isRangeInvalid = isDateRange && startDate && endDate && new Date(endDate) < new Date(startDate);

  // Notify parent of validation state changes
   useEffect(() => {
     onValidationChangeRef.current?.(!isRangeInvalid);
   }, [isRangeInvalid]);

  // Sync multiSelectValues with filter.value for multi-select operators
  const multiSelectValues = useMemo(() => {
    if (isMultiSelect && Array.isArray(filter.value)) {
      return new Set(filter.value as string[]);
    }
    return new Set<string>();
  }, [isMultiSelect, filter.value]);

  const handleColumnSelect = (columnId: string) => {
    // Set default operator based on column type
    const col = columns.find((c) => c.id === columnId);
    let defaultOperator = "is";
    if (col && ["status", "priority", "dropdown", "person"].includes(col.type)) {
      defaultOperator = "is_one_of";
    }
    onUpdate({ columnId, operator: defaultOperator, value: [] });
    setValueInput("");
    setRelativeDateValue("");
    setSingleDateValue("");
    setStartDate("");
    setEndDate("");
  };

  const handleOperatorSelect = (operator: string) => {
    onUpdate({ operator });
    setValueInput("");
    setRelativeDateValue("");
    setSingleDateValue("");
    setStartDate("");
    setEndDate("");
  };

  const handleValueSelect = (optionId: string) => {
    if (isMultiSelect) {
      const newSet = new Set(Array.isArray(filter.value) ? filter.value as string[] : []);
      if (newSet.has(optionId)) {
        newSet.delete(optionId);
      } else {
        newSet.add(optionId);
      }
      onUpdate({ value: Array.from(newSet) });
    } else {
      // Single select: toggle off if same value clicked
      if (filter.value === optionId) {
        onUpdate({ value: "" });
      } else {
        onUpdate({ value: optionId });
      }
    }
  };

  const handleRelativeDateSelect = (value: string) => {
    setRelativeDateValue(value);
    onUpdate({ value: value });
  };

  const handleSingleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSingleDateValue(e.target.value);
    onUpdate({ value: e.target.value });
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    const currentValue = Array.isArray(filter.value) ? (filter.value as string[]) : ["", ""];
    onUpdate({ value: [e.target.value, currentValue[1] || ""] });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    const currentValue = Array.isArray(filter.value) ? (filter.value as string[]) : ["", ""];
    onUpdate({ value: [currentValue[0] || "", e.target.value] });
  };

  // Check if a pill is selected
  const isPillSelected = (optId: string): boolean => {
    if (isMultiSelect) {
      return Array.isArray(filter.value) ? (filter.value as string[]).includes(optId) : false;
    }
    return filter.value === optId;
  };

  return (
    <div className={cn("rounded-lg border border-border bg-card p-2", index > 0 && "mt-1")}>
      {/* Connector */}
      {index > 0 && (
        <div className="mb-1 flex items-center gap-1 pl-1">
          <span className="rounded bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground">And</span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {/* Column selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 min-w-[100px] justify-between gap-1 text-sm">
              <span className="truncate">{selectedColumn?.label || "Column"}</span>
              <ChevronRight className="size-3 rotate-90 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-sm uppercase text-muted-foreground">Board fields</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columns.map((col) => (
              <DropdownMenuItem
                key={col.id}
                onSelect={() => handleColumnSelect(col.id)}
                className={cn("text-sm", col.id === filter.columnId && "bg-accent")}
              >
                <span className="truncate">{col.label}</span>
                {col.id === filter.columnId && <Check className="ml-auto size-3" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Condition selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 min-w-[90px] justify-between gap-1 text-sm">
              <span className="truncate">
                {conditions.find((c) => c.value === filter.operator)?.label || "Is"}
              </span>
              <ChevronRight className="size-3 rotate-90 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {conditions.map((cond) => (
              <DropdownMenuItem
                key={cond.value}
                onSelect={() => handleOperatorSelect(cond.value)}
                className={cn("text-sm", cond.value === filter.operator && "bg-accent")}
              >
                {cond.label}
                {cond.value === filter.operator && <Check className="ml-auto size-3" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Remove button */}
        {canRemove && (
          <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onRemove} aria-label="Remove filter">
            <X className="size-3 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Value selector */}
      {showValueInput && (
        <div className="mt-1.5">
          {isRelativeDate ? (
            /* Relative date dropdown */
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 w-full justify-between gap-1 text-sm">
                  <span className="truncate">
                    {RELATIVE_DATE_OPTIONS.find((o) => o.value === relativeDateValue)?.label || "Select date range..."}
                  </span>
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {RELATIVE_DATE_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onSelect={() => handleRelativeDateSelect(opt.value)}
                    className={cn("text-sm", opt.value === relativeDateValue && "bg-accent")}
                  >
                    {opt.label}
                    {opt.value === relativeDateValue && <Check className="ml-auto size-3" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : isDateOp ? (
            <div className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
              {filter.operator === "overdue" && "Before today"}
              {filter.operator === "today" && "Today"}
              {filter.operator === "this_week" && "This week"}
              {filter.operator === "this_month" && "This month"}
              {filter.operator === "next_month" && "Next month"}
              {filter.operator === "last_month" && "Last month"}
            </div>
          ) : isSingleDate ? (
            /* Single date picker for Before/After/Is/Is not */
            <input
              type="date"
              className="h-7 w-full rounded border border-input bg-background px-2 text-sm"
              value={singleDateValue}
              onChange={handleSingleDateChange}
            />
          ) : isDateRange ? (
            /* Date range picker for Is between */
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  className={cn(
                    "h-7 flex-1 rounded border bg-background px-2 text-sm",
                    isRangeInvalid ? "border-red-500" : "border-input"
                  )}
                  value={startDate}
                  onChange={handleStartDateChange}
                  placeholder="Start date"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <input
                  type="date"
                  className={cn(
                    "h-7 flex-1 rounded border bg-background px-2 text-sm",
                    isRangeInvalid ? "border-red-500" : "border-input"
                  )}
                  value={endDate}
                  onChange={handleEndDateChange}
                  placeholder="End date"
                />
              </div>
              {isRangeInvalid && (
                <p className="text-sm text-red-600">End date must be after start date</p>
              )}
            </div>
          ) : valueOptions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {valueOptions.map((opt) => {
                const isSelected = isPillSelected(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleValueSelect(opt.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm transition-all",
                      isSelected
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.color && (
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
              No options available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter Evaluation Logic ─────────────────────────────────

function evaluateFilter(
  cellValue: ColumnValue | undefined,
  operator: string,
  filterValue: ColumnValue,
  columnType: string,
  records?: Array<{ id: string; title: string }>,
  recordId?: string
): boolean {
  // Handle Client Name pseudo-column
  if (operator === "__client_name") {
    const record = records?.find((r) => r.id === recordId);
    if (!record) return false;
    const values = Array.isArray(filterValue) ? filterValue : [filterValue];
    return values.some((v) => String(v).toLowerCase() === record.title.toLowerCase());
  }

  if (operator === "is_empty") return cellValue == null || cellValue === "";
  if (operator === "not_empty") return cellValue != null && cellValue !== "";

  if (cellValue == null) return false;

  const cellStr = String(cellValue).toLowerCase();
  const filterStr = String(filterValue).toLowerCase();

  // Date-specific operators
  if (columnType === "date" || columnType === "timeline") {
    return evaluateDateFilter(cellValue, operator, filterValue);
  }

  switch (operator) {
    case "is":
    case "eq":
      return cellStr === filterStr;
    case "is_not":
    case "neq":
      return cellStr !== filterStr;
    case "contains":
      return cellStr.includes(filterStr);
    case "not_contains":
      return !cellStr.includes(filterStr);
    case "starts_with":
      return cellStr.startsWith(filterStr);
    case "ends_with":
      return cellStr.endsWith(filterStr);
    case "gt":
      return Number(cellValue) > Number(filterValue);
    case "lt":
      return Number(cellValue) < Number(filterValue);
    case "gte":
      return Number(cellValue) >= Number(filterValue);
    case "lte":
      return Number(cellValue) <= Number(filterValue);
    case "is_one_of": {
      const values = Array.isArray(filterValue) ? filterValue : [filterValue];
      return values.some((v) => String(v).toLowerCase() === cellStr);
    }
    case "is_true":
      return cellValue === true || cellValue === "true";
    case "is_false":
      return cellValue === false || cellValue === "false";
    default:
      return true;
  }
}

function evaluateDateFilter(
  cellValue: ColumnValue,
  operator: string,
  filterValue: ColumnValue
): boolean {
  try {
    const date = new Date(String(cellValue));
    const today = new Date();

    // Handle "between" date range - filterValue is [startDate, endDate]
    if (operator === "between") {
      const dates = Array.isArray(filterValue) ? filterValue : [filterValue, ""];
      const startStr = String(dates[0] || "");
      const endStr = String(dates[1] || "");
      if (!startStr && !endStr) return true;
      const startTime = startStr ? new Date(startStr).getTime() : Number.MIN_SAFE_INTEGER;
      const endTime = endStr ? new Date(endStr).getTime() : Number.MAX_SAFE_INTEGER;
      const dateTime = date.getTime();
      return dateTime >= startTime && dateTime <= endTime;
    }

    switch (operator) {
      case "is":
        return isSameDay(date, new Date(String(filterValue)));
      case "is_not":
        return !isSameDay(date, new Date(String(filterValue)));
      case "before":
        return isBefore(date, new Date(String(filterValue)));
      case "after":
        return isAfter(date, new Date(String(filterValue)));
      case "overdue":
        return isPast(date) && !isToday(date);
      case "done_on_time":
        // For completed items with due date in the past (completed before or on due date)
        return isPast(date);
      case "done_overdue":
        // For completed items that were overdue
        return isPast(date) && !isToday(date);
      case "today":
        return isToday(date);
      case "tomorrow":
        return isSameDay(date, addDays(today, 1));
      case "yesterday":
        return isSameDay(date, subDays(today, 1));
      case "this_week": {
        const weekStart = startOfWeek(today);
        const weekEnd = endOfWeek(today);
        return !isBefore(date, weekStart) && !isAfter(date, weekEnd);
      }
      case "last_week": {
        const lastWeekStart = subDays(startOfWeek(today), 7);
        const lastWeekEnd = subDays(endOfWeek(today), 7);
        return !isBefore(date, lastWeekStart) && !isAfter(date, lastWeekEnd);
      }
      case "next_week": {
        const nextWeekStart = addDays(startOfWeek(today), 7);
        const nextWeekEnd = addDays(endOfWeek(today), 7);
        return !isBefore(date, nextWeekStart) && !isAfter(date, nextWeekEnd);
      }
      case "this_month": {
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);
        return !isBefore(date, monthStart) && !isAfter(date, monthEnd);
      }
      case "next_month": {
        const nextMonthStart = startOfMonth(addMonths(today, 1));
        const nextMonthEnd = endOfMonth(addMonths(today, 1));
        return !isBefore(date, nextMonthStart) && !isAfter(date, nextMonthEnd);
      }
      case "last_month": {
        const lastMonthStart = startOfMonth(subMonths(today, 1));
        const lastMonthEnd = endOfMonth(subMonths(today, 1));
        return !isBefore(date, lastMonthStart) && !isAfter(date, lastMonthEnd);
      }
      case "past_dates":
        return isPast(date);
      case "future_dates":
        return isFuture(date);
      case "upcoming":
        return isFuture(date) || isToday(date);
      case "blank":
        return cellValue == null || cellValue === "";
      default:
        return true;
    }
  } catch {
    return false;
  }
}
