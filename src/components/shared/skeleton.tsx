"use client";

/**
 * Skeleton
 *
 * Loading placeholder components for content that hasn't loaded yet.
 * Variants: card, list, table-row, and a base primitive.
 *
 * All use a subtle animated shimmer via Tailwind's `animate-pulse`.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <Skeleton.Card />
 *   <Skeleton.List rows={3} />
 *   <Skeleton.TableRow cols={4} />
 * ────────────────────────────────────────────────────────────
 */

import { cn } from "@/lib/utils";

/* ── Base Skeleton Primitive ────────────────────────────── */
function SkeletonPrimitive({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/* ── Card Skeleton ───────────────────────────────────────── */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-6", className)}>
      <SkeletonPrimitive className="mb-4 h-4 w-3/5" />
      <SkeletonPrimitive className="mb-2 h-8 w-1/4" />
      <SkeletonPrimitive className="h-3 w-2/5" />
    </div>
  );
}

/* ── List Skeleton ───────────────────────────────────────── */
function SkeletonList({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonPrimitive className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonPrimitive className="h-3.5 w-3/5" />
            <SkeletonPrimitive className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Table Row Skeleton ──────────────────────────────────── */
function SkeletonTableRow({
  cols = 4,
  className,
}: {
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-4 py-3", className)}
      aria-busy="true"
      aria-label="Loading row"
    >
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonPrimitive
          key={i}
          className={cn("h-4", i === 0 ? "w-2/5" : "w-1/5")}
        />
      ))}
    </div>
  );
}

/* ── Export ──────────────────────────────────────────────── */
export const Skeleton = {
  Base: SkeletonPrimitive,
  Card: SkeletonCard,
  List: SkeletonList,
  TableRow: SkeletonTableRow,
};

