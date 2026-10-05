"use client";

import { cn } from "@/lib/utils";
import { accentForColor } from "../lib/colors";
import type { StatCardSpec } from "../types";

interface StatCardProps {
  spec: StatCardSpec;
  className?: string;
}

export function StatCard({ spec, className }: StatCardProps) {
  const { label, value, colorVar, icon: Icon } = spec;
  const accent = accentForColor(colorVar);

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="size-3.5 shrink-0" style={{ color: accent.text }} aria-hidden="true" />}
      </div>
      <div className="text-3xl font-semibold tracking-tight" style={{ color: accent.text }}>
        {value}
      </div>
    </div>
  );
}
