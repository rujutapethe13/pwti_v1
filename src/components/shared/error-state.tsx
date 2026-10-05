"use client";

/**
 * ErrorState
 *
 * Reusable error display with two variants:
 * - `inline`: compact, for embedding in cards/sections
 * - `fullPage`: full-screen error with retry action
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <ErrorState variant="inline" message="Failed to load data" />
 *   <ErrorState variant="fullPage" onRetry={() => refetch()} />
 * ────────────────────────────────────────────────────────────
 */

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  variant?: "inline" | "fullPage";
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  variant = "inline",
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4",
          className,
        )}
        role="alert"
      >
        <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="shrink-0"
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-20 text-center",
        className,
      )}
      role="alert"
    >
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle
          className="size-8 text-destructive"
          aria-hidden="true"
        />
      </div>
      <h2 className="text-xl font-medium text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

