import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

import { sendEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import {
  CHANGE_PASSWORD_MAX_ATTEMPTS,
  CHANGE_PASSWORD_WINDOW_SECONDS,
  RATE_LIMIT_ACTION_FORGOT_PASSWORD,
  findUserIdByEmail,
  getRateLimitState,
  readClientIp,
  recordRateLimitEvent,
  recordSecurityEvent,
} from "@/lib/account-security";
import { clientEnv } from "@/config/env";

export const runtime = "nodejs";

/**
 * POST /api/auth/forgot-password
 *
 * Issues a single-use reset link that expires in 30 minutes.
 *
 * The response is byte-for-byte identical whether or not the address belongs to
 * an account. Anything else — a 404 for unknown addresses, a different message
 * for known ones — turns this form into an account-enumeration oracle: it would
 * tell an attacker which addresses have accounts here, which is exactly the
 * list they want for credential stuffing.
 *
 * So failures are swallowed. The token is only minted for a real account, but
 * the caller never learns that.
 */

/** 32 random bytes, hex encoded. The raw token goes in the email; only its digest is stored. */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * SHA-256 of the token, which is what actually gets stored.
 *
 * Lets the table be read by anyone with database access without handing them
 * working reset links. Safe as a digest rather than a keyed hash because the
 * token is 256 bits of CSPRNG output — there is no guessing attack to slow down.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const ipAddress = readClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Same response as everything else. An obviously malformed address is not
    // an account-existence oracle.
    return NextResponse.json({ success: true });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    const userId = await findUserIdByEmail(normalizedEmail);

    if (userId) {
      const rateLimit = await getRateLimitState(
        userId,
        RATE_LIMIT_ACTION_FORGOT_PASSWORD,
        CHANGE_PASSWORD_MAX_ATTEMPTS,
        CHANGE_PASSWORD_WINDOW_SECONDS,
      );

      if (!rateLimit.allowed) {
        await recordSecurityEvent({
          userId,
          event: "password.reset_request_rate_limited",
          detail: { action: RATE_LIMIT_ACTION_FORGOT_PASSWORD },
          ipAddress,
          userAgent,
        });

        // Still a success to the caller.
        return NextResponse.json({ success: true });
      }

      await recordRateLimitEvent(
        userId,
        RATE_LIMIT_ACTION_FORGOT_PASSWORD,
        true,
      );

      await issueResetToken(userId, normalizedEmail, ipAddress, userAgent);
    }
  } catch (err) {
    // A failed send or insert must not turn into a distinguishable response.
    console.error("[forgot-password] request failed:", err);
  }

  return NextResponse.json({ success: true });
}

async function issueResetToken(
  userId: string,
  email: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  const svc = await createServiceClient();
  const token = generateToken();

  // Invalidate any link already outstanding for this account. Requesting a
  // second reset should retire the first: otherwise an attacker who triggered
  // an earlier email can still use their link after the real user has asked for
  // a fresh one, which is precisely the moment the user is expecting the old
  // link to stop working.
  const { error: revokeError } = await svc
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  if (revokeError) {
    throw revokeError;
  }

  // expires_at is left to the column default: now() + 30 minutes, enforced in
  // the schema rather than computed here where the two could drift.
  const { error: insertError } = await svc
    .from("password_reset_tokens")
    .insert({ user_id: userId, token_hash: hashToken(token) });

  if (insertError) {
    throw insertError;
  }

  await recordSecurityEvent({
    userId,
    event: "password.reset_requested",
    detail: { delivery: "email" },
    ipAddress,
    userAgent,
  });

  const resetUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const result = await sendEmail({
    to: email,
    subject: "Reset your password",
    html: `
      <p>We received a request to reset your password.</p>
      <p>
        <a href="${resetUrl}"
           style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Reset password
        </a>
      </p>
      <p>This link can be used once and expires in 30 minutes.</p>
      <p>If you did not request this, you can ignore this email — your password will not change.</p>
    `,
    text:
      "We received a request to reset your password.\n\n" +
      "Reset password: " +
      resetUrl +
      "\n\nThis link can be used once and expires in 30 minutes.\n" +
      "If you did not request this, you can ignore this email — your password will not change.",
  });

  if (!result.success) {
    throw new Error(result.error ?? "Reset email could not be sent.");
  }
}