"use client";

/**
 * Table Widget — Stub Implementation
 *
 * Renders board data as an inline scrollable table within a dashboard.
 * Full implementation reuses the existing TableView from Board Runtime.
 *
 * Registration pattern: self-registers via registerWidget().
 * No switch statements, no board-specific logic.
 */

import React from "react";
import { Table2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerWidget } from "../widget-registry/widget-registry";
import type { WidgetPlugin, WidgetRenderProps } from "@/lib/analytics/contracts";

function TableWidgetRenderer({ widget, boardData }: WidgetRenderProps) {
  const recordCount = boardData?.records.length ?? 0;
  const columns = boardData?.columns ?? [];

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {widget.title ?? "Table"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 h-[calc(100%-3rem)] overflow-auto">
        {recordCount === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Select a board to display data</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                {columns.slice(0, 6).map((col) => (
                  <th key={col.id} className="px-3 py-2 text-left font-medium text-xs text-muted-foreground truncate max-w-[120px]">
                    {col.label}
                  </th>
                ))}
                {columns.length > 6 && (
                  <th className="px-3 py-2 text-xs text-muted-foreground">+{columns.length - 6}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {boardData?.records.slice(0, 20).map((record) => (
                <tr key={record.id} className="border-t border-border/50 hover:bg-muted/30">
                  {columns.slice(0, 6).map((col) => {
                    const key = `${record.id}:${col.id}`;
                    const value = boardData?.cellValues.get(key);
                    return (
                      <td key={col.id} className="px-3 py-1.5 truncate max-w-[120px] text-xs">
                        {String(value ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {recordCount > 20 && (
          <div className="text-xs text-center text-muted-foreground py-1 border-t border-border/50">
            Showing 20 of {recordCount} records
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const TableWidget: WidgetPlugin = {
  type: "table",
  displayName: "Table",
  icon: Table2,
  defaultConfig: {},
  configSchema: {},
  render: TableWidgetRenderer,
  minSize: { w: 4, h: 4 },
};

registerWidget(TableWidget);
