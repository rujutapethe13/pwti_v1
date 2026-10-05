"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/shared/skeleton";

interface LoadingOverlayProps {
  loading: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function LoadingOverlay({ loading, children, className }: LoadingOverlayProps) {
  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton.Base className="h-8 w-48" />
        <Skeleton.Base className="h-6 w-full" />
        <Skeleton.Base className="h-6 w-3/4" />
        <Skeleton.Base className="h-6 w-5/6" />
        <div className="grid grid-cols-4 gap-3 pt-2">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid gap-4 border-b border-border p-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton.Base key={i} className="h-4 w-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="grid gap-4 border-b border-border/60 p-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton.Base key={colIdx} className="h-5 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MetricSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Skeleton.Base className="mb-2 h-3 w-16" />
          <Skeleton.Base className="h-8 w-20" />
          <Skeleton.Base className="mt-1 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
