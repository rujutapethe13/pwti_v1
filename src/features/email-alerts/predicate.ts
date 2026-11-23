/**
 * Pure predicate and date logic for overdue job / invoice-clearance alerts.
 *
 * No I/O here on purpose: every rule below is exercised by the unit tests in
 * src/tests/unit/email-alerts.test.ts and must stay side-effect free.
 */

import type { AlertLogEntry } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuses that mean a job is finished and must never alert. */
const COMPLETED_STATUS_RE = /done|complete|deliver|cancel|closed|paid/i;

/** Invoice statuses that mean the invoice is cleared and must never alert. */
const CLEARED_INVOICE_RE = /^(paid|cleared|settled|received|closed|done|complete)$/i;

/**
 * Board status columns store option ids ("opt-done") in cell_values.value and
 * the human label ("Done") in settings. Strip the prefix so both forms are
 * recognised by the regexes above.
 */
function stripOptionPrefix(status: string): string {
  return status.trim().replace(/^opt-/i, "");
}

/** Minimal pragmatic email check — never invents addresses, only validates. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Normalize to lowercase trimmed form used for dedupe keys. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize a client name for exact matching against canonical names and
 * aliases: lowercase, collapse all whitespace (including newlines), trim.
 *
 * This is deliberately conservative — case and whitespace only. No fuzzy
 * matching, no prefix matching, no edit distance: a wrong match here would
 * email the wrong client's contacts, so an unmatched name stays unmatched.
 */
export function normalizeClientName(name: string | null | undefined): string {
  return String(name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when a job status means the job is finished (no alerts). */
export function isJobCompleted(status: string | null | undefined): boolean {
  if (!status) return false;
  return COMPLETED_STATUS_RE.test(stripOptionPrefix(status));
}

/** True when an invoice_status value means the invoice is cleared (no alerts). */
export function isInvoiceCleared(status: string | null | undefined): boolean {
  if (!status) return false;
  return CLEARED_INVOICE_RE.test(stripOptionPrefix(status));
}

/** Parse a yyyy-mm-dd string into a UTC day number (days since epoch). */
export function toDayNumber(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  // Reject impossible dates like 31 Feb — Date.UTC rolls them over silently.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Parse a board cell date into yyyy-mm-dd. Board cells hold either ISO dates
 * ("2026-11-18") or day-first text ("17-03-2026", "17/03/2026") — the app's
 * date convention is day-first for ambiguous input. Returns null when the
 * value cannot be parsed; detection skips those rows rather than guessing.
 */
export function parseCellDate(value: unknown, valueText?: string | null): string | null {
  const raw = String(
    valueText && String(valueText).trim()
      ? valueText
      : value == null
        ? ""
        : value,
  ).trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return toDayNumber(raw) == null ? null : `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return toDayNumber(isoDate) == null ? null : isoDate;
  }

  return null;
}

/** Today's date as a yyyy-mm-dd string in the given timezone (default IST). */
export function todayIso(timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/**
 * Whole days between two yyyy-mm-dd dates (dueDate → today). Returns null when
 * either date is unparseable. Negative when today is before dueDate.
 */
export function daysBetween(dueDate: string, today: string): number | null {
  const a = toDayNumber(dueDate);
  const b = toDayNumber(today);
  if (a == null || b == null) return null;
  return b - a;
}

/** Add calendar days to a yyyy-mm-dd string, returning yyyy-mm-dd. */
export function addDays(isoDate: string, days: number): string | null {
  const base = toDayNumber(isoDate);
  if (base == null) return null;
  return new Date((base + days) * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Overdue rule: the deadline has strictly passed and the job is not finished.
 * Returns null when the job must not alert, otherwise the days overdue.
 */
export function overdueJobDays(
  dueDate: string | null | undefined,
  status: string | null | undefined,
  isPending: boolean | null | undefined,
  today: string,
): number | null {
  if (!dueDate || isPending === false) return null;
  if (isJobCompleted(status)) return null;
  const delta = daysBetween(dueDate, today);
  if (delta == null || delta <= 0) return null;
  return delta;
}

/**
 * Invoice rule: the client has a term, the invoice is not cleared, and today is
 * strictly past (counted-from date + term). Returns the days overdue or null.
 */
export function invoiceOverdueDays(
  countedFrom: string | null | undefined,
  paymentTermDays: number | null | undefined,
  invoiceStatus: string | null | undefined,
  today: string,
): number | null {
  if (paymentTermDays == null || paymentTermDays < 0) return null;
  if (!countedFrom) return null;
  if (isInvoiceCleared(invoiceStatus)) return null;
  const due = addDays(countedFrom, paymentTermDays);
  if (!due) return null;
  const delta = daysBetween(due, today);
  if (delta == null || delta <= 0) return null;
  return delta;
}

/**
 * Cadence rule: should this (record, alert type, recipient) alert today?
 *
 * - Never twice on the same day.
 * - After a send, wait ALERT_REPEAT_INTERVAL_DAYS (default 7) before repeating.
 * - When the job is resolved the candidate simply disappears, which stops alerts.
 *
 * `today` and the log dates are yyyy-mm-dd strings.
 */
export function shouldSendAlert(
  logs: AlertLogEntry[],
  today: string,
  repeatIntervalDays: number,
): boolean {
  const interval = Number.isFinite(repeatIntervalDays) && repeatIntervalDays >= 1 ? Math.floor(repeatIntervalDays) : 7;
  const todayNum = toDayNumber(today);
  if (todayNum == null) return false;
  for (const log of logs) {
    const sentNum = toDayNumber(log.sentOn);
    if (sentNum == null) continue;
    const age = todayNum - sentNum;
    if (age === 0) return false;
    if (age > 0 && age < interval) return false;
  }
  return true;
}

/** Parse a numeric cell value (invoice amounts arrive as text or number). */
export function parseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}