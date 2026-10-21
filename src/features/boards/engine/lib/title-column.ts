/**
 * Title column label helpers.
 *
 * The pinned first column of a board table is the record-title column. Its
 * header label is stored as its own field (`boards.title_column_label` and
 * `groups.title_column_label`) and is NEVER derived from `columns[0]`.
 *
 * Deriving it from the first data column is what made the header show the
 * wrong name: importing a sheet whose first column was not the title column
 * renamed the pinned header to that unrelated column's label, so the header
 * read "Batch Details (PFM1_No)" while the column actually held client names.
 */

/** Label used when a board/group has no explicit title column label yet. */
export const DEFAULT_TITLE_COLUMN_LABEL = "Client / Company Name";

/**
 * Normalize a label: trim it and treat blank strings as "not set".
 * Returns `null` when there is nothing meaningful to store.
 */
export function normalizeTitleColumnLabel(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the title column label from an ordered list of candidates.
 *
 * The first non-empty candidate wins. When every candidate is empty the
 * default label is returned — never another column's name.
 */
export function resolveTitleColumnLabel(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const normalized = normalizeTitleColumnLabel(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_TITLE_COLUMN_LABEL;
}

/**
 * The label to persist for an imported title column.
 *
 * `null` / `""` (the "None" option in the import wizard) falls back to the
 * default label rather than to some other column's name.
 */
export function titleColumnLabelFromFileHeader(
  header: string | null | undefined,
): string {
  return resolveTitleColumnLabel(header);
}

/**
 * Auto-numbered group title: "New Group", "New Group 2", "New Group 3"…
 *
 * Used as the default title of the "Add new group" popover so repeated adds
 * never collide with an existing group name.
 */
export function nextGroupTitle(
  existingNames: Array<string | null | undefined>,
  base = "New Group",
): string {
  const taken = new Set(
    existingNames
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
  if (!taken.has(base.trim().toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

/**
 * Whether an import should ask before replacing a group's existing title
 * label.
 *
 * The existing label is kept unless the user explicitly chose a different
 * title column in the import wizard.
 */
export function shouldPromptForTitleColumnRename(
  existingLabel: string | null | undefined,
  chosenLabel: string | null | undefined,
): boolean {
  const existing = normalizeTitleColumnLabel(existingLabel);
  const chosen = normalizeTitleColumnLabel(chosenLabel);
  if (!chosen) return false;
  if (!existing) return false;
  return existing.toLowerCase() !== chosen.toLowerCase();
}

/**
 * The title column label an import should persist.
 *
 * Returns `null` when nothing should change:
 *  - no title file column was chosen (the wizard's "None" option), or
 *  - the target already has a different label and the user declined the
 *    rename prompt.
 */
export function resolveImportTitleColumnLabel(params: {
  /** The file header the user chose as the title column, if any. */
  fileHeader: string | null | undefined;
  /** The label the target group/board already has. */
  existingLabel: string | null | undefined;
  /** Whether the user accepted the rename prompt. */
  renameAccepted: boolean;
}): string | null {
  const chosen = normalizeTitleColumnLabel(params.fileHeader);
  if (!chosen) return null;
  if (!shouldPromptForTitleColumnRename(params.existingLabel, chosen)) {
    return chosen;
  }
  return params.renameAccepted ? chosen : null;
}
