import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { sendEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { revokeOtherSessions } from "@/lib/account-server";
import {
  CHANGE_PASSWORD_MAX_ATTEMPTS,
  CHANGE_PASSWORD_WINDOW_SECONDS,
  RATE_LIMIT_ACTION_CHANGE_PASSWORD,
  getRateLimitState,
  loadCredentialHashes,
  persistNewPassword,
  readClientIp,
  recordActivityFeedEntry,
  recordRateLimitEvent,
  recordSecurityEvent,
  verifyPasswordAgainstGoTrue,
} from "@/lib/account-security";
import { assertHashable, hashPassword, matchesAnyHash, verifyPassword } from "@/lib/password-hash";
import { clientEnv } from "@/config/env";
import { passwordErrorMessage, validatePassword } from "@/lib/password-policy";

export const runtime = "nodejs";

/**
 * POST /api/auth/change-password
 *
 * Changes the caller's password. Requires a session.
 *
 * Failure responses carry one message and nothing else. A caller that can
 * distinguish "wrong password" from "password not set" from "that password was
 * used before" can walk a victim's credential space one guess at a time, so the
 * only distinctions returned are the ones the user has to act on.
 */

type Field = "currentPassword" | "newPassword" | "confirmPassword" | null;

function fail(status: number, error: string, field: Field = null) {
  return NextResponse.json({ success: false, error, field }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient(await cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, "Authentication required");
  }

  const email = user.email ?? "";
  const ipAddress = readClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");

  // The browser-generated id behind the active-devices list, sent alongside the
  // request the same way /api/me/sessions/revoke-others receives it. Optional:
  // with it, the row for this device survives the cleanup below.
  const deviceId =
    request.nextUrl.searchParams.get("device_id") ??
    request.headers.get("x-device-id");

  const body = await request.json().catch(() => ({}));
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  // ── Rate limit, before any password work ────────────────────────────────
  // Checked first so a locked account cannot use this endpoint to keep
  // guessing, and so the bcrypt comparisons below never run for a locked user.
  const rateLimit = await getRateLimitState(
    user.id,
    RATE_LIMIT_ACTION_CHANGE_PASSWORD,
    CHANGE_PASSWORD_MAX_ATTEMPTS,
    CHANGE_PASSWORD_WINDOW_SECONDS,
  );

  if (!rateLimit.allowed) {
    await recordSecurityEvent({
      userId: user.id,
      event: "password.change_blocked_rate_limit",
      detail: { action: RATE_LIMIT_ACTION_CHANGE_PASSWORD },
      ipAddress,
      userAgent,
    });

    return fail(
      429,
      "Too many attempts. Wait a few minutes and try again.",
      "currentPassword",
    );
  }

  // ── Does this account have a password to begin with? ───────────────────
  // An account created through Google or another SSO provider has none, so it
  // gets "Set a password" instead and is not asked for a current one.
  const { data: passwordState } = await supabase.rpc("account_password_state");
  const stateRow = (Array.isArray(passwordState) ? passwordState[0] : passwordState) as
    | { has_password?: boolean }
    | null;
  const hasPassword = stateRow?.has_password === true;

  // ── Validate the new password ──────────────────────────────────────────
  // Client-side validation is a convenience only; this is the check that counts.
  const newPasswordCheck = validatePassword(newPassword);

  if (!newPasswordCheck.valid) {
    await recordRateLimitEvent(
      user.id,
      RATE_LIMIT_ACTION_CHANGE_PASSWORD,
      false,
    );
    return fail(400, passwordErrorMessage(newPasswordCheck.error!), "newPassword");
  }

  if (confirmPassword && confirmPassword !== newPassword) {
    await recordRateLimitEvent(
      user.id,
      RATE_LIMIT_ACTION_CHANGE_PASSWORD,
      false,
    );
    return fail(400, "Passwords do not match", "confirmPassword");
  }

  // ── Verify the current password ────────────────────────────────────────
  if (hasPassword) {
    if (!currentPassword) {
      await recordRateLimitEvent(
        user.id,
        RATE_LIMIT_ACTION_CHANGE_PASSWORD,
        false,
      );
      return fail(400, "Current password is required", "currentPassword");
    }

    const { current, previous } = await loadCredentialHashes(user.id);

    // Prefer the local hash. Accounts that predate account_credentials have
    // none, so fall back to GoTrue — which also lets this first change write
    // the row, after which verification never leaves the database again.
    const verified = current
      ? await verifyPassword(currentPassword, current)
      : await verifyPasswordAgainstGoTrue(email, currentPassword);

    if (!verified) {
      await recordRateLimitEvent(
        user.id,
        RATE_LIMIT_ACTION_CHANGE_PASSWORD,
        false,
      );
      await recordSecurityEvent({
        userId: user.id,
        event: "password.change_failed",
        // Deliberately no password material of any kind.
        detail: { reason: "current_password_mismatch" },
        ipAddress,
        userAgent,
      });

      return fail(400, "Current password is incorrect", "currentPassword");
    }

    // ── Reject reuse ─────────────────────────────────────────────────────
    // The live hash plus the last three. Catches "same as current" and
    // "same as one of the last three" in one pass.
    if (await matchesAnyHash(newPassword, [current, ...previous])) {
      await recordRateLimitEvent(
        user.id,
        RATE_LIMIT_ACTION_CHANGE_PASSWORD,
        false,
      );

      return fail(
        400,
        "Choose a password you have not used recently.",
        "newPassword",
      );
    }
  }

  // ── Hash and apply ─────────────────────────────────────────────────────
  // Belt and braces: validatePassword already caps the length, but this is the
  // boundary that actually writes, so a caller that somehow bypassed the policy
  // still cannot produce two passwords that hash identically.
  assertHashable(newPassword);

  const newHash = await hashPassword(newPassword);

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    console.error("[change-password] updateUser failed:", updateError.message);
    return fail(500, "Could not update your password. Please try again.");
  }

  let passwordChangedAt: string;
  try {
    passwordChangedAt = await persistNewPassword(user.id, newHash);
  } catch (err) {
    // GoTrue already holds the new password, so the account is usable; only the
    // local mirror is stale. Surfaced as a 500 so the user retries rather than
    // assuming everything landed, and logged because it needs a follow-up.
    console.error("[change-password] persistNewPassword failed:", err);
    return fail(500, "Could not update your password. Please try again.");
  }

  // ── Keep the caller signed in, drop everyone else ──────────────────────
  // signOut({ scope: 'others' }) is Supabase's own way to revoke every other
  // refresh token while leaving the calling session alive, and it is the same
  // call /api/me/sessions/revoke-others makes. Preferring it over deleting rows
  // in auth.sessions means this path depends on a supported API rather than on
  // GoTrue's private schema.
  const { error: revokeError } = await supabase.auth.signOut({ scope: "others" });

  if (revokeError) {
    console.error("[change-password] sign out others failed:", revokeError.message);
  }

  // The app keeps its own user_sessions rows for the active-devices list, so
  // clean those up too or the Profile page would keep showing devices whose
  // refresh tokens are gone. Best effort: it already tolerates a missing table.
  await revokeOtherSessions(user.id, deviceId);

  // Mint a fresh access token for the caller, so the rotation ends with the user
  // holding current credentials rather than a token that is about to expire.
  const { data: refreshed } = await supabase.auth.refreshSession();
  let callerStillSignedIn = Boolean(refreshed.session);

  if (!callerStillSignedIn && email) {
    // Fall back to a clean sign-in with the password just set. Losing the
    // refresh race here must not bounce the user to /signin immediately after
    // they did exactly what the dialog asked.
    const { data: signedIn } = await supabase.auth.signInWithPassword({
      email,
      password: newPassword,
    });
    callerStillSignedIn = Boolean(signedIn.session);
  }

  await recordRateLimitEvent(user.id, RATE_LIMIT_ACTION_CHANGE_PASSWORD, true);

  await recordSecurityEvent({
    userId: user.id,
    event: hasPassword ? "password.changed" : "password.set",
    detail: {
      method: hasPassword ? "change_password" : "set_password",
      firstPassword: !hasPassword,
      otherSessionsRevoked: !revokeError,
      callerSessionKept: callerStillSignedIn,
    },
    ipAddress,
    userAgent,
  });

  await recordActivityFeedEntry({
    userId: user.id,
    action: hasPassword ? "account.password.changed" : "account.password.set",
    payload: { method: hasPassword ? "change_password" : "set_password" },
  });

  await sendPasswordChangedConfirmation(email);

  return NextResponse.json({
    success: true,
    passwordChangedAt,
    callerSessionKept: callerStillSignedIn,
  });
}

/**
 * Confirmation email.
 *
 * Sent on every successful change, including the SSO "set a password" path,
 * because a set-password is exactly as capable of being done by someone else as
 * a change is. The reset link is the user's way out if it was not them.
 */
async function sendPasswordChangedConfirmation(email: string): Promise<void> {
  if (!email) return;

  const resetUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/forgot-password`;

  const result = await sendEmail({
    to: email,
    subject: "Your password was changed",
    html: `
      <p>Your password was changed.</p>
      <p>If this wasn't you, reset it immediately:
        <a href="${resetUrl}">reset your password</a>.
      </p>
      <p>All other sessions have been signed out. You can request another reset link at any time.</p>
    `,
    text:
      "Your password was changed.\n\n" +
      "If this wasn't you, reset it immediately: " +
      resetUrl +
      "\n\nAll other sessions have been signed out.",
  });

  if (!result.success) {
    // The password is already changed; a bounced confirmation email is worth
    // knowing about but must not fail the request.
    console.error("[change-password] confirmation email failed:", result.error);
  }
}