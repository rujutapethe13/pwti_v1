"use client";

import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function TagsCell({ value }: CellRendererComponentProps) {
  const tags: string[] = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" && value
      ? [value]
      : [];

  return (
    <div className="flex flex-wrap gap-1 px-2 py-1.5">
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {tag}
        </span>
      ))}
      {tags.length === 0 && (
        <span className="text-sm italic text-muted-foreground">—</span>
      )}
    </div>
  );
}
