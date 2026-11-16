import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isBoardRestricted, OWNER_EMAIL } from "@/lib/board-access";
import { sendEmail, buildApproveUrl, buildDenyUrl } from "@/lib/email";
import { resolveRecipients } from "@/lib/email/routing";
import { accessRequestTemplate } from "@/lib/email/templates";
import { createHash } from "node:crypto";

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
      { success: false, error: "Authentication required", details: null },
      { status: 401 },
    );
  }

  const { id: boardId } = await params;

  // ── Only restricted boards accept access requests ──────────────────
  const restricted = await isBoardRestricted(boardId);
  if (!restricted) {
    return NextResponse.json(
      { success: false, error: "Board is open — no access request needed" },
      { status: 400 },
    );
  }

  const userEmail = user.email ?? "";
  const userName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    userEmail.split("@")[0] ||
    "Unknown user";

  const svc = await createServiceClient();

  try {
    // ── Check for an existing request (pending or approved) ─────────────
    const { data: existing } = await svc
      .from("board_access_requests")
      .select("id, status")
      .eq("board_id", boardId)
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existing && (existing.status === "pending" || existing.status === "approved")) {
      return NextResponse.json(
        { status: "requested", request_id: existing.id },
        { status: 200 },
      );
    }

    // ── Generate a response token for approve/deny email links ────────
    const responseToken = crypto.randomUUID();

    // ── Create the access request ────────────────────────────────────
    const { data: newRequest, error: insertError } = await svc
      .from("board_access_requests")
      .insert({
        board_id: boardId,
        user_id: user.id,
        status: "pending",
        requester_name: userName,
        requester_email: userEmail,
        response_token: responseToken,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        // Unique constraint violation — a request already exists
        return NextResponse.json(
          { status: "requested" },
          { status: 200 },
        );
      }
      throw insertError;
    }

    // ── Fetch board name for the email ────────────────────────────────
    const { data: board } = await svc
      .from("boards")
      .select("name, workspace_id")
      .eq("id", boardId)
      .maybeSingle();

    // ── Send notification email to the workspace owner ────────────────
    const boardName = board?.name ?? boardId;
    const approveUrl = buildApproveUrl(responseToken);
    const denyUrl = buildDenyUrl(responseToken);

    const { html, text, subject } = accessRequestTemplate({
      requesterName: userName,
      requesterEmail: userEmail,
      boardName,
      approveUrl,
      denyUrl,
      requestId: newRequest.id,
    });

    const recipients = resolveRecipients("access-request");

    const idempotencyKey = createHash("sha256")
      .update(`access-request|${OWNER_EMAIL.toLowerCase()}|${newRequest.id}`)
      .digest("hex");

    await sendEmail({
      to: recipients.to,
      subject,
      html,
      text,
      eventType: "access-request",
      identifier: "request-access",
      idempotencyKey,
    });

    return NextResponse.json(
      { status: "requested", request_id: newRequest.id },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[request-access] POST error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to submit access request", details: message },
      { status: 500 },
    );
  }
}
