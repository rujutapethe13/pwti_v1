"use client";

/**
 * Chart Widget — Stub Implementation
 *
 * Renders a chart (bar, line, area, pie, donut, scatter) from board data.
 * Full implementation requires a charting library (recharts, visx, etc.).
 *
 * Registration pattern: self-registers via registerWidget().
 * No switch statements, no board-specific logic.
 */

import React from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerWidget } from "../widget-registry/widget-registry";
import type { WidgetPlugin, WidgetRenderProps, ChartConfig } from "@/lib/analytics/contracts";

const DEFAULT_CONFIG: ChartConfig = {
  chartType: "bar",
  labelField: "",
  valueField: "",
  showLegend: true,
  showLabels: true,
  showGrid: true,
  stacked: false,
};

function ChartWidgetRenderer({ config, widget }: WidgetRenderProps<ChartConfig>) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {widget.title ?? "Chart"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[calc(100%-3rem)]">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Chart widget</p>
          <p className="text-xs">({config.chartType})</p>
          {config.labelField && (
            <p className="text-xs mt-1">
              {config.labelField} → {config.valueField}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const ChartWidget: WidgetPlugin<ChartConfig> = {
  type: "chart",
  displayName: "Chart",
  icon: BarChart3,
  defaultConfig: DEFAULT_CONFIG,
  configSchema: {},
  render: ChartWidgetRenderer,
  minSize: { w: 4, h: 4 },
};

registerWidget(ChartWidget);
