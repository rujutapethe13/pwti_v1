import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { sendEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import {
  loadCredentialHashes,
  persistNewPassword,
  readClientIp,
  recordActivityFeedEntry,
  recordSecurityEvent,
  revokeAllSessions,
} from "@/lib/account-security";
import { assertHashable, hashPassword, matchesAnyHash } from "@/lib/password-hash";
import { passwordErrorMessage, validatePassword } from "@/lib/password-policy";

export const runtime = "nodejs";

/**
 * POST /api/auth/reset-password
 *
 * Redeems a single-use reset token for a new password.
 *
 * The caller is not signed in — that is what a reset link is for — so this is
 * the one password path that writes through the service role rather than
 * `updateUser`. It therefore has no rate limit of its own; what stops someone
 * brute-forcing a token is that a token is 256 bits of CSPRNG output, and
 * guessing one is not a thing that can be done.
 */

type Field = "newPassword" | "confirmPassword" | null;

function fail(status: number, error: string, field: Field = null) {
  return NextResponse.json({ success: false, error, field }, { status });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const ipAddress = readClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!token) {
    return fail(400, "This reset link is invalid or has expired.");
  }

  // Validate the password *before* touching the token, so a rejected password
  // leaves the link usable and the user can simply try again.
  const newPasswordCheck = validatePassword(newPassword);

  if (!newPasswordCheck.valid) {
    return fail(400, passwordErrorMessage(newPasswordCheck.error!), "newPassword");
  }

  if (confirmPassword && confirmPassword !== newPassword) {
    return fail(400, "Passwords do not match", "confirmPassword");
  }

  const svc = await createServiceClient();
  const tokenHash = hashToken(token);

  // Peek before consuming. consume_password_reset_token() is the authoritative
  // single-use gate, but it burns the token, so the reuse check has to happen
  // against a read first — otherwise a user who picks a password they have used
  // recently would lose the link and have to request another email.
  const { data: peek, error: peekError } = await svc
    .from("password_reset_tokens")
    .select("user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (peekError) {
    console.error("[reset-password] token lookup failed:", peekError.message);
    return fail(500, "Could not reset your password. Please try again.");
  }

  if (!peek || peek.used_at !== null || new Date(peek.expires_at as string) <= new Date()) {
    return fail(400, "This reset link is invalid or has expired.");
  }

  const userId = peek.user_id as string;

  const { current, previous } = await loadCredentialHashes(userId);

  if (await matchesAnyHash(newPassword, [current, ...previous])) {
    return fail(400, "Choose a password you have not used recently.", "newPassword");
  }

  // Burn the token. Atomic in SQL: two concurrent redemptions serialise on the
  // row and the second sees used_at already set.
  const { data: consumed, error: consumeError } = await svc.rpc(
    "consume_password_reset_token",
    { p_token_hash: tokenHash },
  );

  if (consumeError) {
    console.error("[reset-password] consume failed:", consumeError.message);
    return fail(500, "Could not reset your password. Please try again.");
  }

  if (!consumed) {
    return fail(400, "This reset link is invalid or has expired.");
  }

  // ── Apply ──────────────────────────────────────────────────────────────
  assertHashable(newPassword);

  const newHash = await hashPassword(newPassword);

  const { error: updateError } = await svc.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) {
    console.error("[reset-password] updateUserById failed:", updateError.message);
    return fail(500, "Could not reset your password. Please try again.");
  }

  let passwordChangedAt: string;
  try {
    passwordChangedAt = await persistNewPassword(userId, newHash);
  } catch (err) {
    console.error("[reset-password] persistNewPassword failed:", err);
    return fail(500, "Could not reset your password. Please try again.");
  }

  // A reset revokes *every* session. There is no caller to keep signed in: the
  // link is redeemed by someone who is not authenticated, and the person who
  // prompted it may not be the account owner. Signing out everywhere is the
  // only safe reading, and the UI redirects to /signin afterwards anyway.
  const revokedSessions = await revokeAllSessions(userId);

  const { data: userData } = await svc.auth.admin.getUserById(userId);
  const email = userData.user?.email ?? "";

  await recordSecurityEvent({
    userId,
    event: "password.reset_completed",
    detail: {
      method: "reset_token",
      otherSessionsRevoked: revokedSessions,
    },
    ipAddress,
    userAgent,
  });

  await recordActivityFeedEntry({
    userId,
    action: "account.password.reset",
    payload: { method: "reset_token" },
  });

  await sendPasswordResetConfirmation(email);

  return NextResponse.json({ success: true, passwordChangedAt });
}

async function sendPasswordResetConfirmation(email: string): Promise<void> {
  if (!email) return;

  const result = await sendEmail({
    to: email,
    subject: "Your password was changed",
    html: `
      <p>Your password was changed.</p>
      <p>If this wasn't you, reset it immediately:
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/forgot-password">reset your password</a>.
      </p>
      <p>All sessions have been signed out.</p>
    `,
    text:
      "Your password was changed.\n\n" +
      "If this wasn't you, reset it immediately: /forgot-password\n\n" +
      "All sessions have been signed out.",
  });

  if (!result.success) {
    console.error("[reset-password] confirmation email failed:", result.error);
  }
}