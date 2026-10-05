import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isOwnerEmail, canManageWorkspace } from "@/lib/board-access";

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
  const ownerView = isOwnerEmail(userEmail);

  try {
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id, role_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json([]);
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    const svc = await createServiceClient();

    // Pre-compute admin status per workspace (owner has it everywhere)
    const adminWorkspaces = new Set<string>();
    if (ownerView) {
      for (const wsId of workspaceIds) adminWorkspaces.add(wsId);
    } else {
      for (const wsId of workspaceIds) {
        if (await canManageWorkspace(user.id, wsId)) {
          adminWorkspaces.add(wsId);
        }
      }
    }

    const { data: workspaces } = await svc
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds)
      .order("name");

    if (!workspaces) {
      return NextResponse.json([]);
    }

    const allBoardIds: string[] = [];
    const workspaceWithBoards: Array<{
      id: string;
      name: string;
      boards: Array<{
        id: string;
        name: string;
        slug: string;
        created_at: string;
        is_restricted: boolean;
      }>;
    }> = [];

    for (const ws of workspaces) {
      const { data: boards } = await svc
        .from("boards")
        .select("id, name, slug, created_at, is_restricted")
        .eq("workspace_id", ws.id)
        .order("created_at", { ascending: true });

      if (boards && boards.length > 0) {
        allBoardIds.push(...boards.map((b) => b.id));
        workspaceWithBoards.push({ id: ws.id, name: ws.name, boards });
      }
    }

    // Fetch access overrides for this user across all relevant boards
    let overrides: Array<{ board_id: string; access: string }> = [];
    let requests: Array<{ board_id: string; status: string }> = [];

    if (allBoardIds.length > 0) {
      const { data: ov } = await svc
        .from("board_access_overrides")
        .select("board_id, access")
        .in("board_id", allBoardIds)
        .eq("user_id", user.id);

      overrides = ov ?? [];

      const { data: req } = await svc
        .from("board_access_requests")
        .select("board_id, status")
        .in("board_id", allBoardIds)
        .eq("user_id", user.id);

      requests = req ?? [];
    }

    const grantedBoardIds = new Set(
      overrides.filter((o) => o.access === "granted").map((o) => o.board_id),
    );
    const requestedBoardIds = new Set(
      requests
        .filter((r) => r.status === "pending" || r.status === "approved")
        .map((r) => r.board_id),
    );

    const result = workspaces.map((ws) => {
      const boards = workspaceWithBoards
        .find((w) => w.id === ws.id)
        ?.boards ?? [];

      const isWorkspaceAdmin = adminWorkspaces.has(ws.id);

      return {
        id: ws.id,
        name: ws.name,
        is_admin: isWorkspaceAdmin,
        boards: boards.map((b) => {
          const restricted = b.is_restricted ?? false;
          const isOwner = ownerView || isWorkspaceAdmin;

          // Owner/admins always have access — no lock, no request flow
          const allowed = isOwner || !restricted || grantedBoardIds.has(b.id);
          const requested = requestedBoardIds.has(b.id);

          return {
            id: b.id,
            name: b.name,
            board_url: b.slug ?? "",
            created_at: b.created_at,
            created_by: null,
            is_restricted: restricted,
            allowed,
            requested,
            is_admin: isOwner,
          };
        }),
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
