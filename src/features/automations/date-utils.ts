const PLACEHOLDER_VALUES = new Set([
  "dd-mm-yyyy",
  "mm-dd-yyyy",
  "yyyy-mm-dd",
  "dd/mm/yyyy",
  "mm/dd/yyyy",
  "yyyy/mm/dd",
]);

export function isEmptyDateValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return true;
    if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return true;
    return false;
  }
  return false;
}

export function isValidDateString(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return false;
    if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return false;
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (year <= 0 || year === 1 || year === 1970) return false;
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return false;
      if (isNaN(d.getTime())) return false;
      return true;
    }
    const dmMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmMatch) {
      const day = Number(dmMatch[1]);
      const month = Number(dmMatch[2]);
      const year = Number(dmMatch[3]);
      if (year <= 0 || year === 1 || year === 1970) return false;
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return false;
      if (isNaN(d.getTime())) return false;
      return true;
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return false;
    const year = d.getFullYear();
    if (year <= 0 || year === 1 || year === 1970) return false;
    return true;
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return false;
    const year = value.getFullYear();
    if (year <= 0 || year === 1 || year === 1970) return false;
    return true;
  }
  if (typeof value === "number") {
    if (isNaN(value)) return false;
    return true;
  }
  return false;
}

export function normalizeDateToYmd(value: unknown): string | null {
  if (!isValidDateString(value)) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const dmMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmMatch) {
      const day = String(dmMatch[1]).padStart(2, "0");
      const month = String(dmMatch[2]).padStart(2, "0");
      const year = dmMatch[3];
      return `${year}-${month}-${day}`;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  } else if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}
