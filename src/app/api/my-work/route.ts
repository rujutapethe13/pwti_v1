import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/board-access";

interface CellValueMatch {
  record_id: string;
  column_id: string;
  board_id: string;
  value_text: string;
  match_type: "person" | "text" | "mention";
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient(await cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Authentication required", details: null },
      { status: 401 },
    );
  }

  const userEmail = user.email ?? "";
  const userId = user.id;

  // Build the set of identifiers we'll try to match against person cell values.
  // Person cells may store: the user's UUID, their email, or their display name.
  const userMeta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const userDisplayName = userMeta.full_name || userMeta.name || userEmail.split("@")[0] || "";

  const matchTokens = new Set<string>();
  matchTokens.add(userId);
  if (userEmail) matchTokens.add(userEmail);
  if (userDisplayName) matchTokens.add(userDisplayName);

  try {
    const svc = await createServiceClient();

    let workspaceIds: string[];

    if (isOwnerEmail(userEmail)) {
      // Owner sees all workspaces
      const { data: allWs, error: wsErr } = await svc
        .from("workspaces")
        .select("id")
        .order("name");

      if (wsErr) {
        console.error("[my-work] workspaces error:", wsErr);
        return NextResponse.json(
          { success: false, error: "Failed to fetch workspaces", details: wsErr.message },
          { status: 500 },
        );
      }
      workspaceIds = (allWs ?? []).map((ws) => ws.id);
    } else {
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId);

      if (!memberships || memberships.length === 0) {
        return NextResponse.json([]);
      }
      workspaceIds = memberships.map((m) => m.workspace_id);
    }

    if (workspaceIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get all boards in the user's workspaces (archived boards
    // are soft-deleted and must not appear here)
    const { data: boards, error: boardsErr } = await svc
      .from("boards")
      .select("id, name, slug, workspace_id, updated_at")
      .in("workspace_id", workspaceIds)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });

    if (boardsErr || !boards || boards.length === 0) {
      if (boardsErr) console.error("[my-work] boards error:", boardsErr);
      return NextResponse.json([]);
    }

    const boardIds = boards.map((b) => b.id);
    const boardMap = new Map(boards.map((b) => [b.id, b]));

    // Get workspace names
    const wsIds = Array.from(new Set(boards.map((b) => b.workspace_id)));
    const { data: wsData } = await svc.from("workspaces").select("id, name").in("id", wsIds);
    const wsNameMap = new Map((wsData ?? []).map((ws) => [ws.id, ws.name]));

    // Get all columns for these boards, filtered to person + text + long_text types
    const { data: columns, error: colErr } = await svc
      .from("columns")
      .select("id, board_id, key, label, type")
      .in("board_id", boardIds)
      .in("type", ["person", "text", "long_text"]);

    if (colErr) {
      console.error("[my-work] columns error:", colErr);
      return NextResponse.json([]);
    }

    if (!columns || columns.length === 0) {
      return NextResponse.json([]);
    }

    const personCols = columns.filter((c) => c.type === "person");
    const textCols = columns.filter((c) => c.type === "text" || c.type === "long_text");

    // Query cell_values for person columns where value_text matches any token
    const personColIds = personCols.map((c) => c.id);
    const orConditions = Array.from(matchTokens)
      .map((token) => `value_text.eq.${token}`)
      .join(",");

    const { data: personMatches, error: personErr } = await svc
      .from("cell_values")
      .select("record_id, column_id, board_id, value, value_text")
      .in("column_id", personColIds)
      .or(orConditions);

    if (personErr) {
      console.error("[my-work] person cell_values error:", personErr);
    }

    // Query cell_values for text/long_text columns containing @mentions of the user
    const textColIds = textCols.map((c) => c.id);
    let textMatches: CellValueMatch[] = [];

    if (textColIds.length > 0) {
      const mentionPatterns: string[] = [];
      if (userEmail) mentionPatterns.push(`value_text.like.*@${userEmail}*`);
      if (userId) mentionPatterns.push(`value_text.like.*@${userId}*`);

      if (mentionPatterns.length > 0) {
        const { data: tm, error: tmErr } = await svc
          .from("cell_values")
          .select("record_id, column_id, board_id, value, value_text")
          .in("column_id", textColIds)
          .or(mentionPatterns.join(","));

        if (tmErr) {
          console.error("[my-work] text cell_values error:", tmErr);
        } else if (tm) {
          textMatches = tm.map((m) => ({
            record_id: m.record_id,
            column_id: m.column_id,
            board_id: m.board_id,
            value_text: m.value_text ?? "",
            match_type: "text" as const,
          }));
        }
      }
    }

    const allMatches: CellValueMatch[] = [
      ...(personMatches ?? []).map((m) => ({
        record_id: m.record_id,
        column_id: m.column_id,
        board_id: m.board_id,
        value_text: m.value_text ?? "",
        match_type: "person" as const,
      })),
      ...textMatches,
    ];

    // Merge all matches, deduplicating by record_id
    const recordMap = new Map<string, {
      record_id: string;
      board_id: string;
      column_matches: Array<{
        column_id: string;
        column_type: string;
        column_label: string;
        value_text: string;
        match_type: string;
      }>;
    }>();

    for (const m of allMatches) {
      const col = columns.find((c) => c.id === m.column_id);
      if (!col) continue;

      const recId = m.record_id;
      const boardId = m.board_id;
      if (!recordMap.has(recId)) {
        recordMap.set(recId, {
          record_id: recId,
          board_id: boardId,
          column_matches: [],
        });
      }
      const entry = recordMap.get(recId)!;
      const alreadyMatched = entry.column_matches.some((cm) => cm.column_id === m.column_id);
      if (!alreadyMatched) {
        entry.column_matches.push({
          column_id: m.column_id,
          column_type: col.type,
          column_label: col.label ?? col.key,
          value_text: m.value_text,
          match_type: m.match_type,
        });
      }
    }

    if (recordMap.size === 0) {
      return NextResponse.json([]);
    }

    // Fetch record titles
    const recordIds = Array.from(recordMap.keys());
    const { data: records, error: recErr } = await svc
      .from("records")
      .select("id, title, updated_at")
      .in("id", recordIds);

    if (recErr) {
      console.error("[my-work] records error:", recErr);
    }
    const recordTitleMap = new Map((records ?? []).map((r) => [r.id, r.title]));

    // Build grouped result by workspace > board > record
    const result: Array<{
      workspace_id: string;
      workspace_name: string;
      boards: Array<{
        board_id: string;
        board_name: string;
        board_slug: string | null;
        updated_at: string;
        records: Array<{
          record_id: string;
          title: string;
          column_matches: Array<{
            column_id: string;
            column_type: string;
            column_label: string;
            value_text: string;
            match_type: string;
          }>;
        }>;
      }>;
    }> = [];

    interface BoardGroup {
      board_id: string;
      board_name: string;
      board_slug: string | null;
      updated_at: string;
      records: Array<{
        record_id: string;
        title: string;
        column_matches: Array<{
          column_id: string;
          column_type: string;
          column_label: string;
          value_text: string;
          match_type: string;
        }>;
      }>;
    }

    interface WsGroup {
      workspace_id: string;
      workspace_name: string;
      boards: Map<string, BoardGroup>;
    }

    const wsGroupMap = new Map<string, WsGroup>();

    function getWsGroup(wsId: string): WsGroup {
      if (!wsGroupMap.has(wsId)) {
        wsGroupMap.set(wsId, {
          workspace_id: wsId,
          workspace_name: wsNameMap.get(wsId) ?? wsId,
          boards: new Map(),
        });
      }
      return wsGroupMap.get(wsId)!;
    }

    function getBoardGroup(wsGroup: WsGroup, boardId: string): BoardGroup {
      if (!wsGroup.boards.has(boardId)) {
        const b = boardMap.get(boardId);
        wsGroup.boards.set(boardId, {
          board_id: boardId,
          board_name: b?.name ?? boardId,
          board_slug: b?.slug ?? null,
          updated_at: b?.updated_at ?? "",
          records: [],
        });
      }
      return wsGroup.boards.get(boardId)!;
    }

    for (const [recId, entry] of recordMap.entries()) {
      const board = boardMap.get(entry.board_id);
      const wsId = board?.workspace_id ?? "";
      const wsGroup = getWsGroup(wsId);
      const boardGroup = getBoardGroup(wsGroup, entry.board_id);
      boardGroup.records.push({
        record_id: entry.record_id,
        title: recordTitleMap.get(entry.record_id) ?? entry.record_id,
        column_matches: entry.column_matches,
      });
    }

    for (const [, wsGroup] of wsGroupMap.entries()) {
      const boardsArr: BoardGroup[] = [];
      for (const [, boardGroup] of wsGroup.boards.entries()) {
        if (boardGroup.records.length > 0) {
          boardsArr.push(boardGroup);
        }
      }
      if (boardsArr.length > 0) {
        result.push({
          workspace_id: wsGroup.workspace_id,
          workspace_name: wsGroup.workspace_name,
          boards: boardsArr,
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[my-work] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch my-work data", details: message },
      { status: 500 },
    );
  }
}
