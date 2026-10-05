"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";

import { columnTypeRegistry } from "../column-registry";
import type { ColumnTypeKey } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const ENABLED_TYPES: ColumnTypeKey[] = [
  "text",
  "number",
  "date",
  "dropdown",
  "status",
  "person",
  "connected_board",
  "mirror",
];

interface ColumnTypePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: ColumnTypeKey) => void;
}

export function ColumnTypePicker({
  open,
  onOpenChange,
  onSelect,
}: ColumnTypePickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return ENABLED_TYPES.filter((key) => {
      const def = columnTypeRegistry[key];
      if (!q) return true;
      return (
        def.label.toLowerCase().includes(q) ||
        def.key.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q)
      );
    });
  }, [query]);

  const handleSelect = (type: ColumnTypeKey) => {
    onSelect(type);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add column</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search column types..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {filtered.map((key) => {
            const def = columnTypeRegistry[key];
            return (
              <Button
                key={key}
                variant="outline"
                className="justify-start gap-2 h-auto py-2 px-3"
                onClick={() => handleSelect(key)}
              >
                <span className="flex size-6 items-center justify-center rounded bg-muted text-xs font-bold">
                  {def.label.charAt(0)}
                </span>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">{def.label}</span>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {def.description}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No matching column types.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
