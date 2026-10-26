import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  isJobDateColumn,
  isDueDateColumn,
  isCompletedDateColumn,
  isStatusColumn,
  isClientColumn,
  JOB_DATE_COLUMN_NAME_HINTS,
} from "@/features/client-360/constants";
import { isCompletedStatus, UNSET_VALUES } from "./constants";

export interface NormalizedJob {
  id: string;
  recordId: string;
  boardId: string;
  boardName: string;
  workspaceId: string;
  organizationId: string;
  status: string | null;
  statusRaw: string | null;
  client: string | null;
  receivedAt: string | null; // ISO date string YYYY-MM-DD
  dueAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  title: string;
  assignedTo: string[];
  [key: string]: unknown;
}

export interface Scope {
  type: "workspace" | "global";
  workspaceId?: string;
}

interface BoardColumn {
  id: string;
  label: string;
  type: string;
  settings?: Record<string, unknown>;
}

function isUnsetValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (UNSET_VALUES.has(trimmed)) return true;
    if (trimmed === "") return true;
  }
  return false;
}

function cellToDisplayText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => cellToDisplayText(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const candidate = o.label ?? o.name ?? o.text ?? o.title ?? o.value;
    if (typeof candidate === "string") return candidate;
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

function resolveOptionLabel(
  column: BoardColumn,
  value: unknown,
): string | null {
  if (isUnsetValue(value)) return null;
  const options = column?.settings?.labels ?? column?.settings?.options;
  if (!Array.isArray(options)) return null;
  const valueStr = String(value);
  for (const opt of options) {
    if (opt && typeof opt === "object") {
      const optObj = opt as Record<string, unknown>;
      if (optObj.id === valueStr || optObj.value === valueStr) {
        const label = optObj.label ?? optObj.name;
        if (typeof label === "string") return label;
      }
    }
  }
  return null;
}

function tryParseDate(value: unknown): string | null {
  if (isUnsetValue(value)) return null;
  if (typeof value === "string") {
    // Accept YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // Try to parse
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    // Check for impossible dates like Feb 31
    const iso = date.toISOString().split("T")[0];
    // Simple validation
    const [y, m, d] = iso.split("-").map(Number);
    if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) {
      // Could be timezone issue, but better to be strict
    }
    return iso;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const dateVal = o.date ?? o.value ?? o.start;
    if (typeof dateVal === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
      const date = new Date(dateVal);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
    }
  }
  return null;
}

function countPopulatedValidDates(
  cellValues: Map<string, unknown>,
  recordIds: string[],
  columnId: string,
): number {
  let count = 0;
  for (const recordId of recordIds) {
    const key = `${recordId}:${columnId}`;
    const value = cellValues.get(key);
    const parsed = tryParseDate(value);
    if (parsed) count++;
  }
  return count;
}

function pickDateColumn(
  columns: BoardColumn[],
  cellValues: Map<string, unknown>,
  recordIds: string[],
  candidates: BoardColumn[],
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  let bestCol: BoardColumn | null = null;
  let bestScore = -1;

  for (const col of candidates) {
    const labelLower = col.label.toLowerCase();
    const populated = countPopulatedValidDates(cellValues, recordIds, col.id);
    const hint = JOB_DATE_COLUMN_NAME_HINTS.some((h) => labelLower.includes(h)) ? 10 : 0;
    // Also check for "received", "inward", etc.
    const score = populated * 100 + hint + (labelLower.includes("received") ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol?.id ?? candidates[0].id;
}

function extractPersonValue(value: unknown): string[] {
  if (isUnsetValue(value)) return [];
  const names: string[] = [];
  const processPersonEntry = (entry: unknown): string | null => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const name = obj.name ?? obj.label ?? obj.text ?? obj.displayName ?? obj.email;
      if (typeof name === "string") return name;
    }
    return null;
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      const name = processPersonEntry(item);
      if (name) names.push(name);
    }
  } else {
    const name = processPersonEntry(value);
    if (name) names.push(name);
  }
  return names;
}

export async function getJobsFromBoards(
  scope: Scope,
  supabase?: SupabaseClient,
): Promise<NormalizedJob[]> {
  const client = supabase ?? (await createServiceClient());

  // Get boards in scope
  let boardsQuery = client.from("boards").select("*").eq("status", "active");
  if (scope.type === "workspace" && scope.workspaceId) {
    boardsQuery = boardsQuery.eq("workspace_id", scope.workspaceId);
  }
  const { data: boardRows, error: boardError } = await boardsQuery;

  if (boardError || !boardRows) {
    return [];
  }

  const jobs: NormalizedJob[] = [];

  for (const board of boardRows) {
    const boardId = String(board.id);
    const workspaceId = String(board.workspace_id ?? "");
    const organizationId = String(board.organization_id ?? "");
    const boardName = String(board.name ?? "");

    // Fetch columns, records, cell values for this board
    const [columnsResult, recordsResult, cellValuesResult] = await Promise.all([
      client
        .from("columns")
        .select("*")
        .eq("board_id", boardId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      client
        .from("records")
        .select("*")
        .eq("board_id", boardId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      client.from("cell_values").select("*").eq("board_id", boardId),
    ]);

    const columns = columnsResult.data ?? [];
    const records = recordsResult.data ?? [];
    
    // Build cell values map
    const cellValues = new Map<string, unknown>();
    for (const row of cellValuesResult.data ?? []) {
      const recordId = String(row.record_id ?? "");
      const columnId = String(row.column_id ?? "");
      if (recordId && columnId) {
        cellValues.set(`${recordId}:${columnId}`, row.value);
      }
    }

    const recordIds = records.map((r) => String(r.id));

    // Pick date columns per board by populated valid-date count first, label hint second
    const jobDateCandidates = columns.filter((c) => isJobDateColumn(c));
    const dueDateCandidates = columns.filter((c) => isDueDateColumn(c));
    const completedDateCandidates = columns.filter((c) => isCompletedDateColumn(c));
    const statusCandidates = columns.filter((c) => isStatusColumn(c) || c.type === "status");
    const clientCandidates = columns.filter((c) => isClientColumn(c));

    const receivedColId = pickDateColumn(columns, cellValues, recordIds, jobDateCandidates);
    const dueColId = pickDateColumn(columns, cellValues, recordIds, dueDateCandidates);
    const completedColId = pickDateColumn(columns, cellValues, recordIds, completedDateCandidates);
    const statusCol = statusCandidates.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    const clientCol = clientCandidates.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];

    // Build a map of all columns for option resolution
    const colMap = new Map(columns.map((c) => [c.id, c]));

    for (const record of records) {
      const recordId = String(record.id);
      const title = String(record.title ?? record.name ?? "Untitled");

      // Extract status
      let status: string | null = null;
      let statusRaw: string | null = null;
      if (statusCol) {
        const key = `${recordId}:${statusCol.id}`;
        const value = cellValues.get(key);
        statusRaw = cellToDisplayText(value);
        // Resolve option ID to label first
        const optionLabel = resolveOptionLabel(statusCol, value);
        if (optionLabel) {
          status = optionLabel;
        } else if (!isUnsetValue(statusRaw)) {
          status = statusRaw;
        } else {
          status = null;
        }
      }

      // Extract client
      let client: string | null = null;
      if (clientCol) {
        const key = `${recordId}:${clientCol.id}`;
        const value = cellValues.get(key);
        const optionLabel = resolveOptionLabel(clientCol, value);
        if (optionLabel) {
          client = optionLabel;
        } else {
          const text = cellToDisplayText(value);
          if (!isUnsetValue(text)) client = text;
        }
      }

      // Extract dates
      const receivedAt = receivedColId
        ? tryParseDate(cellValues.get(`${recordId}:${receivedColId}`))
        : null;
      const dueAt = dueColId
        ? tryParseDate(cellValues.get(`${recordId}:${dueColId}`))
        : null;
      const completedAt = completedColId
        ? tryParseDate(cellValues.get(`${recordId}:${completedColId}`))
        : null;
      const deliveredAt = completedAt; // for compatibility

      jobs.push({
        id: recordId,
        recordId,
        boardId,
        boardName,
        workspaceId,
        organizationId,
        status,
        statusRaw,
        client,
        receivedAt,
        dueAt,
        deliveredAt,
        completedAt,
        title,
        assignedTo: [],
      });
    }
  }

  return jobs;
}

// Helper to get board IDs in scope for verification
export async function getBoardIdsInScope(scope: Scope, supabase?: SupabaseClient): Promise<string[]> {
  const client = supabase ?? (await createServiceClient());
  let boardsQuery = client.from("boards").select("id").eq("status", "active");
  if (scope.type === "workspace" && scope.workspaceId) {
    boardsQuery = boardsQuery.eq("workspace_id", scope.workspaceId);
  }
  const { data } = await boardsQuery;
  return (data ?? []).map((b) => String(b.id));
}

export async function getRowCountPerBoard(supabase?: SupabaseClient): Promise<Record<string, number>> {
  const client = supabase ?? (await createServiceClient());
  const { data } = await client
    .from("records")
    .select("board_id")
    .eq("status", "active");
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const bid = String(r.board_id);
    counts[bid] = (counts[bid] || 0) + 1;
  }
  return counts;
}
