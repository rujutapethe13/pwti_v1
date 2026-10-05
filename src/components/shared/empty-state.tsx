"use client";

/**
 * EmptyState
 *
 * Reusable empty state component for pages, sections, and data tables.
 * Shows an icon, message, optional description, and optional CTA button.
 *
 * ── Variants ───────────────────────────────────────────────
 * - default: centered with large icon
 * - compact: smaller, inline variant for sections
 * ────────────────────────────────────────────────────────────
 */

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
  };
  /** Compact variant for embedding in sections */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact,
  className,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed py-8",
          className,
        )}
      >
        <Icon
          className="mb-2 size-8 text-muted-foreground/40"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            {description}
          </p>
        )}
        {action && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
      role="status"
    >
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
        <Icon className="size-8 text-muted-foreground/60" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

