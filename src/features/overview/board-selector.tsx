"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface OverviewBoard {
  id: string;
  name: string;
}

interface BoardSelectorProps {
  boards: OverviewBoard[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

export function BoardSelector({
  boards,
  selectedIds,
  onChange,
  label = "Boards",
}: BoardSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const allSelected = boards.length > 0 && selectedIds.length === boards.length;
  const summary =
    boards.length === 0
      ? "No boards"
      : allSelected
        ? "All boards"
        : `${selectedIds.length} selected`;

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}: {summary}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </Button>
      {open && (
        <div className="bg-card border-border absolute right-0 z-20 mt-1 min-w-56 rounded-md border p-2 shadow-lg">
          <div className="mb-1 flex justify-between gap-2 border-b pb-2">
            <button
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={() => onChange(boards.map((board) => board.id))}
            >
              Select all
            </button>
            <button
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
          <div role="listbox" aria-label={label} className="max-h-56 overflow-auto">
            {boards.map((board) => {
              const checked = selected.has(board.id);
              return (
                <button
                  key={board.id}
                  role="option"
                  aria-selected={checked}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                  onClick={() =>
                    onChange(
                      checked
                        ? selectedIds.filter((id) => id !== board.id)
                        : [...selectedIds, board.id],
                    )
                  }
                >
                  <span className="border-border flex size-3.5 items-center justify-center rounded border">
                    {checked && <Check className="size-3" aria-hidden="true" />}
                  </span>
                  <span className="truncate">{board.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
