/**
 * Overdue job and invoice-clearance email alerts.
 *
 * Shared types for detection, recipient resolution, and digest rendering.
 */

export type AlertType = "job_overdue" | "invoice_uncleared";

/** A single alert line item detected on a job/record. */
export interface AlertCandidate {
  recordId: string;
  boardId: string;
  boardName: string;
  boardSlug: string | null;
  workspaceId: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  jobTitle: string;
  alertType: AlertType;
  /** ISO date (yyyy-mm-dd) of the deadline or the invoice due date. */
  dueDate: string;
  /** Whole days past due as of the run date. */
  daysOverdue: number;
  /** Invoice amount when the source board has an invoice_amount column. */
  invoiceAmount: number | null;
  /** Raw person-cell values (user ids) from the mapped assignee column. */
  assigneeRefs: string[];
}

/** One row of the alert_notification_logs dedupe table. */
export interface AlertLogEntry {
  recordId: string;
  alertType: AlertType;
  recipientEmail: string;
  sentOn: string;
}

/** Result of one digest run. */
export interface AlertRunSummary {
  organizationIds: string[];
  candidates: number;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  warnings: string[];
}

/** Payload for one recipient's digest email. */
export interface DigestPayload {
  recipientEmail: string;
  overdueJobs: AlertCandidate[];
  invoices: AlertCandidate[];
  appUrl: string;
}