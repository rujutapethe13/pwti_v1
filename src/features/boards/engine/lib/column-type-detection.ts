import type { ColumnTypeKey, ColumnValue } from "../types";

export const IMPORTABLE_COLUMN_TYPES: ColumnTypeKey[] = [
  "text",
  "number",
  "date",
  "status",
  "priority",
  "dropdown",
  "checkbox",
  "person",
  "email",
  "phone",
  "url",
  "rating",
  "tags",
  "currency",
  "long_text",
  "progress",
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const DMY_DATE_RE = /^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})$/;
const MDY_DATE_RE = /^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})$/;
const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DOT_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

const MONTH_NAMES_RE =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}$/i;

const CURRENCY_RE = /^[-+]\s*[$€£¥₹]\s*[\d,.]+\s*([$€£¥₹]|%)?$|^[$€£¥₹₹₹₹₹\s]*[\d,.]+$|^[-+]?\s*[\d,.]+\s*([$€£¥%]+)$/;

function isLikelyDate(s: string): boolean {
  if (ISO_DATE_RE.test(s)) return true;

  const dmy = s.match(DMY_DATE_RE);
  if (dmy) {
    const month = Number(dmy[2]);
    return month >= 1 && month <= 12;
  }

  const mdy = s.match(MDY_DATE_RE);
  if (mdy) {
    const month = Number(mdy[2]);
    return month >= 1 && month <= 12;
  }

  if (MONTH_NAMES_RE.test(s)) return true;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const str = s.toLowerCase().trim();
    if (str.includes("gmt") || str.includes("t") || str.includes("z") || str.includes(" ")) {
      return true;
    }
  }

  return false;
}

function isLikelyNumber(s: string): boolean {
  const cleaned = s.replace(/[, $€£¥₹%\s]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return false;
  return !Number.isNaN(Number(cleaned));
}

function isLikelyBoolean(s: string): boolean {
  const lower = s.toLowerCase().trim();
  return lower === "true" || lower === "false" || lower === "yes" || lower === "no" || lower === "1" || lower === "0";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\+]?[0-9][\d\s\-\(\)]{6,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

export interface ColumnTypeDetectionResult {
  type: ColumnTypeKey;
  confidence: "high" | "medium" | "low";
}

const TYPE_PRIORITY = [
  "date",
  "number",
  "currency",
  "email",
  "url",
  "phone",
  "checkbox",
  "status",
  "tags",
  "rating",
  "text",
] as const;

function detectSingleType(
  values: Array<string | number | boolean | null>,
): { type: ColumnTypeKey; score: number } | null {
  const nonNull = values.filter((v): v is string | number | boolean => v !== null && v !== undefined && String(v).trim() !== "");
  if (nonNull.length === 0) return null;

  const stringValues = nonNull.map((v) => String(v).trim());
  const total = stringValues.length;

  const dateCount = stringValues.filter(isLikelyDate).length;
  if (dateCount > 0 && dateCount / total >= 0.8) {
    return { type: "date", score: dateCount / total };
  }

  const numCount = stringValues.filter((s) => isLikelyNumber(s) && !EMAIL_RE.test(s) && !URL_RE.test(s) && !PHONE_RE.test(s)).length;

  const allIntSmall =
    numCount === total &&
    stringValues.every((s) => {
      const n = Number(s.replace(/[, $€£¥₹]/g, ""));
      return Number.isInteger(n) && n >= 0 && n <= 5;
    });
  if (allIntSmall) {
    return { type: "rating", score: 0.85 };
  }

  if (numCount > 0 && numCount / total >= 0.8) {
    const hasCurrencyChars = stringValues.some((s) => /[$€£¥₹]/.test(s));
    if (hasCurrencyChars) {
      return { type: "currency", score: numCount / total };
    }
    return { type: "number", score: numCount / total };
  }

  const currencyCount = stringValues.filter((s) => CURRENCY_RE.test(s) && /[$€£¥₹]/.test(s)).length;
  if (currencyCount > 0 && currencyCount / total >= 0.8) {
    return { type: "currency", score: currencyCount / total };
  }

  const emailCount = stringValues.filter((s) => EMAIL_RE.test(s)).length;
  if (emailCount > 0 && emailCount / total >= 0.8) {
    return { type: "email", score: emailCount / total };
  }

  const urlCount = stringValues.filter((s) => URL_RE.test(s)).length;
  if (urlCount > 0 && urlCount / total >= 0.8) {
    return { type: "url", score: urlCount / total };
  }

  const phoneCount = stringValues.filter((s) => PHONE_RE.test(s) && !EMAIL_RE.test(s)).length;
  if (phoneCount > 0 && phoneCount / total >= 0.8) {
    return { type: "phone", score: phoneCount / total };
  }

  const boolCount = stringValues.filter(isLikelyBoolean).length;
  if (boolCount / total >= 0.8) {
    return { type: "checkbox", score: boolCount / total };
  }

  const uniqueValues = new Set(stringValues);
  const uniqueCount = uniqueValues.size;
  const uniqueRatio = uniqueCount / total;

  if (uniqueCount <= 10 && uniqueCount < total && total >= 2) {
    const valueLengths = stringValues.map((s) => s.length);
    const avgLength = valueLengths.reduce((a, b) => a + b, 0) / valueLengths.length;
    if (avgLength <= 30) {
      const confidenceScore = Math.max(0.75, 0.9 - uniqueRatio * 0.4);
      return { type: "status", score: confidenceScore };
    }
  }

  const tagCount = stringValues.filter((s) => /[;,|]/.test(s)).length;
  if (tagCount > 0 && tagCount / total >= 0.5) {
    return { type: "tags", score: 0.7 };
  }

  const ratingValues = new Set(["1", "2", "3", "4", "5", "★", "★★", "★★★", "★★★★", "★★★★★"]);
  const ratingCount = stringValues.filter((s) => ratingValues.has(s)).length;
  if (ratingCount > 0 && ratingCount / total >= 0.8) {
    return { type: "rating", score: 0.8 };
  }

  return { type: "text", score: 0.5 };
}

export function detectColumnType(values: ColumnValue[]): ColumnTypeDetectionResult {
  const typedValues = values
    .map((v) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v;
      if (typeof v === "string") return v.trim();
      if (Array.isArray(v)) return v;
      if (typeof v === "object") return String(v);
      return String(v);
    })
    .filter((v) => v !== null);

  const stringValues: Array<string | number | boolean> = typedValues.filter(
    (v): v is string | number | boolean => !Array.isArray(v),
  ) as Array<string | number | boolean>;

  if (stringValues.length === 0) {
    return { type: "text", confidence: "low" };
  }

  const firstNonArray = stringValues[0];
  if (Array.isArray(firstNonArray)) {
    return { type: "tags", confidence: "medium" };
  }

  const result = detectSingleType(stringValues);
  if (!result) {
    return { type: "text", confidence: "low" };
  }

  const confidence: "high" | "medium" | "low" =
    result.score >= 0.9 ? "high" : result.score >= 0.7 ? "medium" : "low";

  return { type: result.type, confidence };
}

const MONTH_FORMAT = new Intl.DateTimeFormat("default", { month: "short" });

export function formatDateValue(value: ColumnValue): string | null {
  if (value === null || value === undefined || value === "") return null;

  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + value * 86400000;
    date = new Date(ms);
  } else if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) {
      date = new Date(value);
    } else {
      const dmy = value.match(DMY_DATE_RE);
      if (dmy) {
        const day = Number(dmy[1]);
        const month = Number(dmy[2]);
        let year = Number(dmy[3]);
        if (year < 100) year += year < 70 ? 2000 : 1900;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          date = new Date(Date.UTC(year, month - 1, day));
        }
      } else {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) date = parsed;
      }
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null;

  const monthName = MONTH_FORMAT.format(date);
  const day = date.getDate();
  return `${monthName} ${day}`;
}

export function formatNumberValue(value: ColumnValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  const cleaned = String(value).replace(/[, $€£¥₹]/g, "");
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatCurrencyValue(value: ColumnValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
  const cleaned = String(value).replace(/[,]/g, "").replace(/[$€£¥₹]/g, "");
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

export function formatCheckboxValue(value: ColumnValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "✓" : "✗";
  const lower = String(value).toLowerCase().trim();
  if (lower === "true" || lower === "yes" || lower === "1" || lower === "y") return "✓";
  if (lower === "false" || lower === "no" || lower === "0" || lower === "n") return "✗";
  return null;
}

export function formatTagsValue(value: ColumnValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(", ");
  }
  const str = String(value);
  if (/[;,|]/.test(str)) {
    return str
      .split(/[;,|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
  }
  return str;
}

export function formatRatingValue(value: ColumnValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && !Number.isNaN(value)) {
    return "★".repeat(Math.min(5, Math.max(0, Math.round(value)))) + "○".repeat(5 - Math.min(5, Math.max(0, Math.round(value))));
  }
  const num = Number(String(value).replace(/[, $€£¥₹]/g, ""));
  if (Number.isNaN(num)) return null;
  const rounded = Math.min(5, Math.max(0, Math.round(num)));
  return "★".repeat(rounded) + "○".repeat(5 - rounded);
}

export function formatCellByColumnType(value: ColumnValue, type: ColumnTypeKey): string | null {
  if (value === null || value === undefined || value === "") return "—";

  switch (type) {
    case "date":
    case "timeline":
      return formatDateValue(value) ?? "—";
    case "number":
      return formatNumberValue(value) ?? "—";
    case "currency":
      return formatCurrencyValue(value) ?? "—";
    case "checkbox":
      return formatCheckboxValue(value) ?? "—";
    case "tags":
    case "multi_select":
      return formatTagsValue(value) ?? "—";
    case "rating":
      return formatRatingValue(value) ?? "—";
    case "status":
    case "priority":
    case "dropdown":
    case "person":
    case "text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

export interface DetectedColumnSchema {
  header: string;
  type: ColumnTypeKey;
  confidence: "high" | "medium" | "low";
}

export function detectAllColumnTypes(
  rows: Array<Record<string, ColumnValue>>,
  headers: string[],
): DetectedColumnSchema[] {
  return headers.map((header) => {
    const columnValues = rows.map((row) => row[header]);
    const detection = detectColumnType(columnValues);
    return { header, type: detection.type, confidence: detection.confidence };
  });
}

export function confidenceLabel(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "Auto-detected";
    case "medium":
      return "Likely";
    case "low":
      return "Default";
  }
}

export const COLUMN_TYPE_LABELS: Record<ColumnTypeKey, string> = {
  text: "Text",
  long_text: "Long Text",
  number: "Numbers",
  currency: "Currency",
  date: "Date",
  timeline: "Timeline",
  status: "Status",
  priority: "Priority",
  dropdown: "Dropdown",
  multi_select: "Multi Select",
  checkbox: "Checkbox",
  person: "Person",
  email: "Email",
  phone: "Phone",
  url: "URL",
  formula: "Formula",
  files: "Files",
  rating: "Rating",
  tags: "Tags",
  connected_board: "Connected Board",
  mirror: "Mirror",
  lookup: "Lookup",
  rollup: "Rollup",
  ai_field: "AI Field",
  button: "Button",
  progress: "Progress",
  time_tracking: "Time Tracking",
};
