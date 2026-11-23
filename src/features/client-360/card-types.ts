// Shared Client 360 card types, constants, and pure helpers.
// Intentionally has NO "use server" so it can be imported by both client
// components and server action modules.

export type CardType =
  | "total-jobs"
  | "batches-in-progress"
  | "average-delivery-time"
  | "skus-processed"
  | "invoiced"
  | "next-best-actions"
  | "monthly-throughput";

export const DELIVERY_TARGET_DAYS = 2; // turnaround target in days

// ── Status rules (config) ────────────────────────────────────────────────────
// Any label not listed here counts as Unknown. The admin note lists distinct
// unknown labels with counts so they can be classified.
export const STATUS_CONFIG = {
  completed: ["done", "completed", "delivered", "approved", "finished", "resolved", "closed"],
  pending: ["in progress", "active", "queued", "started"],
  waiting: ["not started", "pending", "todo", "backlog"],
} as const;

export function isCompletedStatus(label: string): boolean {
  const s = label.toLowerCase().trim();
  if (!s || s === "unspecified") return false;
  return STATUS_CONFIG.completed.some((k) => s === k || s.includes(k));
}

export function isPendingStatus(label: string): boolean {
  const s = label.toLowerCase().trim();
  if (!s || s === "unspecified") return false;
  return (
    STATUS_CONFIG.pending.some((k) => s === k || s.includes(k)) ||
    STATUS_CONFIG.waiting.some((k) => s === k || s.includes(k))
  );
}

export function statusBucketFromConfig(label: string): "Done" | "In progress" | "Waiting" | "Unknown" {
  const s = label.toLowerCase().trim();
  if (!s || s === "unspecified") return "Unknown";
  if (isCompletedStatus(s)) return "Done";
  if (isPendingStatus(s)) {
    if (STATUS_CONFIG.waiting.some((k) => s === k || s.includes(k))) return "Waiting";
    return "In progress";
  }
  return "Unknown";
}

export const CARD_FIELD_TYPES = [
  "batch_job_id",
  "receive_date",
  "upload_date",
  "job_status",
  "sku_count",
  "image_count",
  "invoice_amount",
  "invoice_status",
  "assignee_owner",
] as const;

export type FieldMap = Map<string, string>; // field_type -> column_id

export type RawCell = {
  record_id: string;
  column_id: string;
  value: unknown;
  value_text: string | null;
};

export type BoardCtx = {
  boardId: string;
  boardName: string;
  fieldMap: FieldMap;
  missingFieldTypes: string[];
};

export type JobRow = {
  recordId: string;
  boardId: string;
  boardName: string;
  title: string;
  batchId: string;
  receiveDate: Date | null;
  uploadDate: Date | null;
  status: string;
  statusBucket: "Done" | "In progress" | "Waiting" | "Unknown";
  skuCount: number | null;
  imageCount: number | null;
  invoiceAmount: number | null;
  invoiceStatus: string;
  assignee: string;
  jobDate: string | null;
  jobType: string;
  turnaroundDays: number | null;
  paymentTermDays: number | null;
  paymentTermDaysOverride: number | null;
  alsoLinkedOn?: string[];
};

export function isCompletedJob(job: Pick<JobRow, "statusBucket" | "receiveDate" | "uploadDate">): boolean {
  return job.statusBucket === "Done" && job.receiveDate !== null && job.uploadDate !== null;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function normalizeLabel(label: string): string {
  return String(label ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDateText(v: unknown, vt: string | null): Date | null {
  const raw =
    vt ??
    (typeof v === "string"
      ? v
      : v === null || v === undefined
        ? ""
        : String(v));
  if (!raw.trim()) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function parseNumber(v: unknown, vt: string | null): number | null {
  const raw =
    vt ??
    (typeof v === "string"
      ? v
      : typeof v === "number"
        ? String(v)
        : null);
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.")
    return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseStatus(v: unknown, vt: string | null): string {
  const raw =
    vt ??
    (typeof v === "string"
      ? v
      : v === null || v === undefined
        ? ""
        : String(v));
  return raw.trim() || "Unspecified";
}

export function statusBucket(
  status: string,
): "Done" | "In progress" | "Waiting" | "Unknown" {
  const s = status.toLowerCase().trim();
  if (!s || s === "unspecified") return "Unknown";
  if (
    s === "done" ||
    s.includes("complete") ||
    s.includes("delivered") ||
    s.includes("approved") ||
    s.includes("finished") ||
    s.includes("resolved") ||
    s.includes("closed")
  )
    return "Done";
  if (
    s === "in progress" ||
    s.includes("progress") ||
    (s.includes("active") && !s.includes("not")) ||
    s.includes("queued") ||
    (s.includes("started") && !s.includes("not started"))
  )
    return "In progress";
  if (
    s === "not started" ||
    s.includes("not started") ||
    s.includes("pending") ||
    s.includes("todo") ||
    s.includes("backlog")
  )
    return "Waiting";
  return "Unknown";
}

export function formatDateUI(
  iso: string | null | undefined,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function isPracticeBoard(name: string): boolean {
  return /practice/i.test(name ?? "");
}

/**
 * A job is invoice-pending when it has not been invoiced or paid yet. Anything
 * already invoiced/billed/sent/paid is excluded from "apply terms" updates.
 */
export function isInvoicePending(job: { invoiceStatus: string | null | undefined }): boolean {
  const s = (job.invoiceStatus ?? "").toLowerCase().trim();
  if (!s || s === "—" || s === "-") return true;
  const cleared = ["paid", "invoiced", "invoice sent", "sent", "billed", "cleared", "settled"];
  return !cleared.some((key) => s === key || s.includes(key));
}

/** Display label for a day count, e.g. "Net 15", "Custom · 21 days". */
export function formatPaymentTermDays(
  days: number | null | undefined,
  fallback = "Not added",
): string {
  if (days == null) return fallback;
  if (days === 0) return "Immediate";
  if (days === 7) return "Net 7";
  if (days === 15) return "Net 15";
  if (days === 30) return "Net 30";
  if (days === 45) return "Net 45";
  if (days === 60) return "Net 60";
  return `Custom · ${days} days`;
}

// ── Result types ─────────────────────────────────────────────────────────────

export type MissingMapping = {
  boardId: string;
  boardName: string;
  missingFieldTypes: string[];
};

export interface CardResult<T> {
  data: T | null;
  error: string | null;
  boardsContributing: Array<{
    boardId: string;
    boardName: string;
    jobCount: number;
    lastUpdated: string | null;
  }>;
  missingMappings: MissingMapping[];
  unmatchedCount: number;
}
