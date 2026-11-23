import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLiveJobScope } from "@/features/client-360/live-job-scope";

export interface BoardDateColumnOption {
  id: string;
  label: string;
  type: string;
}

export interface BoardDateMappingRow {
  board_id: string;
  board_name: string;
  workspace_name: string | null;
  columns: BoardDateColumnOption[];
  /** Currently resolved upload/completion column id (mapping or label). */
  upload_column_id: string | null;
  upload_column_label: string | null;
  upload_source: "mapping" | "label" | null;
  /** Currently resolved received/job column id (mapping or label). */
  receive_column_id: string | null;
  receive_column_label: string | null;
  receive_source: "mapping" | "label" | null;
}

/**
 * Read every active board with its column list and the upload/receive date
 * column that is currently resolved for it (explicit mapping first, then label
 * auto-detection). This is the data behind Settings > Date mappings.
 *
 * It reuses getLiveJobScope so the columns shown here are exactly the ones the
 * Overview cards actually read — the UI cannot drift from the dashboard.
 */
export async function fetchBoardDateMappings(
  organizationId: string,
  supabase: SupabaseClient,
): Promise<BoardDateMappingRow[]> {
  const scope = await getLiveJobScope(organizationId);

  // Which column each board currently resolves to, and whether it came from a
  // saved mapping or from label auto-detection.
  const uploadByBoard = new Map(
    scope.boardsWithUploadDate.map((b) => [b.board_id, b]),
  );
  const noUploadBoards = new Set(
    scope.boardsWithoutUploadDate.map((b) => b.board_id),
  );

  // Read the explicit saved mappings so we can tell mapping vs label apart and
  // pre-select the right option even when a label match is what is in effect.
  const { data: mappings } = await supabase
    .from("client_360_field_mappings")
    .select("board_id,field_type,resolved_column_ref")
    .eq("organization_id", organizationId);

  const savedUpload = new Map<string, string>();
  const savedReceive = new Map<string, string>();
  for (const m of mappings ?? []) {
    if (m.field_type === "upload_date" || m.field_type === "completed_date") {
      savedUpload.set(String(m.board_id), String(m.resolved_column_ref));
    } else if (
      m.field_type === "receive_date" ||
      m.field_type === "job_date"
    ) {
      savedReceive.set(String(m.board_id), String(m.resolved_column_ref));
    }
  }

  const { data: columns } = await supabase
    .from("columns")
    .select("id,board_id,label,type")
    .eq("organization_id", organizationId)
    .order("board_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const colsByBoard = new Map<string, BoardDateColumnOption[]>();
  for (const c of columns ?? []) {
    const bid = String(c.board_id);
    if (!colsByBoard.has(bid)) colsByBoard.set(bid, []);
    colsByBoard.get(bid)!.push({
      id: String(c.id),
      label: String(c.label ?? ""),
      type: String(c.type ?? ""),
    });
  }

  // The set of date-typed columns per board, used to pre-select the received
  // column when there is no explicit receive_date mapping.
  const workspaceNameById = new Map<string, string>();
  {
    const { data: boards } = await supabase
      .from("boards")
      .select("id,workspace_id")
      .eq("organization_id", organizationId);
    const wsIds = Array.from(
      new Set((boards ?? []).map((b) => b.workspace_id).filter(Boolean)),
    ) as string[];
    if (wsIds.length > 0) {
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id,name")
        .in("id", wsIds);
      for (const w of workspaces ?? []) {
        workspaceNameById.set(String(w.id), String(w.name ?? ""));
      }
    }
  }

  const rows: BoardDateMappingRow[] = [];
  for (const board of scope.boards) {
    const up = uploadByBoard.get(board.id);
    const noUpload = noUploadBoards.has(board.id);
    const savedUp = savedUpload.get(board.id) ?? null;
    const savedRecv = savedReceive.get(board.id) ?? null;
    const cols = colsByBoard.get(board.id) ?? [];

    const uploadColId = up
      ? savedUp ?? inferResolvedColumn(cols, up.column_label)
      : null;

    // Received column: explicit receive_date mapping, else the job_date mapping
    // already resolved by getLiveJobScope is reflected through the job rows, so
    // fall back to a label match here for display.
    const receiveColId = savedRecv ?? inferReceiveColumn(cols);

    rows.push({
      board_id: board.id,
      board_name: board.name,
      workspace_name: board.workspace_id
        ? workspaceNameById.get(String(board.workspace_id)) ?? null
        : null,
      columns: cols,
      upload_column_id: uploadColId,
      upload_column_label: up?.column_label ?? null,
      upload_source: noUpload ? null : up?.source ?? null,
      receive_column_id: receiveColId,
      receive_column_label:
        cols.find((c) => c.id === receiveColId)?.label ?? null,
      receive_source: savedRecv ? "mapping" : receiveColId ? "label" : null,
    });
  }

  rows.sort(
    (a, b) =>
      (a.workspace_name ?? "").localeCompare(b.workspace_name ?? "") ||
      a.board_name.localeCompare(b.board_name),
  );
  return rows;
}

function inferResolvedColumn(
  cols: BoardDateColumnOption[],
  label: string | null,
): string | null {
  if (!label) return null;
  const target = label.trim().toLowerCase();
  return cols.find((c) => c.label.trim().toLowerCase() === target)?.id ?? null;
}

function inferReceiveColumn(cols: BoardDateColumnOption[]): string | null {
  const patterns = [/receiv/i, /inward/i, /job date/i, /booked/i, /intake/i];
  const matches = cols.filter((c) =>
    patterns.some((re) => re.test(c.label ?? "")),
  );
  if (matches.length === 0) return null;
  return matches[0].id;
}