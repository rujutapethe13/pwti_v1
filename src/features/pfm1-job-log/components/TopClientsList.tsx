"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { JobLogRow } from "../types";
import { computeTopClients } from "../lib/aggregation";

interface TopClientsListProps {
  rows: JobLogRow[];
  limit?: number;
  className?: string;
}

const CLIENT_ICON_COLORS: Record<string, string> = {
  teal: "hsl(var(--soft-teal-text))",
  coral: "hsl(var(--soft-coral-text))",
  amber: "hsl(var(--soft-amber-text))",
  lavender: "hsl(var(--soft-lavender-text))",
  gray: "hsl(var(--soft-gray-text))",
};

export function TopClientsList({ rows, limit = 10, className }: TopClientsListProps) {
  const clients = useMemo(() => computeTopClients(rows), [rows]);
  const displayed = limit > 0 ? clients.slice(0, limit) : clients;

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="text-sm font-medium text-foreground mb-3">Top Clients</h3>
      {displayed.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
          No data for the current filters
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((client, i) => {
            const colorName = client.color ?? "gray";
            const iconColor = CLIENT_ICON_COLORS[colorName] ?? CLIENT_ICON_COLORS.gray;
            return (
              <div key={client.name} className="flex items-center gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  <span className="text-xs font-semibold" style={{ color: iconColor }}>
                    {i + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{client.name}</span>
                </div>
                <span className="text-sm font-medium text-muted-foreground">{client.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
