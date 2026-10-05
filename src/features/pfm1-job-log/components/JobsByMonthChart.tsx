"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { JobLogRow } from "../types";
import { computeJobsByMonth } from "../lib/aggregation";

interface JobsByMonthChartProps {
  rows: JobLogRow[];
  className?: string;
}

export function JobsByMonthChart({ rows, className }: JobsByMonthChartProps) {
  const data = useMemo(() => computeJobsByMonth(rows), [rows]);

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="text-sm font-medium text-foreground mb-3">Jobs by Month</h3>
      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 8, left: -4, bottom: 5 }}>
            <CartesianGrid
              strokeDasharray="2 2"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                fontSize: 12,
                color: "hsl(var(--popover-foreground))",
                opacity: 1,
              }}
              cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
            />
            <Bar
              dataKey="value"
              fill="hsl(var(--soft-teal-text))"
              radius={[3, 3, 0, 0]}
              barSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
      No data for the current filters
    </div>
  );
}
