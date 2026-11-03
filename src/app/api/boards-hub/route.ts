import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";

interface BoardRow {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
  is_restricted: boolean | null;
  workspace_id: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string | null;
}

interface MembershipRow {
  workspace_id: string;
  role: string | null;
  can_edit: boolean | null;
}

interface OverrideRow {
  board_id: string;
  access: string | null;
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

  try {
    const svc = await createServiceClient();

    // ── Every workspace in the app, regardless of membership ──────────────
    const { data: workspaces } = await svc
      .from("workspaces")
      .select("id, name, owner_id")
      .order("name");

    const workspaceById = new Map(
      (workspaces ?? []).map((w: WorkspaceRow) => [w.id, w]),
    );

    // ── The caller's workspace memberships (used for the access state) ────
    const { data: memberships } = await svc
      .from("workspace_members")
      .select("workspace_id, role, can_edit")
      .eq("user_id", user.id);

    const memberWorkspaces = new Set<string>();
    const adminWorkspaces = new Set<string>();
    for (const m of (memberships ?? []) as MembershipRow[]) {
      memberWorkspaces.add(m.workspace_id);
      if (
        m.role === "admin" ||
        m.role === "staff" ||
        m.can_edit === true
      ) {
        adminWorkspaces.add(m.workspace_id);
      }
    }

    // ── Every non-archived board in the app ───────────────────────────────
    const { data: allBoards } = await svc
      .from("boards")
      .select("id, name, slug, created_at, is_restricted, workspace_id")
      .neq("status", "archived")
      .order("created_at", { ascending: true });

    // ── Explicit board grants for this caller ─────────────────────────────
    const allBoardIds = (allBoards ?? []).map((b: BoardRow) => b.id);
    const grantedBoardIds = new Set<string>();
    if (allBoardIds.length > 0) {
      const { data: overrides } = await svc
        .from("board_access_overrides")
        .select("board_id, access")
        .in("board_id", allBoardIds)
        .eq("user_id", user.id);
      for (const o of (overrides ?? []) as OverrideRow[]) {
        if (o.access === "granted") grantedBoardIds.add(o.board_id);
      }
    }

    const result = (workspaces ?? []).map((ws: WorkspaceRow) => {
      const boards = (allBoards ?? [])
        .filter((b: BoardRow) => b.workspace_id === ws.id)
        .map((b: BoardRow) => {
          const restricted = !!b.is_restricted;
          const isWorkspaceOwner = ws.owner_id === user.id;
          const isWorkspaceAdmin =
            isWorkspaceOwner || adminWorkspaces.has(ws.id);
          const granted = grantedBoardIds.has(b.id);
          const allowed = !restricted || isWorkspaceAdmin || granted;

          let accessState: "Open" | "Member" | "Request access" | "Locked";
          if (!restricted) {
            accessState = "Open";
          } else if (allowed) {
            accessState = "Member";
          } else if (memberWorkspaces.has(ws.id)) {
            accessState = "Request access";
          } else {
            accessState = "Locked";
          }

          return {
            id: b.id,
            name: b.name,
            board_url: b.slug ?? "",
            created_at: b.created_at,
            created_by: null,
            is_restricted: restricted,
            allowed,
            is_admin: isWorkspaceAdmin,
            access_state: accessState,
          };
        });

      return {
        id: ws.id,
        name: ws.name,
        is_admin: ws.owner_id === user.id || adminWorkspaces.has(ws.id),
        boards,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[boards-hub] GET error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch boards hub data",
        details: message,
      },
      { status: 500 },
    );
  }
}
