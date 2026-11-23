/**
 * Board column resolution for alert detection.
 *
 * Pure and side-effect free so it is unit tested directly
 * (src/tests/unit/email-alerts.test.ts). Detection calls this per board with
 * the board's columns and any Client 360 mappings that already exist.
 *
 * Resolution order per field:
 *   1. client_360_field_mappings — the Client 360 resolution (auto or manual).
 *   2. Exact normalized-label match, accepted only when exactly one column on
 *      that board matches. Missing or ambiguous labels resolve to nothing.
 *
 * A column is never claimed by two fields: each field takes a distinct column,
 * so a bare "Status" cannot be read as both job status and invoice status.
 */

export interface ColumnRow {
  id: string;
  board_id: string;
  label: string | null;
  settings: { options?: Array<{ id: string; label?: string }> } | null;
}

/**
 * Fields detection understands, with the normalized labels that identify them.
 * Labels are compared after lowercasing and whitespace collapsing, which is
 * what makes "Invoice\n Status" and "Invoice Status" the same label.
 */
export const FIELD_LABELS = {
  client: ["client", "client name", "client/company name", "client / company name", "company", "company name"],
  due_date: ["due date", "deadline"],
  job_status: ["status", "job status"],
  upload_date: ["upload date", "date of upload", "uploaded date", "date uploaded"],
  receive_date: ["receive date post production", "receive date", "receive date post-production"],
  invoice_amount: ["invoice amount", "amount"],
  invoice_status: ["invoice status"],
  assignee_owner: ["assigned to", "assignee", "assignee owner", "owner"],
} as const;

export type FieldType = keyof typeof FIELD_LABELS;

export const FIELD_TYPES = Object.keys(FIELD_LABELS) as FieldType[];

/** Board columns resolved for one board, keyed by field type. */
export type BoardColumns = Partial<Record<FieldType, ColumnRow>>;

export function normalizeLabel(label: string | null | undefined): string {
  return String(label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Resolve one board's columns. Mappings win; anything unmapped falls back to a
 * unique label match.
 *
 * `mapped` holds already-resolved column ids keyed by field type (only for the
 * fields present in FIELD_LABELS). `boardId` is used to scope `mapped` when it
 * is keyed by `boardId:fieldType` — callers pass either shape via
 * `mappedKeyPrefix`.
 */
export function resolveBoardColumns(
  columns: ColumnRow[],
  mapped: Map<string, string>,
  options?: { keyPrefix?: string; boardId?: string },
): BoardColumns {
  const prefix = options?.keyPrefix ? `${options.keyPrefix}:` : "";
  // Defensive: a column from another board must never be used for this board.
  const scoped = options?.boardId ? columns.filter((c) => c.board_id === options.boardId) : columns;
  const resolved: BoardColumns = {};
  const claimed = new Set<string>();

  for (const fieldType of FIELD_TYPES) {
    const mappedId = mapped.get(`${prefix}${fieldType}`) ?? mapped.get(fieldType);
    if (!mappedId) continue;
    const column = scoped.find((c) => c.id === mappedId);
    if (column && !claimed.has(column.id)) {
      resolved[fieldType] = column;
      claimed.add(column.id);
    }
  }

  for (const fieldType of FIELD_TYPES) {
    if (resolved[fieldType]) continue;
    const labels: readonly string[] = FIELD_LABELS[fieldType];
    const matches = scoped.filter(
      (c) => !claimed.has(c.id) && labels.includes(normalizeLabel(c.label)),
    );
    if (matches.length === 1) {
      resolved[fieldType] = matches[0];
      claimed.add(matches[0].id);
    }
  }

  return resolved;
}

/**
 * Option-id → label map for status columns. Board status cells store the option
 * id ("opt-done") in value and often leave value_text empty; the human label
 * ("Done") lives in the column settings.
 */
export function buildOptionLabelMap(
  rows: Array<{ settings: ColumnRow["settings"] }>,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const row of rows) {
    for (const option of row.settings?.options ?? []) {
      if (option.id && option.label) labels.set(option.id, option.label);
    }
  }
  return labels;
}