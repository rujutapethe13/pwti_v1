"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { cn } from "@/lib/utils";

interface DailyBreakdownItem {
  date: string;
  total: number;
}

interface Client360SnapshotTrendChartProps {
  data: DailyBreakdownItem[];
  height?: number;
  className?: string;
}

export function Client360SnapshotTrendChart({
  data,
  height = 160,
  className,
}: Client360SnapshotTrendChartProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  if (!isMounted) {
    return (
      <div
        className={cn("rounded-md border border-border bg-card", className)}
        style={{ height }}
      />
    );
  }

  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  const chartData = data.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={28}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#94a3b8" }}
            allowDecimals={false}
            domain={[0, Math.ceil(maxTotal * 1.15)]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(value) => [String(value ?? 0), "Jobs"]}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={i === chartData.length - 1 ? "#3b82f6" : "#64748b"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
