"use client";

/**
 * KPI Widget — Reference Widget Plugin Implementation
 *
 * Displays a single aggregated metric with optional comparison,
 * sparkline, and trend indicator.
 *
 * Registration pattern: self-registers via registerWidget().
 * No switch statements, no board-specific logic.
 */

import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerWidget } from "../widget-registry/widget-registry";
import type {
  WidgetPlugin,
  WidgetRenderProps,
  KpiConfig,
  AggregationResult,
  AggregationConfig,
  DashboardFilter,
} from "@/lib/analytics/contracts";

// ── Default Config ─────────────────────────────────────────

const DEFAULT_CONFIG: KpiConfig = {
  aggregation: {
    type: "count",
    field: "",
    label: "Total Records",
    format: "number",
    decimalPlaces: 0,
  },
  showTrendline: false,
  showSparkline: false,
  showComparison: false,
  color: "#3b82f6",
};

// ── Aggregation Engine (inline, no external deps) ──────────

function computeAggregation(
  values: (number | null)[],
  config: AggregationConfig,
): AggregationResult {
  const numericValues = values.filter((v): v is number => v !== null && typeof v === "number");

  let value: number | null = null;
  const label = config.label ?? config.field;

  switch (config.type) {
    case "count":
      value = numericValues.length;
      break;
    case "sum":
      value = numericValues.reduce((sum, v) => sum + v, 0);
      break;
    case "average":
      value = numericValues.length > 0
        ? numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length
        : null;
      break;
    case "max":
      value = numericValues.length > 0 ? Math.max(...numericValues) : null;
      break;
    case "min":
      value = numericValues.length > 0 ? Math.min(...numericValues) : null;
      break;
    case "median": {
      if (numericValues.length === 0) { value = null; break; }
      const sorted = [...numericValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      value = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      break;
    }
    case "count_empty":
      value = values.filter((v) => v === null || v === undefined).length;
      break;
    case "count_filled":
      value = values.filter((v) => v !== null && v !== undefined).length;
      break;
    case "distinct_count": {
      const distinct = new Set(numericValues);
      value = distinct.size;
      break;
    }
    default:
      value = numericValues.length;
  }

  return {
    type: config.type,
    value,
    label,
    formattedValue: formatValue(value, config),
  };
}

function formatValue(value: number | null, config: AggregationConfig): string {
  if (value === null) return "—";

  const dp = config.decimalPlaces ?? 0;
  const prefix = config.prefix ?? "";
  const suffix = config.suffix ?? "";

  switch (config.format) {
    case "currency":
      return `${prefix}$${value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
    case "percentage":
      return `${prefix}${(value * 100).toFixed(dp)}%${suffix}`;
    case "duration":
      return `${prefix}${formatDuration(value)}${suffix}`;
    case "number":
    default:
      return `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function computeChange(current: number, previous: number): { change: number; changePercent: number } {
  const change = current - previous;
  const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
  return { change, changePercent };
}

function getTrend(changePercent: number): "up" | "down" | "flat" {
  if (Math.abs(changePercent) < 0.5) return "flat";
  return changePercent > 0 ? "up" : "down";
}

// ── Extract numeric values from records ────────────────────

function extractValues(
  records: Array<{ id: string }>,
  cellValues: Map<string, unknown>,
  field: string,
): (number | null)[] {
  return records.map((record) => {
    const key = `${record.id}:${field}`;
    const value = cellValues.get(key);
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  });
}

// ── KPI Widget React Component ─────────────────────────────

function KpiWidgetRenderer({ config, boardData, filters }: WidgetRenderProps<KpiConfig>) {
  const { aggregation } = config;

  const currentResult = useMemo(() => {
    if (!boardData || !aggregation.field) {
      return {
        type: aggregation.type,
        value: null,
        label: aggregation.label ?? "—",
        formattedValue: "—",
      } as AggregationResult;
    }

    const values = extractValues(boardData.records, boardData.cellValues, aggregation.field);
    return computeAggregation(values, aggregation);
  }, [boardData, aggregation, filters]);

  const comparisonResult = useMemo(() => {
    if (!config.showComparison || !config.aggregation || !boardData) return undefined;

    const values = extractValues(boardData.records, boardData.cellValues, config.aggregation.field);
    return computeAggregation(values, config.aggregation);
  }, [boardData, config.showComparison, config.aggregation, filters]);

  const trend = useMemo(() => {
    if (!comparisonResult || currentResult.value === null || comparisonResult.value === null) {
      return undefined;
    }
    const { changePercent } = computeChange(currentResult.value, comparisonResult.value);
    return getTrend(changePercent);
  }, [currentResult, comparisonResult]);

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {currentResult.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold" style={{ color: config.color }}>
          {currentResult.formattedValue}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span>{trend === "up" ? "Up" : trend === "down" ? "Down" : "Flat"}</span>
          </div>
        )}
        {comparisonResult && (
          <p className="text-xs text-muted-foreground mt-1">
            vs {comparisonResult.formattedValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Plugin Registration ────────────────────────────────────

export const KpiWidget: WidgetPlugin<KpiConfig> = {
  type: "kpi",
  displayName: "KPI",
  icon: TrendingUp,
  defaultConfig: DEFAULT_CONFIG,
  configSchema: {},
  render: KpiWidgetRenderer,
  minSize: { w: 2, h: 2 },
};

// Self-register
registerWidget(KpiWidget);
