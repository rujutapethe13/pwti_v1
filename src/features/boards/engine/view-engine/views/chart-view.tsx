"use client";

/**
 * Chart View Renderer
 *
 * A generic chart renderer supporting Bar, Line, Pie, Area, and Donut chart types.
 * Uses pure SVG rendering — no chart library dependency.
 *
 * ── Scope ──────────────────────────────────────────────────
 * Single-board, single-view charts only.
 * Cross-board aggregation belongs to the future Analytics Studio
 * (Dataset → Metric → Dimension → Visualization → Saved Report),
 * which this Chart View is architected to feed into later.
 *
 * ── Data Flow ──────────────────────────────────────────────
 * Reads data through the Query Service only. No view queries Supabase directly.
 * All mutations go through onCellChange → existing CRUD services.
 */

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";

import type { ViewRendererProps } from "../view-engine-types";
import type { ChartViewSettings, ColumnDefinition, ColumnValue } from "../../types";
import { normalizeOptions } from "../../lib/import-export";

// ── Chart Data Point ───────────────────────────────────────

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// ── Color Palette (calm, semantic) ─────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1, 220 70% 50%))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 340 75% 55%))",
  "hsl(215, 70%, 60%)",
  "hsl(100, 60%, 55%)",
  "hsl(45, 85%, 60%)",
];

// ── Helpers ────────────────────────────────────────────────

/**
 * Resolve a stored cell value for an option-style column (status / priority /
 * dropdown) into a human-readable label.
 *
 * Imported rows frequently carry raw option IDs (e.g.
 * "opt-import-<timestamp>-<n>") that are internal traceability metadata and
 * must NEVER surface as the user-facing legend entry. We match by id OR by
 * label (case-insensitive), then fall back to the raw string. Empty cells
 * yield `""` so callers can decide whether to drop the slice.
 */
function resolveLabelCellValue(
  column: ColumnDefinition | undefined,
  cell: ColumnValue,
): string {
  if (cell === null || cell === undefined || cell === "") return "";
  if (column && (column.type === "status" || column.type === "priority" || column.type === "dropdown")) {
    const opts = normalizeOptions(column.settings?.options);
    if (typeof cell === "object" && !Array.isArray(cell)) {
      const obj = cell as Record<string, unknown>;
      if (typeof obj.label === "string" && obj.label) return obj.label;
      return "";
    }
    if (typeof cell !== "string") {
      return typeof cell === "number" || typeof cell === "boolean" ? String(cell) : "";
    }
    const lower = cell.toLowerCase();
    const matched =
      opts.find((o) => typeof o.id === "string" && o.id.toLowerCase() === lower) ??
      opts.find((o) => typeof o.label === "string" && o.label.toLowerCase() === lower);
    if (matched?.label) {
      const label = matched.label;
      if (/^opt[-_]import[-_]\d+/i.test(label)) return "";
      return label;
    }
    if (/^opt[-_]import[-_]\d+/i.test(cell)) return "";
    return cell;
  }
  if (typeof cell === "object" && cell !== null) {
    if (Array.isArray(cell)) {
      return cell
        .map((v) => (v && typeof v === "object" ? (v as { label?: string }).label ?? "" : String(v)))
        .filter(Boolean)
        .join(", ");
    }
    const obj = cell as Record<string, unknown>;
    if (typeof obj.label === "string") return obj.label;
    if (typeof obj.name === "string") return obj.name;
    return "";
  }
  return String(cell);
}

/**
 * Build chart data from the current board records.
 *
 * For pie/donut we GROUP by the resolved label so identical statuses
 * (e.g. "Not Started" × 12) collapse into a single slice — otherwise the
 * chart would render N identical 1-row slices. For bar/line/area we keep
 * one point per record (X-axis categories can repeat).
 */
function buildChartData(
  records: ViewRendererProps["records"],
  columns: ColumnDefinition[],
  labelColumnId: string,
  valueColumnId: string,
  cellValues: Map<string, ColumnValue>,
  groupByLabel: boolean,
): ChartDataPoint[] {
  const labelCol = columns.find((c) => c.id === labelColumnId);

  const perRecord = records.map((record) => {
    const labelCell = cellValues.get(`${record.id}:${labelColumnId}`);
    const label = resolveLabelCellValue(labelCol, labelCell ?? null);
    const rawValue = cellValues.get(`${record.id}:${valueColumnId}`);
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
    return { label, value };
  });

  if (!groupByLabel) {
    return perRecord
      .filter((d) => d.label !== "")
      .map((d, idx) => ({ ...d, color: CHART_COLORS[idx % CHART_COLORS.length] }));
  }

  const buckets = new Map<string, number>();
  const colorByLabel = new Map<string, string>();
  let colorCursor = 0;
  for (const d of perRecord) {
    if (d.label === "" || d.value <= 0) continue;
    buckets.set(d.label, (buckets.get(d.label) ?? 0) + d.value);
    if (!colorByLabel.has(d.label)) {
      colorByLabel.set(d.label, CHART_COLORS[colorCursor++ % CHART_COLORS.length]);
    }
  }
  return Array.from(buckets.entries()).map(([label, value]) => ({
    label,
    value,
    color: colorByLabel.get(label),
  }));
}

// ── SVG Chart Components ───────────────────────────────────

function BarChart({
  data,
  width,
  height,
  showLabels,
  showGrid,
  stacked,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  showLabels: boolean;
  showGrid: boolean;
  stacked: boolean;
}) {
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(8, chartW / data.length - 8);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Grid lines */}
      {showGrid &&
        [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartH * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={padding.left - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {Math.round(maxValue * ratio)}
              </text>
            </g>
          );
        })}

      {/* Bars */}
      {data.map((point, idx) => {
        const barH = (point.value / maxValue) * chartH;
        const x = padding.left + idx * (barWidth + 8) + 4;
        const y = padding.top + chartH - barH;
        return (
          <g key={idx}>
            <rect x={x} y={y} width={barWidth} height={barH} fill={point.color} rx={2} className="transition-all hover:opacity-80" />
            {showLabels && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
                {point.value}
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((point, idx) => (
        <text
          key={idx}
          x={padding.left + idx * (barWidth + 8) + barWidth / 2 + 4}
          y={height - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[8px]"
          transform={`rotate(-30, ${padding.left + idx * (barWidth + 8) + barWidth / 2 + 4}, ${height - 4})`}
        >
          {point.label}
        </text>
      ))}
    </svg>
  );
}

function LineChart({
  data,
  width,
  height,
  showLabels,
  showGrid,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  showLabels: boolean;
  showGrid: boolean;
}) {
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const xStep = chartW / Math.max(1, data.length - 1);

  const points = data.map((d, idx) => ({
    x: padding.left + idx * xStep,
    y: padding.top + chartH * (1 - d.value / maxValue),
    ...d,
  }));

  const linePath = points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? 0},${padding.top + chartH} L${points[0]?.x ?? 0},${padding.top + chartH} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showGrid &&
        [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + chartH * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={padding.left - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {Math.round(maxValue * ratio)}
              </text>
            </g>
          );
        })}

      {/* Area fill */}
      <path d={areaPath} fill={CHART_COLORS[0]} fillOpacity={0.1} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={CHART_COLORS[0]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {points.map((p, idx) => (
        <g key={idx}>
          <circle cx={p.x} cy={p.y} r={3} fill={CHART_COLORS[0]} className="hover:r-5 transition-all" />
          {showLabels && (
            <text x={p.x} y={p.y - 8} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
              {p.value}
            </text>
          )}
        </g>
      ))}

      {data.map((d, idx) => (
        <text
          key={idx}
          x={padding.left + idx * xStep}
          y={height - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[8px]"
          transform={`rotate(-30, ${padding.left + idx * xStep}, ${height - 4})`}
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}

function PieChart({
  data,
  width,
  height,
  showLabels,
  showLegend,
  donut,
}: {
  data: ChartDataPoint[];
  width: number;
  height: number;
  showLabels: boolean;
  showLegend: boolean;
  donut: boolean;
}) {
  const cx = width / 2;
  const cy = height / 2 - 20;
  const radius = Math.min(cx, cy) - 30;
  const innerRadius = donut ? radius * 0.5 : 0;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let cumulativeAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    return { ...d, startAngle, endAngle: cumulativeAngle };
  });

  return (
    <svg width={width} height={height} className="overflow-visible">
      {slices.map((slice, idx) => {
        const x1 = cx + radius * Math.cos(slice.startAngle);
        const y1 = cy + radius * Math.sin(slice.startAngle);
        const x2 = cx + radius * Math.cos(slice.endAngle);
        const y2 = cy + radius * Math.sin(slice.endAngle);
        const x3 = cx + innerRadius * Math.cos(slice.startAngle);
        const y3 = cy + innerRadius * Math.sin(slice.startAngle);
        const x4 = cx + innerRadius * Math.cos(slice.endAngle);
        const y4 = cy + innerRadius * Math.sin(slice.endAngle);

        const largeArc = slice.value / total > 0.5 ? 1 : 0;

        let path: string;
        if (donut) {
          path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x3} ${y3} Z`;
        } else {
          path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        }

        const midAngle = (slice.startAngle + slice.endAngle) / 2;
        const labelR = radius * (donut ? 0.75 : 0.65);
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);

        const percent = ((slice.value / total) * 100).toFixed(1);

        return (
          <g key={idx}>
            <path d={path} fill={slice.color} className="hover:opacity-80 transition-opacity cursor-pointer" />
            {showLabels && (
              <text x={lx} y={ly} textAnchor="middle" className="fill-background text-[9px] font-medium">
                {Number(percent) > 5 ? `${percent}%` : ""}
              </text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      {showLegend && (
        <g>
          {data.map((d, idx) => (
            <g key={idx} transform={`translate(16, ${height - data.length * 16 + idx * 16})`}>
              <rect width={10} height={10} fill={d.color} rx={2} />
              <text x={14} y={9} className="fill-muted-foreground text-[9px]">
                {d.label}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// ── Chart View ─────────────────────────────────────────────

export function ChartView({
  board,
  view,
  columns,
  records,
  cellValues,
  groups,
  settings,
  onCellChange,
  onSettingsChange,
  isActive,
}: ViewRendererProps) {
  const chartSettings = settings as ChartViewSettings;
  const { chartType, labelColumnId, valueColumnId, showLegend, showLabels, showGrid, stacked } = chartSettings;

  const chartData = useMemo(
    () => buildChartData(records, columns, labelColumnId, valueColumnId, cellValues, chartType === "pie" || chartType === "donut"),
    [records, columns, labelColumnId, valueColumnId, cellValues, chartType],
  );

  // ── Responsive container sizing ──────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 350 });
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };

    const handleMove = (moveEvent: PointerEvent) => {
      if (!resizeStartRef.current) return;
      const deltaW = moveEvent.clientX - resizeStartRef.current.x;
      const deltaH = moveEvent.clientY - resizeStartRef.current.y;
      const newW = Math.max(300, resizeStartRef.current.w + deltaW);
      const newH = Math.max(200, resizeStartRef.current.h + deltaH);
      setSize({ width: newW, height: newH });
    };

    const handleUp = () => {
      resizeStartRef.current = null;
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }, [size]);

  // Empty / config states
  if (!labelColumnId || !valueColumnId) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
        <EmptyState
          title="Configure chart columns"
          description="Select a Label column and a Value column in view settings."
          compact
        />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
        <EmptyState
          title="No chart data"
          description="Records need numeric values to display on the chart."
          compact
        />
      </div>
    );
  }

  const chartWidth = size.width;
  const chartHeight = size.height;

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-border bg-card shadow-sm"
      style={{ width: size.width !== 600 ? `${size.width}px` : "100%", minHeight: 400, height: size.height !== 350 ? `${size.height}px` : "auto" }}
    >
      {/* Chart header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground capitalize">{chartType} chart</span>
          <span className="text-xs text-muted-foreground">{chartData.length} data points</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {(["bar", "line", "pie", "area", "donut"] as const).map((type) => (
            <button
              key={type}
              onClick={() => onSettingsChange?.({ chartType: type })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                chartType === type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex items-center justify-center p-6" style={{ minHeight: 350 }}>
        {chartType === "pie" && (
          <PieChart data={chartData} width={chartWidth} height={chartHeight} showLabels={showLabels} showLegend={showLegend} donut={false} />
        )}
        {chartType === "donut" && (
          <PieChart data={chartData} width={chartWidth} height={chartHeight} showLabels={showLabels} showLegend={showLegend} donut={true} />
        )}
        {(chartType === "bar" || chartType === "area") && (
          <BarChart data={chartData} width={chartWidth} height={chartHeight} showLabels={showLabels} showGrid={showGrid} stacked={stacked} />
        )}
        {chartType === "line" && (
          <LineChart data={chartData} width={chartWidth} height={chartHeight} showLabels={showLabels} showGrid={showGrid} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{chartData.reduce((s, d) => s + d.value, 0)} total value</span>
        <span>{board.name}</span>
      </div>

      {/* Resize handle */}
      <button
        type="button"
        onPointerDown={handleResizeStart}
        className="absolute bottom-1 right-1 size-3 cursor-nwse-resize rounded-bl-none rounded-br-md rounded-tr-none border border-border bg-muted text-muted-foreground opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
        aria-label="Resize widget"
      />
    </div>
  );
}

