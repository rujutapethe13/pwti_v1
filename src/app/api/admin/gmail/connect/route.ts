import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { OWNER_EMAIL } from "@/lib/board-access";
import {
  buildAuthorizeUrl,
  makeCodeChallenge,
  makeCodeVerifier,
  makeState,
  storeOAuthState,
} from "@/lib/email/gmail/oauth";

/**
 * POST /api/admin/gmail/connect
 *
 * Starts the admin-only Gmail OAuth connect flow (authorization code + PKCE).
 * Protects with:
 *   1. an authenticated Supabase session whose email is OWNER_EMAIL (admin),
 *   2. the ADMIN_SETUP_SECRET (header x-admin-setup-secret or JSON/form field
 *      `setupSecret`) as a second check.
 *
 * Accepts a browser form POST (application/json or
 * application/x-www-form-urlencoded) and redirects to Google login. After
 * consent, Google calls /api/admin/gmail/callback.
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient(await (await import("next/headers")).cookies());
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const userEmail = String(user.email ?? "").toLowerCase();
  if (userEmail !== OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: "Forbidden: not the account owner" },
      { status: 403 },
    );
  }

  const headerSecret = request.headers.get("x-admin-setup-secret");
  let bodySecret: string | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      bodySecret = body.setupSecret;
    } else {
      const form = await request.formData();
      bodySecret = form.get("setupSecret")?.toString();
    }
  } catch {
    bodySecret = undefined;
  }
  const secret = headerSecret ?? bodySecret;

  if (!secret || secret !== process.env.ADMIN_SETUP_SECRET) {
    return NextResponse.json(
      { success: false, error: "Forbidden: invalid setup secret" },
      { status: 403 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectUri = `${origin}/api/admin/gmail/callback`;

  const codeVerifier = makeCodeVerifier();
  const codeChallenge = makeCodeChallenge(codeVerifier);
  const state = makeState();

  await storeOAuthState(state);

  const authorizeUrl = buildAuthorizeUrl({
    redirectUri,
    state,
    codeChallenge,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("pw_oauth_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/gmail/callback",
    maxAge: 600,
  });
  response.cookies.set("pw_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/gmail/callback",
    maxAge: 600,
  });
  return response;
}
