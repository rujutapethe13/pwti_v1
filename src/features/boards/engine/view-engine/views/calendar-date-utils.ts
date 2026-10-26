/**
 * Calendar date helpers
 *
 * A calendar must never drift a day because of a timezone. Every date
 * the calendar works with is therefore a LOCAL calendar date:
 * `2026-01-29` is the 29th of January, no matter which timezone the
 * browser runs in.
 *
 * These helpers are deliberately dependency-free so they can be unit
 * tested without pulling in the whole view.
 */

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `YYYY-MM-DD` key for a LOCAL date (never a UTC shift). */
export function toDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isValidLocalDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/**
 * Parse a cell value into a LOCAL calendar date.
 *
 * Handles ISO strings ("2026-01-29", with or without a time part),
 * `Date` objects, epoch numbers and DD/MM/YYYY strings. Anything that
 * cannot be understood returns `null` instead of throwing, so a single
 * malformed row can never break the whole grid.
 */
export function parseCalendarDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfLocalDay(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return startOfLocalDay(date);
  }

  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // ISO — 2026-01-29 / 2026-01-29T10:00:00 / 2026-01-29T10:00:00.000Z
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidLocalDate(year, month, day) ? new Date(year, month - 1, day) : null;
  }

  // DD/MM/YYYY (also accepts - and . separators)
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    return isValidLocalDate(year, month, day) ? new Date(year, month - 1, day) : null;
  }

  // Anything else ("Jan 29, 2026", "29 Jan 2026", …)
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return startOfLocalDay(parsed);

  return null;
}
