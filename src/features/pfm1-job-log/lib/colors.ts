/**
 * PFM1 Job Log — Color Constants & Status Mapping
 *
 * Soft pastel accent palette derived from the CSS custom properties
 * in `src/styles/globals.css`. Each status maps to a muted token so
 * badges and charts stay readable against the dark theme without
 * harsh neon tones.
 */

import type { JobStatus } from "../types";

export interface AccentColor {
  text: string;
  bg: string;
}

export interface StatusColorConfig {
  status: JobStatus;
  label: string;
  color: "teal" | "coral" | "amber" | "lavender" | "gray";
  dotColor: string;
}

export const STATUS_COLORS: Record<JobStatus, AccentColor> = {
  Completed: { text: "hsl(var(--soft-teal-text))", bg: "hsl(var(--soft-teal-bg))" },
  "In Progress": { text: "hsl(var(--soft-lavender-text))", bg: "hsl(var(--soft-lavender-bg))" },
  Pending: { text: "hsl(var(--soft-coral-text))", bg: "hsl(var(--soft-coral-bg))" },
  Delayed: { text: "hsl(var(--soft-gray-text))", bg: "hsl(var(--soft-gray-bg))" },
};

export const STATUS_CONFIG: Record<JobStatus, StatusColorConfig> = {
  Completed: { status: "Completed", label: "Completed", color: "teal", dotColor: "hsl(var(--soft-teal-text))" },
  "In Progress": { status: "In Progress", label: "In Progress", color: "lavender", dotColor: "hsl(var(--soft-lavender-text))" },
  Pending: { status: "Pending", label: "Pending", color: "coral", dotColor: "hsl(var(--soft-coral-text))" },
  Delayed: { status: "Delayed", label: "Delayed", color: "gray", dotColor: "hsl(var(--soft-gray-text))" },
};

export const STATUS_OPTIONS: JobStatus[] = ["Completed", "Pending", "In Progress", "Delayed"];

export function getStatusConfig(status: string): StatusColorConfig {
  const lower = status.toLowerCase();
  if (lower === "completed" || lower.includes("done") || lower.includes("complete")) return STATUS_CONFIG.Completed;
  if (lower === "pending" || lower.includes("queued") || lower === "to do" || lower.includes("todo")) return STATUS_CONFIG.Pending;
  if (lower === "delayed" || lower.includes("delay") || lower.includes("block") || lower.includes("stalled") || lower.includes("hold")) return STATUS_CONFIG.Delayed;
  if (lower === "in progress" || lower.includes("progress") || lower.includes("working")) return STATUS_CONFIG["In Progress"];
  return STATUS_CONFIG.Pending;
}

export function getStatusColor(status: string): AccentColor {
  return STATUS_COLORS[getStatusConfig(status).status];
}

export function accentForColor(name: "teal" | "coral" | "amber" | "lavender" | "gray"): AccentColor {
  const map: Record<string, AccentColor> = {
    teal: STATUS_COLORS.Completed,
    coral: STATUS_COLORS.Pending,
    amber: { text: "hsl(var(--soft-amber-text))", bg: "hsl(var(--soft-amber-bg))" },
    lavender: STATUS_COLORS["In Progress"],
    gray: STATUS_COLORS.Delayed,
  };
  return map[name] ?? map.gray;
}
