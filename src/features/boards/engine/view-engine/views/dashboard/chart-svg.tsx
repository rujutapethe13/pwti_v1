"use client";

/**
 * Dashboard — SVG Chart Renderer
 *
 * Pure-SVG renderers (no charting dependency) for every chart type offered by
 * the dashboard widget picker (§6.1). Receives a normalized series shape so
 * the same components serve both the Chart widget and Data-over-time widget.
 */

import { memo, useMemo, useState } from "react";
import type { ChartTypeKey, BenchmarkLine, PieValueMode } from "./dashboard-types";

export interface SeriesPoint {
  label: string;
  value: number;
  color?: string;
}

export interface SeriesData {
  name: string;
  color: string;
  points: SeriesPoint[];
}

export interface ChartRenderProps {
  type: ChartTypeKey;
  series: SeriesData[];
  xLabels: string[];
  showLegend: boolean;
  showLabels: boolean;
  showGrid: boolean;
  stacked: boolean;
  benchmarkLines: BenchmarkLine[];
  width: number;
  height: number;
  /** Pie/Donut: how slice values are formatted (raw count vs percent). */
  showValueAs?: PieValueMode;
  /** Pie/Donut: accumulate values across sort order (Pareto-style). */
  showCumulative?: boolean;
  /**
   * Click-to-filter. When supplied, clicking a bar, slice, or column emits its
   * label. Omitted by every caller that does not want click filtering, so
   * existing behaviour is unchanged.
   */
  onLabelClick?: (label: string) => void;
}

export const CHART_PALETTE = [
  "#ef4444", "#dc2626", "#b91c1c", "#f43f5e", "#e11d48",
  "#f97316", "#ea580c", "#c2410c", "#ff6b6b", "#ffa07a",
  "#f59e0b", "#d97706", "#b45309", "#eab308", "#ca8a04",
  "#84cc16", "#65a30d", "#4d7c0f", "#22c55e", "#16a34a",
  "#10b981", "#059669", "#0f766e", "#14b8a6", "#0d9488",
  "#06b6d4", "#0891b2", "#0e7490", "#00fa9a", "#98fb98",
  "#0ea5e9", "#0284c7", "#0369a1", "#3b82f6", "#2563eb",
  "#6366f1", "#4f46e5", "#4338ca", "#8b5cf6", "#7c3aed",
  "#a855f7", "#9333ea", "#7e22ce", "#d946ef", "#c026d3",
  "#ec4899", "#db2777", "#be185d", "#f472b6",
];

export function hashColor(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function seriesColor(index: number, override?: string): string {
  return override ?? CHART_PALETTE[index % CHART_PALETTE.length];
}

// Per-bar (per xLabel) totals across all series. For stacked bars the axis
// must be sized to the largest total — sizing to the largest individual
// segment causes the bar to overflow its plotted axis range.
function perBarTotals(series: SeriesData[], xLabels: string[]): number[] {
  return xLabels.map((xl) => {
    let total = 0;
    for (const s of series) {
      const p = s.points.find((pt) => pt.label === xl);
      if (p) total += p.value;
    }
    return total;
  });
}

function axisMaxFor(series: SeriesData[], xLabels: string[], stacked: boolean): number {
  if (stacked) {
    const totals = perBarTotals(series, xLabels);
    const m = Math.max(0, ...totals);
    return m === 0 ? 1 : m;
  }
  const m = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value)));
  return m === 0 ? 1 : m;
}

function generateTicks(maxValue: number, count = 5): number[] {
  if (maxValue <= 0) return [0];
  const max = Math.floor(maxValue);
  if (max <= 0) return [0, Math.max(1, Math.round(maxValue))];
  const step = Math.max(1, Math.ceil(max / count));
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

// ═══════════════════════════════════════════════════════════
// PIE / DONUT
// ══════════════════════════════════════════════════════════

interface TooltipState {
  x: number;
  y: number;
  lines: Array<{ text: string; color?: string; bold?: boolean }>;
}

function PieChart({ type, series, showLegend, showLabels, width, height, showValueAs = "percent", showCumulative = false, onLabelClick }: ChartRenderProps) {
  const [hover, setHover] = useState<TooltipState | null>(null);

  // Flatten series points by label. Each distinct label becomes one slice.
  // Color priority: per-point color → palette by insertion order.
  const byLabel = new Map<string, { value: number; color: string }>();
  let nextColorIdx = 0;
  series.forEach((s) => {
    s.points.forEach((p) => {
      const existing = byLabel.get(p.label);
      if (existing) {
        byLabel.set(p.label, { value: existing.value + p.value, color: existing.color });
      } else {
        const color = p.color ?? seriesColor(nextColorIdx++);
        byLabel.set(p.label, { value: p.value, color });
      }
    });
  });

  const data = Array.from(byLabel.entries()).map(([label, d]) => ({ label, ...d }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  // Side-by-side only when the card is wide enough for both to stay legible;
  // otherwise the legend wraps under the chart.
  const legendCols = width >= 420 ? 2 : 1;
  const sideBySide = showLegend && width >= 320;
  const legendW = sideBySide ? Math.min(220, Math.max(120, width * 0.45)) : 0;
  const pieW = sideBySide ? width - legendW : width;
  const legendRows = Math.ceil(data.length / Math.max(1, legendCols));
  const pieH = sideBySide
    ? height
    : Math.max(60, Math.min(height * 0.6, height - 16 * legendRows));
  const cx = pieW / 2;
  const cy = pieH / 2;
  const radius = Math.max(8, Math.min(cx, cy) - 16);
  const innerRadius = type === "donut" ? radius * 0.5 : 0;

  // Cumulative: convert each value into its running share of the total,
  // so slice angles accumulate in the order the user sees them.
  let cumulative = -Math.PI / 2;
  const slices = data.map((d) => {
    const sliceValue = showCumulative
      ? Math.max(0, total - d.value + d.value) // placeholder; we recompute below
      : d.value;
    const angle = ((showCumulative ? d.value : sliceValue) / total) * 2 * Math.PI;
    const start = cumulative;
    cumulative += angle;
    return { ...d, start, end: cumulative };
  });

  // Recompute cumulative angles so each slice's arc represents its share
  // of the running total in order (Pareto).
  if (showCumulative) {
    let running = -Math.PI / 2;
    let accumulated = 0;
    slices.forEach((s) => {
      accumulated += s.value;
      const a1 = running;
      const a2 = -Math.PI / 2 + (accumulated / total) * 2 * Math.PI;
      s.start = a1;
      s.end = a2;
      running = a2;
    });
  }

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 overflow-hidden"
      style={{ width, height, maxWidth: width, maxHeight: height }}
    >
      <div
        className="relative shrink-0"
        style={{ width: pieW, height: pieH, maxWidth: pieW, maxHeight: pieH }}
      >
      <svg
        width={pieW}
        height={pieH}
        style={{ width: pieW, height: pieH, maxWidth: pieW }}
      >
        <g>
          {slices.map((s, i) => {
            const x1 = cx + radius * Math.cos(s.start);
            const y1 = cy + radius * Math.sin(s.start);
            const x2 = cx + radius * Math.cos(s.end);
            const y2 = cy + radius * Math.sin(s.end);
            const x3 = cx + innerRadius * Math.cos(s.start);
            const y3 = cy + innerRadius * Math.sin(s.start);
            const x4 = cx + innerRadius * Math.cos(s.end);
            const y4 = cy + innerRadius * Math.sin(s.end);
            const largeArc = s.value / total > 0.5 ? 1 : 0;
            const path =
              type === "donut"
                ? `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x4} ${y4} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x3} ${y3} Z`
                : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            const midAngle = (s.start + s.end) / 2;
            const labelR = radius * (type === "donut" ? 0.75 : 0.65);
            const lx = cx + labelR * Math.cos(midAngle);
            const ly = cy + labelR * Math.sin(midAngle);

            const percent = ((s.value / total) * 100);
            const pctNum = percent;
            const onSliceText = showValueAs === "value" ? String(s.value) : `${pctNum.toFixed(pctNum >= 10 ? 0 : 1)}%`;
            return (
              <g
                key={i}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement?.getBoundingClientRect?.()) ?? null;
                  const px = rect ? e.clientX - rect.left : e.nativeEvent.offsetX;
                  const py = rect ? e.clientY - rect.top : e.nativeEvent.offsetY;
                  setHover({
                    x: px,
                    y: py,
                    lines: [
                      { text: s.label, color: s.color, bold: true },
                      { text: `Count: ${s.value} (${pctNum.toFixed(pctNum >= 10 ? 0 : 1)}%)` },
                    ],
                  });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={onLabelClick ? () => onLabelClick(s.label) : undefined}
                style={{ cursor: onLabelClick ? "pointer" : "default" }}
              >
                <path d={path} fill={s.color} />
                {showLabels && pctNum > 8 && (
                  <text x={lx} y={ly} textAnchor="middle" className="fill-background text-[9px] font-medium pointer-events-none">
                    {onSliceText}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-white px-2 py-1.5 text-[11px] shadow-md"
          style={{ left: Math.min(hover.x + 10, Math.max(0, pieW - 160)), top: Math.min(hover.y + 10, Math.max(0, pieH - 50)) }}
        >
          {hover.lines.map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold flex items-center gap-1.5" : "text-muted-foreground"}>
              {l.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />}
              {l.text}
            </div>
          ))}
        </div>
      )}
      </div>
      {showLegend && (
        <div
          className="grid min-w-0 gap-x-3 gap-y-1 overflow-hidden text-[10px]"
          style={{
            width: sideBySide ? legendW : width,
            maxWidth: sideBySide ? legendW : width,
            maxHeight: height,
            alignSelf: sideBySide ? "center" : "flex-start",
            gridTemplateColumns: `repeat(${sideBySide ? legendCols : Math.max(1, Math.floor(width / 140))}, minmax(0, 1fr))`,
          }}
        >
          {data.map((d) => {
            const pct = (d.value / total) * 100;
            const legendValue =
              showValueAs === "value" ? String(d.value) : `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
            return (
              <div key={d.label} className="flex min-w-0 items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
                <span className="min-w-0 truncate text-muted-foreground" title={d.label}>
                  {d.label}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-foreground/70">{legendValue}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BAR / STACKED BAR (horizontal)
// ══════════════════════════════════════════════════════════

function BarChart({ series, showLabels, showGrid, stacked, benchmarkLines, width, height, onLabelClick }: ChartRenderProps) {
  const [hover, setHover] = useState<TooltipState | null>(null);
  const [showAllLegend, setShowAllLegend] = useState(false);

  const padding = { top: 16, right: 80, bottom: 30, left: 80 };
  const chartW = Math.max(0, width - padding.left - padding.right);
  const chartH = Math.max(0, height - padding.top - padding.bottom);

  // xLabels and totals are derived ONCE here so the axis, the bar widths,
  // the on-bar labels, and the tooltip are guaranteed to use the same numbers.
  const baseLabels = series[0]?.points.map((p) => p.label) ?? [];
  const totalsByBase = perBarTotals(series, baseLabels);
  // Sort bars by total descending; render with smallest total at the TOP,
  // largest at the BOTTOM (per the reference layout).
  const orderDesc = baseLabels
    .map((l, i) => ({ l, t: totalsByBase[i] }))
    .sort((a, b) => a.t - b.t)
    .map((r) => r.l);
  const labels = stacked ? orderDesc : baseLabels;
  const totals = labels.map((l) => {
    let t = 0;
    for (const s of series) {
      const p = s.points.find((pt) => pt.label === l);
      if (p) t += p.value;
    }
    return t;
  });

  const maxValue = axisMaxFor(series, labels, stacked);
  const rowH = Math.max(22, chartH / Math.max(1, labels.length) - 6);

  // Legend layout: dynamic height + scrollable fallback + condense toggle
  const LEGEND_ROW_HEIGHT = 16;
  const LEGEND_PADDING_Y = 8;
  const LEGEND_MAX_ROWS = 8;
  const LEGEND_MAX_HEIGHT = LEGEND_PADDING_Y * 2 + LEGEND_MAX_ROWS * LEGEND_ROW_HEIGHT + (LEGEND_MAX_ROWS - 1) * 4 + 24;
  const LEGEND_CONDENSE_THRESHOLD = 12;
  const LEGEND_INITIAL_COUNT = 8;

  const legendItems = stacked
    ? [...new Set(series.map((s) => s.name))]
        .map((name) => ({ name, color: series.find((s) => s.name === name)!.color }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const legendColWidth = Math.max(110, Math.floor(width / Math.max(1, legendItems.length)));
  const legendCols = Math.max(1, Math.floor((width - 16) / legendColWidth));
  const totalItems = legendItems.length;
  const isCondensed = totalItems > LEGEND_CONDENSE_THRESHOLD && !showAllLegend;
  const visibleItems = isCondensed ? legendItems.slice(0, LEGEND_INITIAL_COUNT) : legendItems;
  const visibleRows = Math.ceil(visibleItems.length / Math.max(1, legendCols));
  const toggleH = totalItems > LEGEND_CONDENSE_THRESHOLD ? 22 : 0;
  const legendContentH = LEGEND_PADDING_Y * 2 + visibleRows * LEGEND_ROW_HEIGHT + Math.max(0, visibleRows - 1) * 4;
  const rawLegendH = stacked ? legendContentH + toggleH : 0;
  const legendH = Math.min(rawLegendH, LEGEND_MAX_HEIGHT);
  const legendScrollable = stacked && rawLegendH > LEGEND_MAX_HEIGHT;

  // Bottom padding increases when a legend is drawn so the bars don't sit
  // underneath the legend overlay.
  const bottomPad = padding.bottom + legendH;
  const plotChartH = Math.max(0, chartH - legendH);

  const line = (y: number, label: string) => (
    <g key={label}>
      <line x1={padding.left} y1={y + rowH / 2} x2={width - padding.right} y2={y + rowH / 2} stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={padding.left - 6} y={y + rowH / 2 + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
        {label}
      </text>
    </g>
  );

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        {showGrid &&
          generateTicks(maxValue, 5).map((tick) => {
            const x = padding.left + (chartW * (tick / maxValue));
            return (
              <g key={tick}>
                <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotChartH} stroke="hsl(var(--border))" strokeWidth={1} />
                <text x={x - 4} y={padding.top - 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                  {tick}
                </text>
              </g>
            );
          })}

        {benchmarkLines.map((b) => {
          const xRatio = Math.min(1, Math.max(0, b.value / maxValue));
          const x = padding.left + chartW * xRatio;
          return (
            <g key={`b-${b.id}`}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotChartH} stroke={b.color} strokeWidth={1} strokeDasharray="4 3" />
              {b.label && (
                <text x={x + 4} y={padding.top + 10} className="fill-foreground text-[8px]" style={{ color: b.color }}>{b.label}</text>
              )}
            </g>
          );
        })}

        {labels.map((label, i) => {
          const y = padding.top + i * (rowH + 6);
          const bucket = series.map((s) => s.points.find((p) => p.label === label)?.value ?? 0);
          const total = totals[i] || 0;
          let offsetX = 0;
          const barXStart = padding.left;
          const barXEnd = padding.left + (total / maxValue) * chartW;
          return (
            <g
              key={label}
              onClick={onLabelClick ? () => onLabelClick(label) : undefined}
              style={{ cursor: onLabelClick ? "pointer" : "default" }}
            >
              {line(y, label)}
              {bucket.map((val, si) => {
                const barW = (val / maxValue) * chartW;
                const x = stacked ? barXStart + offsetX : barXStart;
                if (stacked) offsetX += barW;
                const segPctOfBar = total > 0 ? (val / total) * 100 : 0;
                return (
                  <g
                    key={si}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                      const px = rect ? e.clientX - rect.left : e.nativeEvent.offsetX;
                      const py = rect ? e.clientY - rect.top : e.nativeEvent.offsetY;
                      setHover({
                        x: px,
                        y: py,
                        lines: [
                          { text: label, bold: true },
                          {
                            text: `${series[si].name}: ${val} (${segPctOfBar.toFixed(segPctOfBar >= 10 ? 0 : 1)}%)`,
                            color: series[si].color,
                          },
                        ],
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={rowH - 2}
                      fill={series[si].color}
                      rx={2}
                    />
                    {showLabels && stacked && barW >= 28 && val > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y + rowH / 2 + 3}
                        textAnchor="middle"
                        className="fill-background text-[9px] font-medium pointer-events-none"
                      >
                        {Math.round(val)}
                      </text>
                    )}
                  </g>
                );
              })}
              {showLabels && (
                <text
                  x={barXEnd + 6}
                  y={y + rowH / 2 + 4}
                  className="fill-foreground text-[10px] font-bold pointer-events-none"
                >
                  {Math.round(total)}
                </text>
              )}
              {/* invisible hit area to ensure tooltip clears when leaving a thin segment */}
              <rect
                x={barXStart}
                y={y}
                width={Math.max(0, barXEnd - barXStart)}
                height={rowH - 2}
                fill="transparent"
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      {stacked && legendItems.length > 0 && (
        <div
          className="absolute left-0 right-0 grid gap-x-3 gap-y-1 px-2 text-[10px]"
          style={{
            bottom: 0,
            maxHeight: legendScrollable ? LEGEND_MAX_HEIGHT : undefined,
            overflowY: legendScrollable ? "auto" : "visible",
            gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(110, Math.floor(width / Math.max(1, legendItems.length)))}px, 1fr))`,
          }}
        >
          {visibleItems.map((it) => (
            <div key={it.name} className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
              <span className="truncate text-muted-foreground">{it.name}</span>
            </div>
          ))}
          {isCondensed && (
            <button
              type="button"
              onClick={() => setShowAllLegend(true)}
              className="col-span-full text-center text-[9px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Show all ({totalItems})
            </button>
          )}
          {showAllLegend && totalItems > LEGEND_CONDENSE_THRESHOLD && (
            <button
              type="button"
              onClick={() => setShowAllLegend(false)}
              className="col-span-full text-center text-[9px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Show less
            </button>
          )}
        </div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-white px-2 py-1.5 text-[11px] shadow-md"
          style={{ left: Math.min(hover.x + 10, width - 180), top: Math.min(hover.y + 10, height - 50) }}
        >
          {hover.lines.map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold flex items-center gap-1.5" : "text-muted-foreground flex items-center gap-1.5"}>
              {l.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: l.color }} />}
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COLUMN / STACKED COLUMN (vertical)
// ══════════════════════════════════════════════════════════

function ColumnChart({ series, showLabels, showGrid, stacked, benchmarkLines, width, height }: ChartRenderProps) {
  const [hover, setHover] = useState<TooltipState | null>(null);
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = Math.max(0, width - padding.left - padding.right);
  const chartH = Math.max(0, height - padding.top - padding.bottom);
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const maxValue = axisMaxFor(series, labels, stacked);
  const groupCount = series.length;
  const barW = Math.max(4, chartW / Math.max(1, labels.length) / Math.max(1, groupCount) - 4);

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        {showGrid &&
          generateTicks(maxValue, 5).map((tick) => {
            const y = padding.top + chartH * (1 - tick / maxValue);
            return (
              <g key={tick}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
                <text x={padding.left - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                  {tick}
                </text>
              </g>
            );
          })}

        {benchmarkLines.map((b) => {
          const y = padding.top + chartH * (1 - Math.min(1, Math.max(0, b.value / maxValue)));
          return (
            <g key={`b-${b.id}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={b.color} strokeWidth={1} strokeDasharray="4 3" />
              {b.label && <text x={width - padding.right + 4} y={y + 4} className="fill-foreground text-[8px]" style={{ color: b.color }}>{b.label}</text>}
            </g>
          );
        })}

        {labels.map((label, i) => {
          const groupW = chartW / Math.max(1, labels.length);
          const baseX = padding.left + i * groupW + groupW / 2 - (barW * groupCount) / 2;
          const bucket = series.map((s) => s.points[i]?.value ?? 0);
          const total = bucket.reduce((a, b) => a + b, 0);
          let offsetY = 0;
          return (
            <g key={label}>
              {bucket.map((val, si) => {
                const barH = (val / maxValue) * chartH;
                const x = baseX + si * (barW + 2);
                const y = padding.top + chartH - barH - (stacked ? offsetY : 0);
                offsetY += stacked ? barH : 0;
                const segPct = total > 0 ? (val / total) * 100 : 0;
                return (
                  <g
                    key={si}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                      const px = rect ? e.clientX - rect.left : e.nativeEvent.offsetX;
                      const py = rect ? e.clientY - rect.top : e.nativeEvent.offsetY;
                      setHover({
                        x: px,
                        y: py,
                        lines: [
                          { text: label, bold: true },
                          { text: `${series[si].name}: ${val} (${segPct.toFixed(segPct >= 10 ? 0 : 1)}%)`, color: series[si].color },
                        ],
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <rect x={x} y={y} width={barW} height={barH} fill={series[si].color} rx={2} />
                    {showLabels && stacked && barH >= 18 && val > 0 && (
                      <text x={x + barW / 2} y={y + barH / 2 + 3} textAnchor="middle" className="fill-background text-[9px] font-medium pointer-events-none">
                        {Math.round(val)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={padding.left + i * groupW + groupW / 2}
                y={height - 4}
                textAnchor="end"
                className="fill-muted-foreground text-[8px]"
                transform={`rotate(-30, ${padding.left + i * groupW + groupW / 2}, ${height - 4})`}
              >
                {label}
              </text>
              {showLabels && (
                <text x={padding.left + i * groupW + groupW / 2} y={padding.top + chartH - total / maxValue * chartH - 4} textAnchor="middle" className="fill-foreground text-[10px] font-bold pointer-events-none">
                  {Math.round(total)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-white px-2 py-1.5 text-[11px] shadow-md"
          style={{ left: Math.min(hover.x + 10, width - 180), top: Math.min(hover.y + 10, height - 50) }}
        >
          {hover.lines.map((l, i) => (
            <div key={i} className={l.bold ? "font-semibold flex items-center gap-1.5" : "text-muted-foreground flex items-center gap-1.5"}>
              {l.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: l.color }} />}
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LINE (single / multi / smoothed / dashed)
// ══════════════════════════════════════════════════════════

function LineChart({ type, series, showLabels, showGrid, width, height }: ChartRenderProps) {
  const padding = { top: 20, right: 24, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const maxValue = axisMaxFor(series, labels, type === "stacked_area");
  const n = Math.max(1, labels.length);
  const xStep = chartW / (n - 1 || 1);
  const smooth = type === "line_smoothed" || type === "line_multi";
  const dashed = type === "line_dashed";

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showGrid &&
        generateTicks(maxValue, 5).map((tick) => {
          const y = padding.top + chartH * (1 - tick / maxValue);
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={padding.left - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {tick}
              </text>
            </g>
          );
        })}

      {series.map((s, _si) => {
        const pts = s.points.map((p, idx) => ({
          x: padding.left + idx * xStep,
          y: padding.top + chartH * (1 - p.value / maxValue),
          p,
        }));

        const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        const areaPath = `${path} L${pts[pts.length - 1]?.x ?? 0},${padding.top + chartH} L${pts[0]?.x ?? 0},${padding.top + chartH} Z`;

        const drawPath = smooth ? catmullRom(pts) : path;
        const stroke = s.color;
        return (
          <g key={s.name}>
            {type === "area" || type === "stacked_area" || type === "dual_tone_area" ? (
              <path d={areaPath} fill={stroke} />
            ) : null}
            <path
              d={drawPath}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dashed ? "6 4" : "0"}
            />
            {pts.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={3} fill={stroke} />
            ))}
            {showLabels &&
              pts.map((pt, i) => (
                <text key={i} x={pt.x} y={pt.y - 8} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
                  {pt.p.value}
                </text>
              ))}
          </g>
        );
      })}

      {labels.map((label, i) => (
        <text
          key={label}
          x={padding.left + i * xStep}
          y={height - 4}
          textAnchor="end"
          className="fill-muted-foreground text-[8px]"
          transform={`rotate(-30, ${padding.left + i * xStep}, ${height - 4})`}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// Catmull-Rom spline through points (smoothed line).
function catmullRom(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return pts.map((p) => `M${p.x},${p.y}`).join(" ");
  const cp: Array<[number, number]> = [
    [pts[0].x, pts[0].y],
    ...pts.map((p) => [p.x, p.y] as [number, number]),
    [pts[pts.length - 1].x, pts[pts.length - 1].y],
  ];
  let d = `M${cp[1][0]},${cp[1][1]}`;
  for (let i = 1; i < cp.length - 2; i++) {
    const x0 = cp[i - 1][0];
    const y0 = cp[i - 1][1];
    const x1 = cp[i][0];
    const y1 = cp[i][1];
    const x2 = cp[i + 1][0];
    const y2 = cp[i + 1][1];
     const _x3 = cp[i + 2][0];
     const _y3 = cp[i + 2][1];
    d += ` C${(x0 + 6 * x1) / 6},${(y0 + 6 * y1) / 6} ${(x2 + 6 * x1) / 6},${(y2 + 6 * y1) / 6} ${x2},${y2}`;
  }
  return d;
}

// ═══════════════════════════════════════════════════════════
// BUBBLE (scatter, size by value)
// ══════════════════════════════════════════════════════════

function BubbleChart({ series, showLabels, showGrid, benchmarkLines, width, height }: ChartRenderProps) {
  const padding = { top: 20, right: 30, bottom: 40, left: 80 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const maxValue = axisMaxFor(series, labels, false);
  const n = Math.max(1, labels.length);
  const xStep = chartW / (n - 1 || 1);
  const maxR = 14;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showGrid &&
        generateTicks(maxValue, 5).map((tick) => {
          const y = padding.top + chartH * (1 - tick / maxValue);
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={padding.left - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {tick}
              </text>
            </g>
          );
        })}

      {benchmarkLines.map((b) => {
        const y = padding.top + chartH * (1 - Math.min(1, Math.max(0, b.value / maxValue)));
        return (
          <g key={`b-${b.id}`}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={b.color} strokeWidth={1} strokeDasharray="4 3" />
          </g>
        );
      })}

      {series[0]?.points.map((p, i) => {
        const x = padding.left + (p.value / maxValue) * chartW;
        const y = padding.top + chartH * (1 - p.value / maxValue);
        const r = Math.max(3, (p.value / maxValue) * maxR);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={series[0].color} />
            {showLabels && (
              <text x={x + r + 2} y={y + 3} className="fill-foreground text-[8px]">{p.label}</text>
            )}
          </g>
        );
      })}

      {labels.map((label, i) => (
        <text
          key={label}
          x={padding.left + i * xStep}
          y={height - 4}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          className="fill-muted-foreground text-[8px]"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// DISPATCH
// ══════════════════════════════════════════════════════════

export const RenderChart = memo((props: ChartRenderProps) => {
  const { type } = props;
  if (type === "pie" || type === "donut") return <PieChart {...props} />;
  if (type === "bar" || type === "stacked_bar" || type === "bar_100") return <BarChart {...props} />;
  if (type === "column" || type === "stacked_column" || type === "column_100") return <ColumnChart {...props} />;
  if (type === "line" || type === "line_multi" || type === "line_smoothed" || type === "line_dashed") return <LineChart {...props} />;
  if (type === "area" || type === "stacked_area" || type === "dual_tone_area") return <LineChart {...props} />;
  if (type === "bubble") return <BubbleChart {...props} />;
  return <BarChart {...props} />;
});
RenderChart.displayName = "RenderChart";
