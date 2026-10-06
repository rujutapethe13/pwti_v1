import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / confirmation callback.
 *
 * Handles the `code` that both Google sign-in and the email-confirmation link
 * come back with. Exchanging it here — rather than in a client component — is
 * what lets the session cookies be written: the browser never sees a token.
 *
 * This route must stay public in the middleware, which is why it lives under
 * /auth rather than inside the authenticated group.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const errorParam = request.nextUrl.searchParams.get("error_description");

  // A recovery link can land here with a token in the hash instead of a code.
  const hash = request.nextUrl.hash.replace(/^#/, "");
  const tokenHash = hash.includes("token_hash=")
    ? new URLSearchParams(hash).get("token_hash")
    : null;

  const next = isSafeRedirect(nextParam) ? nextParam : "/workspace";

  if (!code && !tokenHash) {
    return NextResponse.redirect(
      new URL(
        `/signin?error=${encodeURIComponent(errorParam ?? "missing_code")}`,
        request.url,
      ),
    );
  }

  const supabase = await createClient(await cookies());

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        type: "recovery" as never,
        token_hash: tokenHash,
      })
    : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  // A session now exists, so stamp last_login_at. `signInWithEmail` does the
  // same for password sign-in; this is the OAuth / email-confirmation path.
  // Failures are logged rather than surfaced — a missing timestamp must not
  // block the redirect into the app.
  const { error: activityError } = await supabase.rpc("touch_user_activity", {
    p_is_login: true,
  });
  if (activityError) {
    console.error("[auth/callback] could not record last login:", activityError.message);
  }

  return NextResponse.redirect(new URL(next, request.url));
}

/**
 * Reject anything that is not a same-origin, path-absolute path.
 *
 * `next` arrives from the query string, so without this an attacker could send
 * a user through a legitimate OAuth flow and land them on an attacker page
 * immediately afterwards — with the referrer showing the app just signed them
 * in, which is a convincing lure.
 */
function isSafeRedirect(next: string | null): next is string {
  if (!next) return false;
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
}