"use client";

import { useMemo } from "react";
import { Sparkles, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { columnTypeRegistry } from "@/features/boards/engine/column-registry";
import type { ColumnTypeKey, ColumnValue } from "@/features/boards/engine/types";
import { CREATABLE_IMPORT_TYPES } from "@/features/boards/engine/lib/import-export";
import {
  detectColumnType,
  formatCellByColumnType,
  confidenceLabel,
  type ColumnTypeDetectionResult,
} from "@/features/boards/engine/lib/column-type-detection";

export interface ColumnTypeSelectorProps {
  values: ColumnValue[];
  selectedType: ColumnTypeKey;
  onChange: (type: ColumnTypeKey) => void;
  className?: string;
}

export function ColumnTypeSelector({
  values,
  selectedType,
  onChange,
  className,
}: ColumnTypeSelectorProps) {
  const detection: ColumnTypeDetectionResult = useMemo(
    () => detectColumnType(values),
    [values],
  );

  const selectedDef = columnTypeRegistry[selectedType];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Select value={selectedType} onValueChange={(v) => onChange(v as ColumnTypeKey)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Select type">
            <span className="flex items-center gap-1">
              <span className="flex size-4 items-center justify-center rounded bg-muted font-bold text-xs">
                {selectedDef?.label?.charAt(0) ?? "?"}
              </span>
              {selectedDef?.label ?? selectedType}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {CREATABLE_IMPORT_TYPES.map((key) => {
            const def = columnTypeRegistry[key];
            return (
              <SelectItem key={key} value={key} className="text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded bg-muted font-bold text-xs">
                    {def.label.charAt(0)}
                  </span>
                  <span>{def.label}</span>
                  {selectedType === key && (
                    <Check className="ml-auto size-3" />
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {detection.type !== selectedType && (
        <button
          type="button"
          onClick={() => onChange(detection.type)}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          title={`Auto-detected: ${columnTypeRegistry[detection.type]?.label ?? detection.type} (${confidenceLabel(detection.confidence)})`}
        >
          <Sparkles className="size-3" />
        </button>
      )}
    </div>
  );
}

export { formatCellByColumnType, detectColumnType };
