"use client";

import { useCallback } from "react";
import type { CellRendererComponentProps } from "./cell-renderer-registry";

export function CheckboxCell({
  value,
  readOnly,
  onChange,
}: CellRendererComponentProps) {
  const checked = Boolean(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.checked);
    },
    [onChange],
  );

  return (
    <div className="flex h-8 items-center px-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={readOnly}
        className="size-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 disabled:opacity-50"
      />
    </div>
  );
}
