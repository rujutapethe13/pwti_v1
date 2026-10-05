import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";

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

    const { data: favs, error } = await svc
      .from("favorites")
      .select("item_type, item_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[favorites] GET error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch favorites", details: error.message },
        { status: 500 },
      );
    }

    if (!favs || favs.length === 0) {
      return NextResponse.json([]);
    }

    const boardIds = favs.filter((f) => f.item_type === "board").map((f) => f.item_id);
    const workspaceIds = favs.filter((f) => f.item_type === "workspace").map((f) => f.item_id);

    const boards: Array<{ id: string; name: string; workspace_id: string; slug: string }> = [];
    const workspaces: Array<{ id: string; name: string }> = [];

    if (boardIds.length > 0) {
      const { data: bd, error: be } = await svc
        .from("boards")
        .select("id, name, workspace_id, slug")
        .in("id", boardIds);
      if (be) {
        console.error("[favorites] boards lookup error:", be);
      } else if (bd) {
        boards.push(...bd);
      }
    }

    if (workspaceIds.length > 0) {
      const { data: wd, error: we } = await svc
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      if (we) {
        console.error("[favorites] workspaces lookup error:", we);
      } else if (wd) {
        workspaces.push(...wd);
      }
    }

    const boardMap = new Map(boards.map((b) => [b.id, b]));
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));

    const result = favs.map((f) => {
      if (f.item_type === "board") {
        const b = boardMap.get(f.item_id);
        const ws = b ? workspaceMap.get(b.workspace_id) : null;
        return {
          id: f.item_id,
          item_type: "board",
          name: b?.name ?? f.item_id,
          slug: b?.slug ?? null,
          workspace_id: b?.workspace_id ?? null,
          workspace_name: ws?.name ?? null,
          created_at: f.created_at,
        };
      }
      const ws = workspaceMap.get(f.item_id);
      return {
        id: f.item_id,
        item_type: "workspace",
        name: ws?.name ?? f.item_id,
        slug: null,
        workspace_id: f.item_id,
        workspace_name: ws?.name ?? null,
        created_at: f.created_at,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[favorites] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch favorites", details: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { item_type, item_id } = body;

    if (!item_type || !item_id || !["board", "workspace"].includes(item_type)) {
      return NextResponse.json(
        { success: false, error: "item_type and item_id are required", details: null },
        { status: 400 },
      );
    }

    const svc = await createServiceClient();

    const { data, error } = await svc.from("favorites").upsert(
      {
        user_id: user.id,
        item_type,
        item_id,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_type,item_id" },
    );

    if (error) {
      console.error("[favorites] POST error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to add favorite", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[favorites] POST error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to add favorite", details: message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
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
    const body = await request.json();
    const { item_type, item_id } = body;

    if (!item_type || !item_id || !["board", "workspace"].includes(item_type)) {
      return NextResponse.json(
        { success: false, error: "item_type and item_id are required", details: null },
        { status: 400 },
      );
    }

    const svc = await createServiceClient();

    const { error } = await svc
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("item_type", item_type)
      .eq("item_id", item_id);

    if (error) {
      console.error("[favorites] DELETE error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to remove favorite", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[favorites] DELETE error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to remove favorite", details: message },
      { status: 500 },
    );
  }
}
