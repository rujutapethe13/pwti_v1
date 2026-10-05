import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { canManageWorkspace, isOwner, isBoardRestricted } from "@/lib/board-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient(await cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { id: boardId } = await params;

  const body = await request.json().catch(() => ({}));
  const isRestricted: boolean = body.is_restricted === true;

  const svc = await createServiceClient();

  try {
    // Fetch the board to get its workspace_id
    const { data: board, error: boardError } = await svc
      .from("boards")
      .select("workspace_id, is_restricted")
      .eq("id", boardId)
      .maybeSingle();

    if (boardError || !board) {
      return NextResponse.json(
        { success: false, error: "Board not found" },
        { status: 404 },
      );
    }

    const workspaceId = board.workspace_id;

    // Only workspace owner or admin can restrict/unrestrict a board
    const authorized = (await isOwner(user.id)) || (await canManageWorkspace(user.id, workspaceId));
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: "Only workspace owners and admins can modify board restrictions" },
        { status: 403 },
      );
    }

    // Update the board
    const { error: updateError } = await svc
      .from("boards")
      .update({ is_restricted: isRestricted })
      .eq("id", boardId);

    if (updateError) {
      throw updateError;
    }

    // Record the action in the audit trail
    await svc.from("board_restrictions").insert({
      board_id: boardId,
      is_restricted: isRestricted,
      restricted_by: user.id,
    });

    return NextResponse.json({
      success: true,
      is_restricted: isRestricted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[restrict] POST error for board ${boardId}:`, err);
    return NextResponse.json(
      { success: false, error: `Failed to ${isRestricted ? "restrict" : "unrestrict"} board`, details: message },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: boardId } = await params;
  const restricted = await isBoardRestricted(boardId);
  return NextResponse.json({ board_id: boardId, is_restricted: restricted });
}
