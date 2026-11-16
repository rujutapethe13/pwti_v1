import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { OWNER_EMAIL } from "@/lib/board-access";
import { gmailTokenStore } from "@/lib/email/gmail/token-store";
import {
  consumeOAuthState,
  exchangeCodeForTokens,
  getUserEmail,
} from "@/lib/email/gmail/oauth";

/**
 * GET /api/admin/gmail/callback
 *
 * Google redirects here after the admin signs in and consents. Validates
 * state + PKCE, exchanges the code for tokens, calls Google userinfo to
 * confirm the connected account equals GMAIL_SENDER, then stores the
 * encrypted refresh token in the DB (single row).
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const errorDescription = request.nextUrl.searchParams.get("error_description");

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: `OAuth cancelled: ${error} ${errorDescription ?? ""}`.trim(),
      },
      { status: 400 },
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { success: false, error: "Missing code or state" },
      { status: 400 },
    );
  }

  const cookieState = request.cookies.get("pw_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.json(
      { success: false, error: "State mismatch" },
      { status: 400 },
    );
  }
  const stateConsumed = await consumeOAuthState(state);
  if (!stateConsumed) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired state" },
      { status: 400 },
    );
  }

  const codeVerifier = request.cookies.get("pw_oauth_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.json(
      { success: false, error: "Missing PKCE verifier" },
      { status: 400 },
    );
  }

  const supabase = await createClient(await (await import("next/headers")).cookies());
  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = String(user?.email ?? "").toLowerCase();
  if (userEmail !== OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: "Forbidden: not the account owner" },
      { status: 403 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectUri = `${origin}/api/admin/gmail/callback`;

  const tokens = await exchangeCodeForTokens({
    code,
    redirectUri,
    codeVerifier,
  });

  const expectedSender = process.env.GMAIL_SENDER;
  if (!expectedSender) {
    return NextResponse.json(
      { success: false, error: "GMAIL_SENDER is not configured" },
      { status: 500 },
    );
  }

  let connectedEmail: string;
  try {
    connectedEmail = await getUserEmail(tokens.access_token);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: `Could not verify Gmail account: ${err.message ?? String(err)}`,
      },
      { status: 500 },
    );
  }

  if (!connectedEmail || connectedEmail.toLowerCase() !== expectedSender.toLowerCase()) {
    return NextResponse.json(
      {
        success: false,
        error: `Connected account "${connectedEmail ?? ""}" does not match configured GMAIL_SENDER "${expectedSender}"`,
      },
      { status: 400 },
    );
  }

  await gmailTokenStore.provision(tokens);

  const response = NextResponse.json({
    success: true,
    message: `Gmail account connected (${connectedEmail}). Refresh token stored (encrypted).`,
  });
  response.cookies.set("pw_oauth_verifier", "", { path: "/", maxAge: 0 });
  response.cookies.set("pw_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}
