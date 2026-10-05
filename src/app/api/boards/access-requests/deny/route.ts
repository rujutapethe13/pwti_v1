import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { isOwner, canManageWorkspace, OWNER_EMAIL } from "@/lib/board-access";
import { resolveUserByEmail } from "@/lib/board-access";
import { sendEmail } from "@/lib/email";

/**
 * Deny a pending board access request.
 *
 * Can be called two ways:
 * 1. By the workspace owner/admin via POST with the request ID (JSON body)
 * 2. By clicking the "Deny" link in the notification email (GET with token)
 */
export async function POST(request: NextRequest) {
  const svc = await createServiceClient();

  const {
    data: { user },
  } = await svc.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requestId: string | undefined = body.request_id;

  if (!requestId) {
    return NextResponse.json(
      { success: false, error: "request_id is required" },
      { status: 400 },
    );
  }

  return NextResponse.json(await denyRequest(svc, requestId, user.id));
}

/**
 * Token-based denial via GET (from email link).
 * No authentication required — the token itself is the authorization.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Missing token" },
      { status: 400 },
    );
  }

  const svc = await createServiceClient();

  const { data: req, error: fetchError } = await svc
    .from("board_access_requests")
    .select("id, board_id, user_id, status, requester_email, requester_name")
    .eq("response_token", token)
    .maybeSingle();

  if (fetchError || !req) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired token" },
      { status: 404 },
    );
  }

  const ownerUserId = await resolveUserByEmail(OWNER_EMAIL);
  if (!ownerUserId) {
    return NextResponse.json(
      { success: false, error: "Could not resolve workspace owner" },
      { status: 500 },
    );
  }

  const result = await denyRequest(svc, req.id, ownerUserId);

  if (result.success) {
    const userEmail = req.requester_email;
    if (userEmail) {
      await sendEmail({
        to: userEmail,
        subject: "Access request declined",
        html: `
          <p>Your access request for board <strong>${req.board_id}</strong> has been declined.</p>
          <p>If you need access, please contact a workspace administrator.</p>
        `,
        text: `Your access request for board ${req.board_id} has been declined.`,
      });
    }
  }

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Access Request ${result.success ? "declined" : "error"}</title></head>
<body style="font-family: system-ui; padding: 40px; text-align: center;">
  <h1>Request ${result.success ? "declined" : "could not be declined"}</h1>
  <p>${result.error ?? "The requester has been notified."}</p>
  <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/boards-hub">Go to Boards Hub</a></p>
</body>
</html>`,
    { status: result.success ? 200 : 500, headers: { "Content-Type": "text/html" } },
  );
}

async function denyRequest(
  svc: Awaited<ReturnType<typeof createServiceClient>>,
  requestId: string,
  approverUserId: string,
) {
  const { data: request, error: fetchError } = await svc
    .from("board_access_requests")
    .select("id, board_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { success: false, error: "Request not found" };
  }

  if (request.status !== "pending") {
    return { success: false, error: `Request is already ${request.status}` };
  }

  const { data: board, error: boardError } = await svc
    .from("boards")
    .select("workspace_id")
    .eq("id", request.board_id)
    .maybeSingle();

  if (boardError || !board) {
    return { success: false, error: "Board not found" };
  }

  const authorized = (await isOwner(approverUserId)) || (await canManageWorkspace(approverUserId, board.workspace_id));
  if (!authorized) {
    return { success: false, error: "Not authorized to deny this request" };
  }

  const { error: updateError } = await svc
    .from("board_access_requests")
    .update({ status: "denied", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}
