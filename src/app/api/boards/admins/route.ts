import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isOwner, canManageWorkspace } from "@/lib/board-access";

/**
 * Manage board admins for a workspace.
 *
 * GET  /api/boards/admins?workspace_id=<id>   — list admins
 * POST /api/boards/admins                       — add an admin (owner only)
 */
export async function GET(request: NextRequest) {
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

  const workspaceId = request.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "workspace_id query param is required" },
      { status: 400 },
    );
  }

  const authorized = (await isOwner(user.id)) || (await canManageWorkspace(user.id, workspaceId));
  if (!authorized) {
    return NextResponse.json(
      { success: false, error: "Only workspace owners and admins can list board admins" },
      { status: 403 },
    );
  }

  const svc = await createServiceClient();
  const { data: admins, error } = await svc
    .from("board_admins")
    .select("user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  // Enrich with user emails
  const enriched = [];
  for (const admin of admins ?? []) {
    const { data: userRow } = await svc
      .from("auth.users")
      .select("email")
      .eq("id", admin.user_id)
      .maybeSingle();

    enriched.push({
      user_id: admin.user_id,
      email: userRow?.email ?? "unknown",
      role: admin.role,
      created_at: admin.created_at,
    });
  }

  return NextResponse.json({ admins: enriched });
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const { workspace_id, email, role } = body;

  if (!workspace_id || !email || !role) {
    return NextResponse.json(
      { success: false, error: "workspace_id, email, and role are required" },
      { status: 400 },
    );
  }

  // Only the workspace owner can add/remove admins (not other admins)
  const owner = await isOwner(user.id);
  const isWorkspaceAdmin = owner || (await canManageWorkspace(user.id, workspace_id));

  if (!isWorkspaceAdmin) {
    return NextResponse.json(
      { success: false, error: "Only workspace owners and admins can add board admins" },
      { status: 403 },
    );
  }

  if (!owner && role === "owner") {
    return NextResponse.json(
      { success: false, error: "Only the workspace owner can grant 'owner' role" },
      { status: 403 },
    );
  }

  const svc = await createServiceClient();

  // Resolve email to user_id
  const { data: targetUser, error: userError } = await svc
    .from("auth.users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (userError || !targetUser) {
    return NextResponse.json(
      { success: false, error: `No user found with email: ${email}` },
      { status: 404 },
    );
  }

  if (targetUser.id === user.id && role !== "admin") {
    return NextResponse.json(
      { success: false, error: "You cannot change your own role" },
      { status: 400 },
    );
  }

  // Insert or update the admin
  const { data: existing } = await svc
    .from("board_admins")
    .select("id")
    .eq("workspace_id", workspace_id)
    .eq("user_id", targetUser.id)
    .maybeSingle();

  let result;
  if (existing) {
    const { error: updateError } = await svc
      .from("board_admins")
      .update({ role, created_at: new Date().toISOString() })
      .eq("workspace_id", workspace_id)
      .eq("user_id", targetUser.id);

    result = { updated: true, error: updateError };
  } else {
    const { error: insertError } = await svc.from("board_admins").insert({
      workspace_id,
      user_id: targetUser.id,
      role,
      created_by: user.id,
    });

    result = { updated: false, error: insertError };
  }

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: result.updated ? "Admin role updated" : "Admin added",
  });
}

export async function DELETE(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const { workspace_id, user_id } = body;

  if (!workspace_id || !user_id) {
    return NextResponse.json(
      { success: false, error: "workspace_id and user_id are required" },
      { status: 400 },
    );
  }

  // Only the workspace owner can remove admins
  const owner = await isOwner(user.id);
  if (!owner) {
    return NextResponse.json(
      { success: false, error: "Only the workspace owner can remove board admins" },
      { status: 403 },
    );
  }

  const svc = await createServiceClient();
  const { error } = await svc
    .from("board_admins")
    .delete()
    .eq("workspace_id", workspace_id)
    .eq("user_id", user_id)
    .neq("user_id", user.id); // Can't remove yourself

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, message: "Admin removed" });
}
