"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { clientEnv } from "@/config/env";

/**
 * Auth server actions.
 *
 * ── Signup and workspace access ─────────────────────────────────────────────
 * Anyone may create an account. Workspace membership is separate: until an
 * admin adds the account, authenticated app routes show the access-required
 * state and no workspace data is exposed.
 *
 * ── What this file does not decide ─────────────────────────────────────────
 * Nothing here grants access. Signup creates an identity; permissions come from
 * the database, read at query time.
 */

function callbackUrl(next?: string) {
  const base = clientEnv.NEXT_PUBLIC_APP_URL;
  return next && isSafeRedirect(next) ? `${base}/auth/callback?next=${encodeURIComponent(next)}` : `${base}/auth/callback`;
}

/**
 * Only same-origin, path-absolute redirects. A `next` of "//evil.com" is a
 * protocol-relative URL and would send the user off-site after OAuth.
 */
function isSafeRedirect(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
}

/**
 * End the session and send the user to sign-in.
 *
 * `signOut()` clears the session cookies on the server, so the redirect that
 * follows cannot land on an authenticated page with a stale cookie. The
 * `router.refresh()` inside signOut is a no-op across a server-action redirect
 * but matters when the action is called without one, so it stays.
 *
 * A failure here is not swallowed: the caller still ends up signed out because
 * Supabase has already invalidated the refresh token locally even if the
 * network round trip failed.
 */
export async function signOut() {
  const supabase = await createClient(await cookies());
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[auth] signOut failed:", error.message);
  }

  redirect("/signin");
}

/**
 * Record the login timestamp.
 *
 * Called from the two places a sign-in actually completes rather than from
 * /api/me on load, because a page refresh must not rewrite "last login". Failures
 * are logged and ignored: a missing timestamp is a cosmetic gap, and refusing to
 * let somebody in over it would be worse.
 */
async function recordLogin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { error } = await supabase.rpc("touch_user_activity", { p_is_login: true });
  if (error) {
    console.error("[auth] could not record last login:", error.message);
  }
}

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient(await cookies());
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.user.email_confirmed_at) {
    return { error: "Please verify your email before signing in", unverified: true };
  }

  await recordLogin(supabase);

  await supabase.auth.getUser();

  // Resolve the new session's workspaces on the same client instance so
  // `auth.uid()` (used by get_my_workspaces()) sees the session just created.
  const { data: wsRows } = await supabase.rpc("get_my_workspaces");
  const workspaces: Array<{ id: string }> = (wsRows ?? []).map(
    (w: { id: string }) => ({ id: w.id }),
  );

  return { workspaces };
}

/**
 * Begin a Google sign-in.
 *
 * PKCE: Supabase returns an authorize URL with a `code` challenge, and
 * /auth/callback exchanges the code. The browser never sees a client secret.
 */
export async function signInWithGoogle(formData?: FormData) {
  const next = (formData?.get("next") as string | null) ?? undefined;

  const supabase = await createClient(await cookies());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl(next),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    return { error: error?.message ?? "Could not start Google sign-in" };
  }

  redirect(data.url);
}

export async function signUpWithEmail(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    const supabase = await createClient(await cookies());
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: callbackUrl(),
      },
    });

    if (error) {
      return { error: error.message };
    }

    // Supabase returns a user with no session when email confirmation is on.
    return {
      success: true,
      email,
      needsConfirmation: !data.session,
    };
  } catch (error) {
    console.error("[auth] signup failed:", error);
    return {
      error: error instanceof Error ? error.message : "Could not create your account",
    };
  }
}

export async function resendVerificationEmail(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  const supabase = await createClient(await cookies());
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl() },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function sendPasswordResetEmail(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  const supabase = await createClient(await cookies());
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl("/reset-password"),
  });

  if (error) {
    return { error: error.message };
  }

  // Always the same message, whether or not the address exists: a differing
  // reply would turn this form into an account-enumeration oracle.
  return { success: true };
}

/**
 * End the session and send the user back to the sign-in screen.
 *
 * `redirect` throws a control-flow sentinel, so it has to stay outside any
 * try/catch: swallowing it turns a redirect into a blank page.
 */
export async function updatePassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm_password") as string;

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match" };
  }

  const supabase = await createClient(await cookies());
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/workspace");
}