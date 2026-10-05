"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { clientEnv } from "@/config/env";

/**
 * Auth server actions.
 *
 * ── Signup is open ─────────────────────────────────────────────────────────
 * This used to refuse any email other than the super admin's, which meant the
 * only way to onboard a client was to hand-edit the database. Signup is now
 * open: the `on_auth_user_created` trigger in migration 01 creates the
 * profiles row with role 'client', and the new user lands on the access-required
 * empty state until an admin grants them a workspace.
 *
 * An optional invite code (or an invite matched on email) pre-enrols the new
 * user into a specific workspace on first login. The invite table has a CHECK
 * constraint forbidding the admin role, because only the super admin may create
 * admins and that has to hold for the invite path too.
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

  redirect("/workspace");
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
  const inviteCode = ((formData.get("invite_code") as string | null) ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient(await cookies());

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The trigger reads `name` and `invite_code` out of this metadata.
      data: inviteCode ? { name, invite_code: inviteCode } : { name },
      emailRedirectTo: callbackUrl(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Supabase returns a user with no session when email confirmation is on,
  // which is the intended state: they must confirm before they can sign in.
  const needsConfirmation = !data.session;

  return {
    success: true,
    email,
    needsConfirmation,
    invited: inviteCode.length > 0,
  };
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