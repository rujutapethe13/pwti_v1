import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { isOwner, canManageWorkspace, OWNER_EMAIL } from "@/lib/board-access";
import { resolveUserByEmail } from "@/lib/board-access";
import { sendEmail, buildApproveUrl, buildDenyUrl } from "@/lib/email";

/**
 * Approve a pending board access request.
 *
 * Can be called two ways:
 * 1. By the workspace owner/admin via POST with the request ID (JSON body)
 * 2. By clicking the "Approve" link in the notification email (GET with token)
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const svc = await supabase;

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

  return NextResponse.json(await approveRequest(svc, requestId, user.id));
}

/**
 * Token-based approval via GET (from email link).
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

  // Find the request by response_token
  const { data: req, error: fetchError } = await svc
    .from("board_access_requests")
    .select("id, board_id, user_id, status, requester_email")
    .eq("response_token", token)
    .maybeSingle();

  if (fetchError || !req) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired token" },
      { status: 404 },
    );
  }

  // Find a workspace admin/owner to act as the approver based on the token
  // (the token is only generated and sent to OWNER_EMAIL, so we use the owner)
  const ownerUserId = await resolveUserByEmail(OWNER_EMAIL);

  if (!ownerUserId) {
    return NextResponse.json(
      { success: false, error: "Could not resolve workspace owner" },
      { status: 500 },
    );
  }

  const result = await approveRequest(svc, req.id, ownerUserId, req.user_id as string);

  if (result.success) {
    // Notify the requester via email
    const userEmail = req.requester_email;
    if (userEmail) {
      await sendEmail({
        to: userEmail,
        subject: "Access request approved",
        html: `
          <p>Your access request for board <strong>${req.board_id}</strong> has been approved.</p>
          <p>You can now open the board in Powerweave Studio OS.</p>
        `,
        text: `Your access request for board ${req.board_id} has been approved.`,
      });
    }
  }

  // Return an HTML page so the user clicking the email link sees a result
  const status = result.success ? "approved" : "error";
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Access Request ${status}</title></head>
<body style="font-family: system-ui; padding: 40px; text-align: center;">
  <h1>Access request ${result.success ? "approved" : "could not be approved"}</h1>
  <p>${result.error ?? "The user has been granted access and notified."}</p>
  <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/boards-hub">Go to Boards Hub</a></p>
</body>
</html>`,
    { status: result.success ? 200 : 500, headers: { "Content-Type": "text/html" } },
  );
}

async function approveRequest(
  svc: Awaited<ReturnType<typeof createServiceClient>>,
  requestId: string,
  approverUserId: string,
   _requesterUserId?: string,
) {
  // Fetch the request with board info
  const { data: request, error: fetchError } = await svc
    .from("board_access_requests")
    .select("id, board_id, user_id, status, requester_email, requester_name")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { success: false, error: "Request not found" };
  }

  if (request.status !== "pending") {
    return { success: false, error: `Request is already ${request.status}` };
  }

  // Verify approver is owner or admin of the board's workspace
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
    return { success: false, error: "Not authorized to approve this request" };
  }

  // Update the request to 'approved'
  const { error: updateError } = await svc
    .from("board_access_requests")
    .update({ status: "approved", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Grant explicit access via board_access_overrides
  const { error: overrideError } = await svc
    .from("board_access_overrides")
    .upsert({
      board_id: request.board_id,
      user_id: request.user_id,
      access: "granted",
    });

  if (overrideError) {
    console.error("[approve] Failed to create access override:", overrideError.message);
    return { success: false, error: "Failed to grant access" };
  }

  // Build the approve/deny URLs for the other direction (in case the owner
  // wants to reverse the decision)
  const approveUrl = buildApproveUrl(crypto.randomUUID());
  const denyUrl = buildDenyUrl(crypto.randomUUID());

  return { success: true, approveUrl, denyUrl };
}
