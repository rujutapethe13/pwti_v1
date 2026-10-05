"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobLogSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function JobLogSearchBar({
  value,
  onChange,
  placeholder = "Search any client, batch or job type...",
  className,
}: JobLogSearchBarProps) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-lg border bg-card px-3",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 border-0 bg-transparent py-2.5 text-sm text-foreground placeholder-muted-foreground/60 outline-none"
      />
      <span
        className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: "hsl(var(--soft-teal-bg))",
          color: "hsl(var(--soft-teal-text))",
        }}
        aria-label="Live data"
      >
        <span
          className="size-1.5 animate-pulse rounded-full"
          style={{ backgroundColor: "hsl(var(--soft-teal-text))" }}
          aria-hidden="true"
        />
        live
      </span>
    </div>
  );
}
