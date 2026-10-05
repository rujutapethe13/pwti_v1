"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";
import { Star } from "lucide-react";

export function RatingCell({
  value,
  readOnly,
  onChange,
}: CellRendererComponentProps) {
  const rating = typeof value === "number" ? Math.min(Math.max(Math.round(value), 0), 5) : 0;

  const handleClick = useCallback(
    (star: number) => {
      if (!readOnly) {
        onChange?.(star);
      }
    },
    [readOnly, onChange],
  );

  return (
    <div className="flex items-center gap-0.5 px-2 py-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => handleClick(star)}
          className={`size-4 transition-colors ${
            star <= rating
              ? "text-yellow-500"
              : "text-muted-foreground/30"
          } ${readOnly ? "cursor-default" : "cursor-pointer hover:text-yellow-400"}`}
        >
          <Star
            className="size-full"
            fill={star <= rating ? "currentColor" : "none"}
          />
        </button>
      ))}
      {rating === 0 && !readOnly && (
        <span className="ml-1 text-xs italic text-muted-foreground">Rate</span>
      )}
    </div>
  );
}
