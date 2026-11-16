/**
 * Shared <ChartCard /> wrapper for every dashboard widget
 * ─────────────────────────────────────────────────────────────
 *
 * The Status breakdown chart used to render a blank widget with only a "100%"
 * label because nothing in the chain guaranteed a real, visible chart:
 *
 *   1. The SVG ring scaled to its container, and the container had no explicit
 *      height — a flex/grid cell collapses to 0 when nothing forces a height,
 *      so the ring was drawn at 0×0.
 *   2. A status with no mapped colour was skipped entirely, so a single-status
 *      board produced one slice that was never visible.
 *   3. An empty board produced no data at all, and the widget rendered nothing.
 *
 * This wrapper fixes all three at once and is the single place every dashboard
 * widget asks for a card body, so the same rules apply everywhere:
 *
 *   - explicit minimum height + min-width 0 (never collapses in a grid/flex)
 *   - loading state (spinner) while data resolves
 *     - empty state ("No data") when there is genuinely nothing to show
 *   - error state ("Couldn't load chart") instead of a blank widget
 *   - an error boundary around the chart itself so a render crash cannot take
 *     the whole dashboard down
 *
 * The wrapper deliberately renders NO header: the outer <WidgetCard /> already
 * supplies the title bar, so nesting this inside it produces one card, not two.
 */

import { Component, type ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  /** Optional heading used only by the error boundary message. */
  title?: string;
  /** While true, show a spinner instead of the chart. */
  loading?: boolean;
  /** A thrown error, if the chart crashed while rendering. */
  error?: Error | null;
  /** When true and there is no error, show the empty state. */
  empty?: boolean;
  /** Short label for the empty state (defaults to "No data"). */
  emptyLabel?: string;
  /** Extra class names on the card shell. */
  className?: string;
  children: ReactNode;
}

/**
 * Class-component error boundary. A function component cannot catch its own
 * render errors, so the wrapper needs this to isolate a chart crash.
 */
class ChartErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state: { hasError: boolean; error?: Error } = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center gap-2 p-4 text-center">
          <AlertCircle className="size-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Couldn't load chart</p>
            <p className="text-muted-foreground">
              {this.state.error?.message ?? "This chart failed to render."}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Shared card-body shell for every dashboard widget.
 *
 * The shell is deliberately a tall, bounded box: `min-h-[240px]` gives the
 * chart a real height to scale into, and `min-w-0` keeps it from overflowing
 * its grid cell. The chart itself fills the remaining space.
 */
export function ChartCard({
  loading = false,
  error = null,
  empty = false,
  emptyLabel = "No data",
  className,
  children,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 flex-col rounded-lg border border-border bg-card",
        "min-h-[240px]",
        className,
      )}
    >
      <div className="relative min-h-0 flex-1 min-w-0">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-full w-full items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="size-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Couldn't load chart</p>
              <p className="text-muted-foreground">{error.message}</p>
            </div>
          </div>
        ) : empty ? (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <ChartErrorBoundary>
            <div className="h-full w-full min-w-0">
              {children}
            </div>
          </ChartErrorBoundary>
        )}
      </div>
    </div>
  );
}

ChartCard.displayName = "ChartCard";