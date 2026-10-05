"use client";

/**
 * Widget & WidgetGrid
 *
 * Generic card-based widget architecture for dashboard and board pages.
 * Widgets are the primary content container — they can display KPIs,
 * activity feeds, charts, tables, etc.
 *
 * WidgetGrid provides a responsive grid layout for widgets.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <WidgetGrid>
 *     <Widget title="Active Batches" icon={Boxes}>
 *       ...content...
 *     </Widget>
 *     <Widget title="Activity" variant="compact">
 *       ...content...
 *     </Widget>
 *   </WidgetGrid>
 * ────────────────────────────────────────────────────────────
 */

import type { LucideIcon } from "lucide-react";
import { ExternalLink } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Widget ──────────────────────────────────────────────── */
interface WidgetProps {
  title?: string;
  icon?: LucideIcon;
  variant?: "default" | "compact" | "kpi";
  action?: {
    label: string;
    onClick?: () => void;
  };
  children: React.ReactNode;
  className?: string;
}

function Widget({
  title,
  icon: Icon,
  variant = "default",
  action,
  children,
  className,
}: WidgetProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md",
        variant === "compact" && "p-4",
        variant === "kpi" && "p-5",
        variant === "default" && "p-6",
        className,
      )}
    >
      {/* ── Header ────────────────────────────────────────── */}
      {(title || action) && (
        <div
          className={cn(
            "flex items-center justify-between",
            variant === "compact" ? "mb-3" : "mb-4",
          )}
        >
          <div className="flex items-center gap-2">
            {Icon && (
              <Icon
                className={cn(
                  "text-muted-foreground",
                  variant === "compact" ? "size-4" : "size-5",
                )}
                aria-hidden="true"
              />
            )}
            {title && (
              <h3
                className={cn(
                  "font-medium text-foreground",
                  variant === "compact" ? "text-sm" : "text-sm",
                )}
              >
                {title}
              </h3>
            )}
          </div>
          {action && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={action.onClick}
            >
              {action.label}
              <ExternalLink className="size-3" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────── */}
      <div>{children}</div>
    </div>
  );
}

/* ── WidgetGrid ──────────────────────────────────────────── */
interface WidgetGridProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}

function WidgetGrid({
  children,
  cols = 2,
  className,
}: WidgetGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── KPI Value ───────────────────────────────────────────── */
interface KpiValueProps {
  value: string | number;
  trend?: string;
  trendDirection?: "up" | "down";
  className?: string;
}

function KpiValue({
  value,
  trend,
  trendDirection,
  className,
}: KpiValueProps) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="text-2xl font-light tracking-tight text-foreground">
        {value}
      </span>
      {trend && (
        <span
          className={cn(
            "text-xs font-medium",
            trendDirection === "up"
              ? "text-destructive"
              : "text-success",
          )}
        >
          {trend}
        </span>
      )}
    </div>
  );
}

export { Widget, WidgetGrid, KpiValue };

