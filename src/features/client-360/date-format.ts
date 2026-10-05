export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  if (s.getTime() === e.getTime()) {
    return s.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startPart = s.toLocaleDateString(undefined, opts);
  const endPart = e.toLocaleDateString(undefined, opts);
  if (s.getFullYear() === e.getFullYear()) {
    return `${startPart} \u2013 ${endPart}, ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString(undefined, opts)} \u2013 ${e.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayISO(): string {
  const now = new Date();
  return formatDateISO(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function getWeekAgoISO(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - 7);
  return formatDateISO(d);
}

/**
 * Human-readable label for a snapshot period.
 *  - Single day equal to today → "Today, Sep 8 2026"
 *  - Single other day          → "Sep 8, 2026"
 *  - Multi-day range           → "Aug 21 – Aug 27, 2026" (delegates to formatDateRange)
 */
export function formatPeriodLabel(start: string, end: string): string {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  if (s.getTime() === e.getTime()) {
    const datePart = `${s.toLocaleDateString(undefined, { month: "short" })} ${s.getDate()} ${s.getFullYear()}`;
    return start === getTodayISO() ? `Today, ${datePart}` : datePart;
  }
  return formatDateRange(start, end);
}
