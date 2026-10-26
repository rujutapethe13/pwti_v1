export const COMPLETED_STATUS_LABELS = ["Complete", "Completed", "Done"] as const;

const COMPLETED_STATUS_SET = new Set(
  COMPLETED_STATUS_LABELS.map((label) => label.toLowerCase().trim())
);

export function isCompletedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase().trim();
  return COMPLETED_STATUS_SET.has(normalized);
}

export const UNSET_VALUES = new Set(["", "null", "undefined"]);
