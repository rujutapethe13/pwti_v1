/**
 * Dashboard — Column Role Mapping
 *
 * Every board names its columns differently ("Client" / "Company" / "Brand",
 * "Date of Upload" / "Completed" / "Delivered On"). The default dashboard is
 * built from *roles*, not column names: the user maps each role to a real
 * column once per board, and every template widget then resolves its data
 * through that mapping.
 *
 * Everything here is pure and derived from the live board schema, so nothing
 * is hardcoded to a specific board.
 */

import type { ColumnDefinition, ColumnValue } from "../../../types";

// ═══════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════

export type DashboardRoleKey =
  | "client"
  | "itemName"
  | "jobType"
  | "receivedDate"
  | "dueDate"
  | "completedDate"
  | "status"
  | "images"
  | "skuCount"
  | "owner"
  | "amount";

/**
 * Id of the board's built-in first column ("Name"). It is not a real
 * `columns` row — every value lives on the record title — so widgets resolve
 * it through `readRoleCell` rather than the cell map.
 */
export const RECORD_TITLE_COLUMN_ID = "__record_title";

export interface RoleDefinition {
  key: DashboardRoleKey;
  label: string;
  description: string;
  /** Header substrings that suggest this role, most specific first. */
  keywords: string[];
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: "client",
    label: "Client",
    description: "Who the job is for",
    keywords: ["client", "company", "customer", "brand", "account", "project"],
  },
  {
    key: "itemName",
    label: "Item / Batch name",
    description: "Name of the item or batch (the board's first column)",
    keywords: ["name", "item", "batch", "product", "style", "sku name"],
  },
  {
    key: "jobType",
    label: "Job type",
    description: "Category of work (e.g. Backpacks)",
    keywords: ["job type", "typeofjob", "work type", "category", "service", "product type"],
  },
  {
    key: "receivedDate",
    label: "Received date",
    description: "When the job came in",
    keywords: ["receive date", "received", "receipt", "inward", "in date", "job date", "arrival"],
  },
  {
    key: "dueDate",
    label: "Due date",
    description: "When the job is promised",
    keywords: ["due date", "deadline", "target date", "promised", "delivery date", "due"],
  },
  {
    key: "completedDate",
    label: "Completed date",
    description: "When the job finished",
    keywords: [
      "date of upload",
      "completed",
      "completion",
      "delivered",
      "delivery date",
      "finish",
      "closed",
      "upload date",
    ],
  },
  {
    key: "status",
    label: "Status",
    description: "Current state of the job",
    keywords: ["status", "stage", "state", "progress"],
  },
  {
    key: "images",
    label: "Images/Files count",
    description: "How many images or files the job holds",
    keywords: ["images", "image", "img", "no of files", "num files", "files", "photos", "quantity of images"],
  },
  {
    key: "skuCount",
    label: "SKU count",
    description: "How many SKUs / styles the job covers",
    keywords: ["sku", "skus", "styles", "style count", "product count", "no of skus"],
  },
  {
    key: "owner",
    label: "Owner/Artist",
    description: "Who is working on the job",
    keywords: ["owner", "artist", "retoucher", "designer", "assigned to", "assignee", "qc", "resource"],
  },
  {
    key: "amount",
    label: "Amount",
    description: "Invoice / billing value",
    keywords: ["amount", "invoice", "value", "price", "cost", "rate", "billing"],
  },
];

export const ROLE_KEYS: DashboardRoleKey[] = ROLE_DEFINITIONS.map((r) => r.key);

export type DashboardColumnRoles = Partial<Record<DashboardRoleKey, string>>;

/** Alias value → canonical client name. */
export type ClientAliasMap = Record<string, string>;

export const EMPTY_ROLE_MAPPING: DashboardColumnRoles = {};

/** The dashboard-wide measure switch: what "volume" means on every chart. */
export type DashboardMeasure = "jobs" | "images" | "skus";

export const MEASURE_LABELS: Record<DashboardMeasure, string> = {
  jobs: "Jobs",
  images: "Images",
  skus: "SKUs",
};

/** Role each measure sums over, or null when the measure is a row count. */
export const MEASURE_ROLE: Record<DashboardMeasure, DashboardRoleKey | null> = {
  jobs: null,
  images: "images",
  skus: "skuCount",
};

// ═══════════════════════════════════════════════════════════
// STATUS BUCKETS
// ═══════════════════════════════════════════════════════════

export type StatusBucket = "not_started" | "working_on_it" | "done" | "on_hold";

export const STATUS_BUCKETS: Array<{ value: StatusBucket; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "working_on_it", label: "Working on it" },
  { value: "done", label: "Done" },
  { value: "on_hold", label: "On hold" },
];

export const STATUS_BUCKET_LABELS: Record<StatusBucket, string> = {
  not_started: "Not started",
  working_on_it: "Working on it",
  done: "Done",
  on_hold: "On hold",
};

/**
 * Keyword → bucket. Order is significant: the first match wins, so the most
 * specific signals ("hold") are tested before the broad ones ("uploaded").
 */
const STATUS_KEYWORDS: Array<{ pattern: RegExp; bucket: StatusBucket }> = [
  { pattern: /\b(on\s*hold|hold|paused|blocked|waiting|stalled)\b/i, bucket: "on_hold" },
  {
    pattern:
      /\b(done|complete|completed|completed\s*on|delivered|delivery|upload|uploaded|closed|approved|accepted|billing|bill|finali[sz]ed)\b/i,
    bucket: "done",
  },
  {
    pattern: /\b(in\s*progress|progress|working|wip|processing|ongoing|active|started|running|production|qc|retouch)\b/i,
    bucket: "working_on_it",
  },
  {
    pattern: /\b(pending|not\s*started|new|to\s*do|todo|queued|waiting\s*for|awaiting|open|backlog)\b/i,
    bucket: "not_started",
  },
];

export function classifyStatusValue(value: unknown): StatusBucket {
  const text = String(value ?? "").trim();
  if (!text) return "not_started";
  for (const { pattern, bucket } of STATUS_KEYWORDS) {
    if (pattern.test(text)) return bucket;
  }
  return "not_started";
}

/** Raw status cell value (as stored) → bucket. */
export type StatusBucketMap = Record<string, StatusBucket>;

export function buildStatusBucketMap(
  distinctValues: Array<string | number>,
): StatusBucketMap {
  const map: StatusBucketMap = {};
  for (const raw of distinctValues) {
    const key = String(raw);
    map[key] = classifyStatusValue(raw);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════
// AUTO-SUGGESTION
// ═══════════════════════════════════════════════════════════

const DATE_TYPES = new Set(["date", "timeline"]);
const NUMERIC_TYPES = new Set(["number", "currency", "rating", "progress"]);

/** Roles whose column is meaningless unless it holds dates. */
const DATE_ROLES = new Set<DashboardRoleKey>(["receivedDate", "dueDate", "completedDate"]);

/** Roles whose column is meaningless unless it holds numbers. */
const NUMERIC_ROLES = new Set<DashboardRoleKey>(["images", "skuCount", "amount"]);

/** Roles that read free text / option values. */
const CATEGORY_ROLES = new Set<DashboardRoleKey>([
  "client",
  "itemName",
  "jobType",
  "owner",
  "status",
]);

/** Column types that can feed a text-compatible role. */
const TEXT_COMPATIBLE_TYPES = new Set([
  "text",
  "long_text",
  "dropdown",
  "status",
  "priority",
  "person",
  "formula",
  "url",
  "email",
  "multi_select",
  "tags",
]);

/**
 * True when `column` can meaningfully supply `role`. The Map-columns dialog
 * uses this to list only compatible columns per role, so a date role never
 * offers a text column and a numeric role never offers a dropdown.
 */
export function isColumnCompatibleWithRole(column: ColumnDefinition, role: DashboardRoleKey): boolean {
  if (DATE_ROLES.has(role)) return DATE_TYPES.has(column.type);
  if (NUMERIC_ROLES.has(role)) return NUMERIC_TYPES.has(column.type);
  return TEXT_COMPATIBLE_TYPES.has(column.type);
}

function normalizeHeader(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Score a column against a role. Higher is better; 0 means "no match".
 * Exact header match beats a keyword prefix, which beats a loose substring.
 */
function scoreColumnForRole(column: ColumnDefinition, role: RoleDefinition): number {
  const isDate = DATE_TYPES.has(column.type);
  const isNumeric = NUMERIC_TYPES.has(column.type);

  // A typed text column can never satisfy a date or numeric role.
  if (DATE_ROLES.has(role.key) && !isDate) return 0;
  if (NUMERIC_ROLES.has(role.key) && !isNumeric) return 0;
  if (CATEGORY_ROLES.has(role.key) && isDate) return 0;

  const header = normalizeHeader(column.label);
  if (!header) return 0;

  let best = 0;
  for (const keyword of role.keywords) {
    const needle = normalizeHeader(keyword);
    if (!needle) continue;
    if (header === needle) {
      best = Math.max(best, 100);
    } else if (header.startsWith(needle)) {
      best = Math.max(best, 70);
    } else if (header.includes(needle)) {
      best = Math.max(best, 45);
    }
  }
  if (best === 0) return 0;

  // Prefer the natural column type when several columns share a header.
  if (DATE_ROLES.has(role.key) && isDate) best += 12;
  if (NUMERIC_ROLES.has(role.key) && isNumeric) best += 12;
  if (role.key === "status" && (column.type === "status" || column.type === "dropdown" || column.type === "priority")) {
    best += 12;
  }

  return best;
}

/**
 * Suggest a full role → column mapping from header names alone.
 *
 * Each column is claimed by at most one role (highest score wins) so a single
 * "Date" column is never simultaneously the received *and* due date.
 *
 * The board's built-in first column ("Name") is special: it has no header to
 * match, so it is assigned by how repetitive its values are. Many repeats
 * (Levis, Safari, Wipro repeated on every row) means it is really the client;
 * otherwise it is offered as "Item / Batch name". It never steals the Client
 * role from a dedicated Client column.
 */
export function suggestRoleMapping(
  columns: ColumnDefinition[],
  options: { nameColumnId?: string; nameDistinctRatio?: number | null } = {},
): DashboardColumnRoles {
  const nameColumnId = options.nameColumnId ?? RECORD_TITLE_COLUMN_ID;
  const candidates: Array<{ role: DashboardRoleKey; columnId: string; score: number }> = [];
  for (const role of ROLE_DEFINITIONS) {
    for (const column of columns) {
      if (column.id === nameColumnId) continue;
      const score = scoreColumnForRole(column, role);
      if (score > 0) candidates.push({ role: role.key, columnId: column.id, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const roles: DashboardColumnRoles = {};
  const claimedColumns = new Set<string>();
  for (const candidate of candidates) {
    if (roles[candidate.role]) continue;
    if (claimedColumns.has(candidate.columnId)) continue;
    roles[candidate.role] = candidate.columnId;
    claimedColumns.add(candidate.columnId);
  }

  const nameColumn = columns.find((c) => c.id === nameColumnId);
  if (nameColumn) {
    const ratio = options.nameDistinctRatio;
    const looksLikeClient = typeof ratio === "number" && ratio <= NAME_IS_CLIENT_MAX_RATIO;
    const target: DashboardRoleKey | null = looksLikeClient && !roles.client ? "client" : "itemName";
    if (!roles[target]) roles[target] = nameColumnId;
  }

  return roles;
}

/**
 * Distinct/rows ratio at or below which the "Name" column is treated as the
 * client column rather than a per-row item name.
 */
export const NAME_IS_CLIENT_MAX_RATIO = 0.2;

// ═══════════════════════════════════════════════════════════
// VALUE PARSING
// ═══════════════════════════════════════════════════════════

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible calendar dates such as 31 Feb.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parse a stored date value. Day-first formats (`29-10-2025`) are read as
 * dd-mm-yyyy explicitly so day and month are never silently swapped.
 * Impossible or unparseable values return null — never throw.
 */
export function parseFlexibleDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(raw);
  if (isoDate) return utcDate(+isoDate[1], +isoDate[2], +isoDate[3]);

  const slashedYearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (slashedYearFirst) return utcDate(+slashedYearFirst[1], +slashedYearFirst[2], +slashedYearFirst[3]);

  // Day-first. Checked before the year-first form so "10-03-2026" is 10 March.
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(raw);
  if (dayFirst) {
    let year = +dayFirst[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return utcDate(year, +dayFirst[2], +dayFirst[1]);
  }

  const native = new Date(raw);
  if (Number.isNaN(native.getTime())) return null;

  // The native parser rolls impossible dates forward ("31 Feb" → 2 Mar). When
  // the text names a day-first day, hold it to that day rather than accepting
  // the rolled-over result.
  const leadingDay = /^(\d{1,2})\s*[A-Za-z]/.exec(raw);
  if (leadingDay) {
    const day = Number(leadingDay[1]);
    if (day >= 1 && day <= 31 && native.getDate() !== day) return null;
  }

  return native;
}

/**
 * Pull a number out of a loosely-typed cell.
 *   "104 img" → 104,  "41+15" → 56,  "1,200" → 1200,  "13" → 13.
 */
export function parseLooseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  // "41+15" and "41 + 15" are a total, not a range.
  if (/^[\d\s+.]+$/.test(raw) && raw.includes("+")) {
    const parts = raw.split("+").map((p) => p.trim()).filter(Boolean);
    const nums = parts.map(Number);
    if (parts.length > 1 && nums.every((n) => Number.isFinite(n))) {
      return nums.reduce((sum, n) => sum + n, 0);
    }
  }

  const firstNumber = /-?\d+(?:\.\d+)?/.exec(raw.replace(/,/g, ""));
  if (!firstNumber) return null;
  const parsed = Number(firstNumber[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Trim + collapse internal whitespace. */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

/**
 * Case-insensitive, whitespace-insensitive grouping key for a client name,
 * with optional alias collapsing (alias → canonical).
 *
 *   "LEVI'S", "Levis", "Levis "  →  "LEVI'S"
 *   alias { "WIPRO": "Wipro Ltd" } → "WIPRO LTD"
 */
export function clientGroupKey(value: unknown, aliases?: ClientAliasMap): string {
  const base = normalizeText(value).toUpperCase();
  if (!base) return "";
  if (!aliases) return base;

  let current = base;
  // Bounded walk so a cyclic alias map can never hang the render.
  for (let guard = 0; guard < 10; guard++) {
    const next = aliases[current];
    if (!next || next === current) break;
    current = next.trim().replace(/\s+/g, " ").toUpperCase();
    if (!current) return base;
  }
  return current;
}

/** Display label for a grouping key: alias target if present, else the key. */
export function clientGroupLabel(key: string, aliases?: ClientAliasMap): string {
  if (!key) return "";
  const target = aliases?.[key];
  return target ? normalizeText(target) : key;
}

// ═══════════════════════════════════════════════════════════
// RECORD RESOLUTION HELPERS
// ═══════════════════════════════════════════════════════════

export interface RoleRecord {
  id: string;
  title: string;
  groupId?: string | null;
}

export type RoleValueMap = Map<string, ColumnValue>;

export function readRoleCell(
  record: RoleRecord,
  columnId: string | undefined,
  cellValues: RoleValueMap,
): ColumnValue | undefined {
  if (!columnId) return undefined;
  // The built-in first column is not a real cell — its value is the record title.
  if (columnId === RECORD_TITLE_COLUMN_ID) return record.title ?? "";
  return cellValues.get(`${record.id}:${columnId}`);
}

/** True when the cell holds something usable (not null/""/whitespace). */
export function hasRoleValue(value: ColumnValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Bucket for a single record.
 *
 * With a mapped status column the stored status value decides the bucket
 * (via the user's bucket map). With no status column, a filled completed date
 * means Done — which is what boards like Photofactory, whose "Date of Upload"
 * is the done date, rely on.
 */
export function resolveRecordStatus(
  record: RoleRecord,
  roles: DashboardColumnRoles,
  cellValues: RoleValueMap,
  statusBuckets: StatusBucketMap | undefined,
): StatusBucket {
  if (roles.status) {
    const raw = readRoleCell(record, roles.status, cellValues);
    if (hasRoleValue(raw)) {
      const key = String(raw);
      const mapped = statusBuckets?.[key];
      if (mapped) return mapped;
      return classifyStatusValue(key);
    }
  }

  const completed = parseFlexibleDate(readRoleCell(record, roles.completedDate, cellValues));
  if (completed) return "done";

  const received = parseFlexibleDate(readRoleCell(record, roles.receivedDate, cellValues));
  if (received) return "working_on_it";

  return "not_started";
}

/** Overdue = due date in the past and the job is not Done. */
export function isRecordOverdue(
  record: RoleRecord,
  roles: DashboardColumnRoles,
  cellValues: RoleValueMap,
  statusBuckets: StatusBucketMap | undefined,
  now: Date = new Date(),
): boolean {
  const due = parseFlexibleDate(readRoleCell(record, roles.dueDate, cellValues));
  if (!due) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (due.getTime() >= todayUtc) return false;
  return resolveRecordStatus(record, roles, cellValues, statusBuckets) !== "done";
}

/**
 * Turnaround in whole days between two role columns (default: received →
 * completed). Returns null when either date is missing or inverted.
 */
export function recordTurnaroundDays(
  record: RoleRecord,
  roles: DashboardColumnRoles,
  cellValues: RoleValueMap,
  fromRole: DashboardRoleKey = "receivedDate",
  toRole: DashboardRoleKey = "completedDate",
): number | null {
  const from = parseFlexibleDate(readRoleCell(record, roles[fromRole], cellValues));
  const to = parseFlexibleDate(readRoleCell(record, roles[toRole], cellValues));
  if (!from || !to) return null;
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

/** Numeric measure for a role, or null when the cell can't yield a number. */
export function roleMeasureValue(
  record: RoleRecord,
  role: DashboardRoleKey | undefined,
  roles: DashboardColumnRoles,
  cellValues: RoleValueMap,
): number | null {
  if (!role) return null;
  return parseLooseNumber(readRoleCell(record, roles[role], cellValues));
}
