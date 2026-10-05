import "server-only";

import { serverEnv } from "@/config/env";

/**
 * Email Service
 *
 * Sends emails via the Resend REST API using native fetch (no extra
 * dependencies required beyond a RESEND_API_KEY env var).
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import { sendEmail } from "@/lib/email";
 *   await sendEmail({
 *     to: "user@example.com",
 *     subject: "...",
 *     html: "<p>...</p>",
 *   });
 * ────────────────────────────────────────────────────────────
 */

const RESEND_API_URL = "https://api.resend.com/email";

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set — email not sent");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const from = payload.from ?? "Boards Hub <no-reply@powerweave.studio>";

  const body: Record<string, unknown> = {
    from,
    to: Array.isArray(payload.to) ? payload.to : [payload.to],
    subject: payload.subject,
    html: payload.html,
  };

  if (payload.text) {
    body.text = payload.text;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      const message = `Resend API ${res.status}: ${detail}`;
      console.error("[email] Failed to send:", message);
      return { success: false, error: message };
    }

    const data = await res.json();
    return { success: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Network error:", message);
    return { success: false, error: message };
  }
}

/**
 * Build a URL that an approver can use to approve an access request.
 * The token is stored in board_access_requests.response_token.
 */
export function buildApproveUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/boards/access-requests/approve?token=${token}`;
}

/**
 * Build a URL that an approver can use to deny an access request.
 */
export function buildDenyUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/boards/access-requests/deny?token=${token}`;
}
