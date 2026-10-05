"use client";

import { formatDistanceToNow } from "date-fns";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobLogHeaderProps {
  title: string;
  subtitle: string;
  initials: string;
  lastUpdated: Date | null;
  className?: string;
}

export function JobLogHeader({ title, subtitle, initials, lastUpdated, className }: JobLogHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 rounded-lg border bg-card p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand text-xl font-bold text-brand-foreground shadow-sm">
          {initials}
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-muted">
            <Home className="size-2.5 text-muted-foreground" aria-hidden="true" />
          </span>
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Last updated
        </span>
        <time dateTime={lastUpdated ? lastUpdated.toISOString() : undefined} className="text-sm text-muted-foreground">
          {lastUpdated ? formatTimeAgo(lastUpdated) : "Never"}
        </time>
      </div>
    </header>
  );
}

function formatTimeAgo(date: Date): string {
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return date.toLocaleTimeString();
  }
}
