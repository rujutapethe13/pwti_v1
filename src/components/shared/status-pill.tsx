"use client";

/**
 * StatusPill
 *
 * Maps production workflow stages to visual pills with semantic colors.
 * Uses the CSS custom properties defined in globals.css for status colors.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   <StatusPill status="approved" />
 *   <StatusPill status="delayed" />
 * ────────────────────────────────────────────────────────────
 */

import { cn } from "@/lib/utils";

export type StatusKey =
  | "not-started"
  | "pre-production"
  | "deck-shared"
  | "pi-shared"
  | "po-received"
  | "shoot"
  | "post-production"
  | "qc"
  | "approval-pending"
  | "approved"
  | "invoice-raised"
  | "done"
  | "delayed";

const statusConfig: Record<
  StatusKey,
  { label: string; cssVar: string }
> = {
  "not-started": { label: "Not Started", cssVar: "status-not-started" },
  "pre-production": { label: "Pre Production", cssVar: "status-in-progress" },
  "deck-shared": { label: "Deck Shared", cssVar: "status-in-progress" },
  "pi-shared": { label: "PI Shared", cssVar: "status-in-progress" },
  "po-received": { label: "PO Received", cssVar: "status-in-progress" },
  shoot: { label: "Shoot", cssVar: "status-in-progress" },
  "post-production": { label: "Post Production", cssVar: "status-in-progress" },
  qc: { label: "QC", cssVar: "status-review" },
  "approval-pending": { label: "Approval Pending", cssVar: "status-review" },
  approved: { label: "Approved", cssVar: "status-approved" },
  "invoice-raised": { label: "Invoice Raised", cssVar: "status-done" },
  done: { label: "Done", cssVar: "status-done" },
  delayed: { label: "Delayed", cssVar: "status-delayed" },
};

interface StatusPillProps {
  status: StatusKey;
  className?: string;
  /** Show just a dot indicator instead of a full pill */
  dotOnly?: boolean;
}

export function StatusPill({ status, className, dotOnly }: StatusPillProps) {
  const config = statusConfig[status];

  if (!config) return null;

  if (dotOnly) {
    return (
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: `hsl(var(--${config.cssVar}))` }}
        aria-label={config.label}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        "transition-colors duration-150",
        className,
      )}
      style={{
        backgroundColor: `hsl(var(--${config.cssVar}) / 0.12)`,
        color: `hsl(var(--${config.cssVar}))`,
      }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: `hsl(var(--${config.cssVar}))` }}
      />
      {config.label}
    </span>
  );
}

