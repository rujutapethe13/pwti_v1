"use client";

/**
 * Dashboard — Add Widget picker (§3)
 *
 * The original three widget types plus the role-driven widgets:
 *   - Chart          ("Create chart widget to visually show data")
 *   - Data over time ("trend widget ...")
 *   - Numbers (KPI)  ("Get a quick view on all number columns")
 *   - KPI card       (a single number read through the column role mapping)
 *   - Due list       (overdue + due soon)
 *   - Jobs table     (recent jobs)
 *
 * Battery, Gantt, Files Gallery, and Apps are intentionally NOT offered.
 */

import { memo } from "react";
import { BarChart3, TrendingUpDown, LayoutGrid, Gauge, CalendarClock, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DashboardWidgetType } from "./dashboard-types";

export interface WidgetPickerOption {
  type: DashboardWidgetType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const WIDGET_PICKER_OPTIONS: WidgetPickerOption[] = [
  {
    type: "chart",
    label: "Chart",
    description: "Create chart widget to visually show data",
    icon: BarChart3,
  },
  {
    type: "data-over-time",
    label: "Data over time",
    description: "Plot a metric against a date/timeline column over time",
    icon: TrendingUpDown,
  },
  {
    type: "number",
    label: "Numbers",
    description: "Get a quick view on all number columns (KPI card)",
    icon: LayoutGrid,
  },
  {
    type: "kpi-card",
    label: "KPI card",
    description: "A single number from your column mapping, with change vs the previous period",
    icon: Gauge,
  },
  {
    type: "due-list",
    label: "Due list",
    description: "Overdue jobs and jobs due in the next few days",
    icon: CalendarClock,
  },
  {
    type: "jobs-table",
    label: "Jobs table",
    description: "A compact table of the most recently updated jobs",
    icon: Table2,
  },
];

export interface WidgetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: DashboardWidgetType) => void;
}

export const WidgetPicker = memo(({ open, onOpenChange, onSelect }: WidgetPickerProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="p-0">
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle className="text-left">Add widget</DialogTitle>
      </DialogHeader>
      <div className="px-4 pb-4">
        <p className="text-sm text-muted-foreground">
          Choose a widget type to add to your dashboard.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 px-4 pb-4">
        {WIDGET_PICKER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <Button
              key={opt.type}
              variant="outline"
              className="h-auto justify-start gap-3 py-3 text-left"
              onClick={() => {
                onSelect(opt.type);
                onOpenChange(false);
              }}
            >
              <Icon className="size-5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-sm text-muted-foreground">{opt.description}</div>
              </div>
            </Button>
          );
        })}
      </div>
    </DialogContent>
  </Dialog>
));
WidgetPicker.displayName = "WidgetPicker";
