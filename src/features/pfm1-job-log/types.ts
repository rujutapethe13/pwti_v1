/**
 * PFM1 Job Log — Type Definitions
 *
 * Production File Manager v1. A lightweight job-tracking dashboard
 * for creative studios to monitor file upload batches, client jobs,
 * and production pipeline status.
 */

import type { LucideIcon } from "lucide-react";

export type JobStatus = "Completed" | "Pending" | "In Progress" | "Delayed";

export interface JobLogRow {
  id: string;
  client: string;
  jobType: string;
  batch: string;
  received: string;
  uploaded: string | null;
  skus: number;
  comment: string;
  status: JobStatus;
  updatedAt: string;
}

export interface DashboardFilters {
  client: string;
  jobType: string;
  status: string;
  month: string;
}

export interface StatCardSpec {
  label: string;
  value: string | number;
  colorVar: "teal" | "coral" | "amber" | "lavender" | "gray";
  icon?: LucideIcon;
}

export interface SortState {
  field: string;
  direction: "asc" | "desc";
}
