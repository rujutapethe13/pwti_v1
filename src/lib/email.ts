import "server-only";

import { serverEnv } from "@/config/env";
import { sendEmailGmail } from "./email/gmail/service";

const RESEND_API_URL = "https://api.resend.com/email";

export type EmailProviderName = "resend" | "gmail";

export interface EmailPayload {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  idempotencyKey?: string;
  eventType?: string;
  identifier?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
  provider?: EmailProviderName;
  statusCode?: number;
}

/**
 * Resolve the provider for a given event.
 *
 * Per-event override: `EMAIL_PROVIDER_<EVENTTYPE_UPPER>` (e.g.
 * `EMAIL_PROVIDER_AUTH=resend`) wins over the global `EMAIL_PROVIDER`.
 * This lets password-reset/changed emails stay on Resend while other
 * events use Gmail.
 */
export function providerFor(eventType?: string): EmailProviderName {
  // Per-event override: `EMAIL_PROVIDER_AUTH` applies to password-reset and
  // password-changed so those can stay on Resend while other events use Gmail.
  const normalized = eventType ? String(eventType).toLowerCase() : "";
  if (normalized === "password-reset" || normalized === "password-changed") {
    const authOverride = process.env.EMAIL_PROVIDER_AUTH;
    if (authOverride === "resend" || authOverride === "gmail") {
      return authOverride;
    }
  }
  if (eventType) {
    const envKey = `EMAIL_PROVIDER_${String(eventType)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "_")}`;
    const override = process.env[envKey];
    if (override === "resend" || override === "gmail") {
      return override;
    }
  }
  return (process.env.EMAIL_PROVIDER || "resend") as EmailProviderName;
}

/** Strip CR/LF from header-ish values to prevent header injection. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/\r\n|[\r\n]/g, " ");
}

/** Sanitize an array of header-ish values (to/cc/bcc/replyTo). */
export function sanitizeHeaderList(value: string | string[]): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.map((v) => sanitizeHeaderValue(String(v)).trim()).filter(Boolean);
}

/**
 * Email Service — provider dispatch.
 *
 * EMAIL_PROVIDER=resend (default): sends via the Resend REST API.
 * EMAIL_PROVIDER=gmail: sends via the Gmail API (users.messages.send) from
 * the provisioned personal Gmail account.
 *
 * Resend is left fully intact so the provider can be switched back at any
 * time without code changes.
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

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const provider = providerFor(payload.eventType);

  if (provider === "gmail") {
    try {
      return await sendEmailGmail({
        to: sanitizeHeaderList(payload.to),
        cc: payload.cc ? sanitizeHeaderList(payload.cc) : undefined,
        bcc: payload.bcc ? sanitizeHeaderList(payload.bcc) : undefined,
        subject: sanitizeHeaderValue(payload.subject),
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo ? sanitizeHeaderList(payload.replyTo) : undefined,
        idempotencyKey: payload.idempotencyKey,
        eventType: payload.eventType,
        identifier: payload.identifier,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[email] Gmail send failed:", message);
      return { success: false, error: message, provider: "gmail" };
    }
  }

  // ─── Resend path (unchanged behaviour) ───
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set — email not sent");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const from = payload.from ?? "Boards Hub <no-reply@powerweave.studio>";

  const body: Record<string, unknown> = {
    from,
    to: sanitizeHeaderList(payload.to),
    subject: sanitizeHeaderValue(payload.subject),
    html: payload.html,
  };

  if (payload.cc) {
    body.cc = sanitizeHeaderList(payload.cc);
  }
  if (payload.bcc) {
    body.bcc = sanitizeHeaderList(payload.bcc);
  }
  if (payload.text) {
    body.text = payload.text;
  }
  if (payload.replyTo) {
    body.reply_to = sanitizeHeaderList(payload.replyTo);
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      const message = `Resend API ${res.status}: ${detail}`;
      console.error("[email] Failed to send:", message);
      return { success: false, error: message, provider: "resend" };
    }

    const data = await res.json();
    return { success: true, id: data.id, provider: "resend" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Network error:", message);
    return { success: false, error: message, provider: "resend" };
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
