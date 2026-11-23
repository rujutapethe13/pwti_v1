/**
 * Per-record alert evaluation.
 *
 * Pure and side-effect free so the business rules are unit tested directly
 * (src/tests/unit/email-alerts.test.ts). Detection handles all I/O and calls
 * this once per live record.
 *
 * Rules implemented here:
 *   - Client attribution: exact, normalized match against canonical names and
 *     aliases. Ambiguous names (claimed by two clients) and unknown names are
 *     never attributed — a wrong match would email the wrong people.
 *   - Deadline alert: deadline has strictly passed and the job is not done.
 *   - Invoice alert: the client has a term, the invoice is not cleared, and
 *     today is strictly past (counted-from date + term).
 */

import { invoiceOverdueDays, normalizeClientName, overdueJobDays, parseAmount, parseCellDate } from "./predicate";
import type { BoardColumns, ColumnRow } from "./columns";
import type { AlertCandidate } from "./types";

export interface EvaluateRecordInput {
  record: { id: string; board_id: string; title: string };
  board: { id: string; name: string; slug: string | null; workspace_id: string };
  organizationId: string;
  resolved: BoardColumns;
  /** Cell values for this record, already filtered to resolved columns. */
  cells: Array<{ column_id: string; value: unknown; value_text: string | null }>;
  /** normalized client name → client id; ambiguous names are absent. */
  clientIdByName: Map<string, string>;
  clientName: Map<string, string>;
  clientTerm: Map<string, number | null>;
  /** Option-id → label, for status cells stored as option ids. */
  optionLabels: Map<string, string>;
  today: string;
}

export interface EvaluateRecordResult {
  candidates: AlertCandidate[];
  /** The record's client cell matched a client or alias. */
  matched: boolean;
  /** The record had a client value but it matched nothing. */
  unmatched: boolean;
}

function cellText(
  cell: { value: unknown; value_text: string | null },
  optionLabels: Map<string, string>,
): string {
  const text = cell.value_text && cell.value_text.trim() ? cell.value_text.trim() : "";
  if (text) return optionLabels.get(text) ?? text;
  const raw = cell.value == null ? "" : String(cell.value).trim();
  return optionLabels.get(raw) ?? raw;
}

/** Split a person cell into individual user references (user ids or emails). */
export function splitAssigneeRefs(value: unknown): string[] {
  if (value == null) return [];
  const parts = Array.isArray(value) ? value : String(value).split(",");
  return parts
    .map((p) => String(p).trim())
    .filter((p) => p.length > 0 && p.toLowerCase() !== "null" && p.toLowerCase() !== "undefined");
}

export function evaluateRecord(input: EvaluateRecordInput): EvaluateRecordResult {
  const { record, board, resolved, cells, clientIdByName, clientName, clientTerm, optionLabels, today } = input;
  const none: EvaluateRecordResult = { candidates: [], matched: false, unmatched: false };

  const clientColumn: ColumnRow | undefined = resolved.client;
  if (!clientColumn) return none;

  const valueFor = (column: ColumnRow | undefined) =>
    column ? cells.find((cell) => cell.column_id === column.id) : undefined;

  // ── Client attribution: exact match only ──────────────────────────────────
  const clientCell = valueFor(clientColumn);
  const clientText = clientCell ? cellText(clientCell, optionLabels) : "";
  if (!clientText) return none;

  const clientId = clientIdByName.get(normalizeClientName(clientText));
  if (!clientId) return { candidates: [], matched: false, unmatched: true };

  const base = {
    recordId: record.id,
    boardId: board.id,
    boardName: board.name,
    boardSlug: board.slug,
    workspaceId: board.workspace_id,
    organizationId: input.organizationId,
    clientId,
    clientName: clientName.get(clientId) ?? "Unknown client",
    jobTitle: record.title ?? "",
    assigneeRefs: splitAssigneeRefs(valueFor(resolved.assignee_owner)?.value),
  };

  const candidates: AlertCandidate[] = [];

  // ── Deadline alert ────────────────────────────────────────────────────────
  const dueCell = valueFor(resolved.due_date);
  const dueDate = dueCell ? parseCellDate(dueCell.value, dueCell.value_text) : null;
  if (dueDate) {
    const statusCell = valueFor(resolved.job_status);
    const status = statusCell ? cellText(statusCell, optionLabels) : null;
    const days = overdueJobDays(dueDate, status, null, today);
    if (days != null) {
      candidates.push({ ...base, alertType: "job_overdue", dueDate, daysOverdue: days, invoiceAmount: null });
    }
  }

  // ── Invoice alert ─────────────────────────────────────────────────────────
  const term = clientTerm.get(clientId);
  if (term != null) {
    const statusCell = valueFor(resolved.invoice_status);
    const status = statusCell ? cellText(statusCell, optionLabels) : null;
    const uploadCell = valueFor(resolved.upload_date);
    const receiveCell = valueFor(resolved.receive_date);
    const countedFrom =
      (uploadCell ? parseCellDate(uploadCell.value, uploadCell.value_text) : null) ??
      (receiveCell ? parseCellDate(receiveCell.value, receiveCell.value_text) : null);
    const amountCell = valueFor(resolved.invoice_amount);
    const days = invoiceOverdueDays(countedFrom, term, status, today);
    if (days != null) {
      candidates.push({
        ...base,
        alertType: "invoice_uncleared",
        dueDate: countedFrom ?? "",
        daysOverdue: days,
        invoiceAmount: amountCell ? parseAmount(amountCell.value_text || amountCell.value) : null,
      });
    }
  }

  return { candidates, matched: true, unmatched: false };
}