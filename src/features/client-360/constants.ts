export const STATUS_NORMALIZATION: Record<string, string> = {
  done: "Completed",
  completed: "Completed",
  complete: "Completed",
  finished: "Completed",
  closed: "Completed",
  resolved: "Completed",
  delivered: "Completed",

  overdue: "Overdue",
  blocked: "Overdue",
  stuck: "Overdue",
  delayed: "Overdue",
  "at risk": "Overdue",
  "at-risk": "Overdue",

  "in progress": "In progress",
  "working on it": "In progress",
  "in-progress": "In progress",
  started: "In progress",
  active: "In progress",
  queued: "In progress",
  inprogress: "In progress",

  "not started": "Not started",
  todo: "Not started",
  "to-do": "Not started",
  backlog: "Not started",
  pending: "Not started",
  "not-started": "Not started",
  open: "Not started",

  qa: "QA",
  review: "Review",
  "in review": "Review",
  "in-qa": "QA",
  testing: "QA",
  "in testing": "QA",
};

export const STATUS_BUCKET_ORDER = ["Completed", "In progress", "QA", "Review", "Overdue", "Not started", "Other"];

export function normalizeStatus(value: unknown): string {
  if (value === null || value === undefined) return "Other";
  const str = String(value).toLowerCase().trim();
  return STATUS_NORMALIZATION[str] ?? "Other";
}

export const CLIENT_COLUMN_NAME_HINTS = ["client", "customer", "account", "company", "account name", "client name"];

export const CLIENT_COLUMN_TYPES = ["text", "dropdown", "status", "person", "long_text", "email", "phone", "url", "multi_select"];

export function isClientColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  const labelLower = column.label.toLowerCase();
  const hasClientHint = CLIENT_COLUMN_NAME_HINTS.some((hint) => labelLower.includes(hint));
  const isClientType = CLIENT_COLUMN_TYPES.includes(column.type);
  const hasClientSetting = (column.settings?.clientType as string | undefined) !== undefined;
  return (hasClientHint && isClientType) || hasClientSetting;
}

export function getClientType(column: { settings?: Record<string, unknown> }): "recurring" | "non-recurring" | undefined {
  const raw = column.settings?.clientType as string | undefined;
  if (raw === "recurring" || raw === "non-recurring") return raw;
  return undefined;
}

// ── Job Date Column Detection ────────────────────────────────────────────────

/**
 * Hint keywords that *increase* the likelihood a column is the "job date" —
 * i.e. the date a job was received / created (not a due date or delivery date).
 * Checked against the lower-cased column label.
 */
export const JOB_DATE_COLUMN_NAME_HINTS = ["received", "inward", "job date", "created"];

/**
 * Label fragments that **must** exclude a column from being detected as the
 * job date, because they refer to a different date (delivery, deadline, etc.).
 * Real boards often have both "Received date" and "Delivered Time" as
 * separate columns — this exclusion ensures the delivered column is never
 * mistaken for the job received date.
 */
export const JOB_DATE_COLUMN_NAME_EXCLUDES = [
  "due",
  "delivery",
  "delivered",
  "deadline",
  "upload",
  "estimated",
  // Actual-completion labels: a "Completion Date" column must not also be read
  // as the received date, or turnaround would measure a column against itself.
  "completed",
  "complete date",
  "completion",
  "finished",
  "closure",
  "closed",
];

/** Column types eligible to hold a job date value. */
export const JOB_DATE_COLUMN_TYPES = ["date", "timeline"];

/**
 * Returns true when a column is a "job date" column — the date a job was
 * received or created, **not** a due / delivery / deadline date, and not an
 * actual completion date.
 */
export function isJobDateColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  const labelLower = column.label.toLowerCase();

  // Reject columns whose label explicitly refers to a different date.
  if (JOB_DATE_COLUMN_NAME_EXCLUDES.some((hint) => labelLower.includes(hint))) {
    return false;
  }

  const isDateType = JOB_DATE_COLUMN_TYPES.includes(column.type);
  if (!isDateType) return false;

  // Match on a positive hint first, then fall back to the generic "date" label.
  const hasDateHint = JOB_DATE_COLUMN_NAME_HINTS.some((hint) => labelLower.includes(hint));
  const hasGenericDateLabel = labelLower.includes("date");

  return hasDateHint || hasGenericDateLabel;
}

// ── Due Date Column Detection ────────────────────────────────────────────────

/**
 * Hint keywords for detecting a "due / delivery date" column.
 * These are the exact labels Part 1 excluded from job_date detection;
 * now they get their own dedicated detection pass.
 */
export const DUE_DATE_COLUMN_NAME_HINTS = ["due", "delivery", "delivered", "deadline"];

/** Column types eligible to hold a due date value. */
export const DUE_DATE_COLUMN_TYPES = ["date", "timeline"];

/**
 * Returns true when a column is a "due date" / "delivery date" column.
 * Matches labels containing any of the due-date hint keywords,
 * restricted to date/timeline column types.
 */
export function isDueDateColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  const labelLower = column.label.toLowerCase();
  if (!DUE_DATE_COLUMN_TYPES.includes(column.type)) return false;
  return DUE_DATE_COLUMN_NAME_HINTS.some((hint) => labelLower.includes(hint));
}

// ── Completed Date Column Detection ───────────────────────────────────────────

/**
 * Hint keywords for a column that records when work actually *finished*.
 * A turnaround time is only meaningful when a real completion timestamp exists,
 * so this is the only thing allowed to populate `completed_date`.
 */
export const COMPLETED_DATE_COLUMN_NAME_HINTS = [
  "completed",
  "complete date",
  "completion",
  "finished",
  "closure",
  "closed",
];

/**
 * Label fragments that disqualify a column from being an actual completion date.
 * These all describe a *planned* or *requested* date, which would make turnaround
 * meaningless (a job is never "late" against its own completion date).
 */
export const COMPLETED_DATE_COLUMN_NAME_EXCLUDES = [
  "due",
  "deadline",
  "delivery",
  "delivered",
  "expected",
  "estimated",
  "target",
  "planned",
  "upload",
  "requested",
  "received",
  "created",
  "reshoot",
  "re-shoot",
  "rework",
];

/** Column types eligible to hold a completion date value. */
export const COMPLETED_DATE_COLUMN_TYPES = ["date", "timeline"];

/**
 * Returns true when a column records an *actual* completion date.
 * A column that reads like a plan, a request, or the received date never qualifies.
 */
export function isCompletedDateColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  if (!COMPLETED_DATE_COLUMN_TYPES.includes(column.type)) return false;
  const labelLower = column.label.toLowerCase();
  if (COMPLETED_DATE_COLUMN_NAME_EXCLUDES.some((hint) => labelLower.includes(hint))) {
    return false;
  }
  return COMPLETED_DATE_COLUMN_NAME_HINTS.some((hint) => labelLower.includes(hint));
}

// ── Status Column Detection ──────────────────────────────────────────────────

/**
 * Hint keywords for detecting a "status" column.
 * Matches labels equal to or containing "status".
 */
export const STATUS_COLUMN_NAME_HINTS = ["status"];

/**
 * Returns true when a column is a "status" column.
 * Matches columns whose type is "status" or whose label contains "status".
 */
export function isStatusColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  const labelLower = column.label.toLowerCase();
  return column.type === "status" || labelLower.includes("status");
}

// ── Volume Column Detection ──────────────────────────────────────────────────

/**
 * Hint keywords for detecting a "volume" column — the numeric count of items
 * associated with a job (image count, SKU count, quantity, etc.).
 */
export const VOLUME_COLUMN_NAME_HINTS = ["images", "sku", "quantity", "no. of", "count"];

/** Column types eligible to hold a volume value. */
export const VOLUME_COLUMN_TYPES = ["number", "currency"];

/**
 * Returns true when a column is a "volume" column — a numeric field that
 * tracks the number of items per job.
 */
export function isVolumeColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  const labelLower = column.label.toLowerCase();
  const hasVolumeHint = VOLUME_COLUMN_NAME_HINTS.some((hint) => labelLower.includes(hint));
  const isVolumeType = VOLUME_COLUMN_TYPES.includes(column.type);
  return hasVolumeHint && isVolumeType;
}

export const DEFAULT_VOLUME = 1;

// ── Job Type Column Detection ────────────────────────────────────────────────

/**
 * Hint keywords for detecting the column that says *what kind of work* a job is
 * — retouching, compositing, colour grading, delivery. This is the field the
 * Overview volume breakdown groups by, because an audit of the real boards found
 * it is the only populated multi-valued grouping available (no client column
 * exists, and board names are too coarse to be a breakdown).
 *
 * Mirrored by `_client_360_is_job_type_column()` in SQL — keep the two in sync.
 */
export const JOB_TYPE_COLUMN_NAME_HINTS = [
  "job type",
  "work type",
  "service type",
  "production type",
  "service",
  "category",
  "discipline",
  "department",
  "speciality",
  "specialty",
];

/** Column types eligible to hold a job-type value. */
export const JOB_TYPE_COLUMN_TYPES = [
  "dropdown",
  "status",
  "multi_select",
  "text",
  "long_text",
];

/**
 * Returns true when a column records the kind of work rather than a workflow
 * state. A "Status" column is explicitly disqualified even though it is a
 * dropdown: reading it as a job type would render the breakdown as
 * Not Started / Working / Done, which is a status list, not a mix of work.
 */
export function isJobTypeColumn(column: { label: string; type: string; settings?: Record<string, unknown> }): boolean {
  const labelLower = column.label.toLowerCase();
  if (labelLower.includes("status")) return false;
  if (!JOB_TYPE_COLUMN_TYPES.includes(column.type)) return false;
  return JOB_TYPE_COLUMN_NAME_HINTS.some((hint) => labelLower.includes(hint));
}
export const DEFAULT_PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_MS = 300;
