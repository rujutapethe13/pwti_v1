"use client";

import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  value: { from: string | null; to: string | null };
  onChange: (range: { from: string | null; to: string | null }) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const hasValue = value.from || value.to;
  const displayValue = hasValue
    ? `${value.from ?? "..."} → ${value.to ?? "..."}`
    : "";

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ from: null, to: null });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !hasValue && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {displayValue || "Date range"}
          </span>
          {hasValue && (
            <div onClick={clear} className="ml-auto rounded-sm opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">From</div>
          <Input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || null })}
          />
          <div className="text-xs font-medium text-muted-foreground">To</div>
          <Input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value || null })}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onChange({ from: null, to: null })}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
