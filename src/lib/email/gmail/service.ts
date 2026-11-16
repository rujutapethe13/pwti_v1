import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { gmailSender } from "./sender";
import { gmailTokenStore } from "./token-store";
import { checkIdempotency, recordIdempotency } from "../idempotency";
import { checkRateLimit, recordRateLimit } from "../rate-limit";
import type { EmailResult, GmailSendInput } from "./types";

const TABLE = "public.email_notification_logs";

/**
 * Gmail email service facade.
 *
 * sendEmail({ to, cc?, bcc?, subject, html, text?, replyTo?, idempotencyKey?, eventType?, identifier? })
 *
 * Behavior:
 *  - Checks idempotency key (skip if already sent within TTL).
 *  - Checks rate limit per identifier (IP + recipient).
 *  - Sends via Gmail POST /messages/send with refresh-token preservation + retry.
 *  - Logs outcome to email_notification_logs (status pending/sent/failed).
 *  - Never returns or logs tokens/secrets/full message bodies.
 */
export async function sendEmailGmail(input: GmailSendInput & {
  eventType?: string;
  identifier?: string;
}): Promise<EmailResult> {
  const eventType = input.eventType ?? "gmail";
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const identifier = input.identifier ?? "gmail:system";

  const idempotencyKey =
    input.idempotencyKey ??
    (await defaultIdempotencyKey(eventType, recipients[0], input.subject));
  const alreadySent = await checkIdempotency(idempotencyKey);
  if (alreadySent) {
    return {
      success: true,
      id: "idempotent-skip",
      provider: "gmail",
      error: undefined,
    };
  }

  const rateKey = `${identifier}:${recipients[0]}`;
  const allowed = await checkRateLimit(rateKey);
  if (!allowed) {
    await recordIdempotency(idempotencyKey, eventType, recipients[0], 86400);
    return {
      success: false,
      error: "Rate limited",
      provider: "gmail",
      statusCode: 429,
    };
  }

  const svc = await createServiceClient();
  const log = await svc
    .from(TABLE)
    .insert({
      board_id: "gmail",
      job_id: idempotencyKey,
      receiver_email: recipients[0],
      status: "pending",
      retry_count: 0,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (log.error) throw log.error;
  const logId = log.data?.id;

  try {
    const result = await gmailSender.send(input);

    const status = result.success ? "sent" : "failed";
    if (logId) {
      await svc
        .from(TABLE)
        .update({
          status,
          error: result.error ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    if (result.success) {
      await recordIdempotency(idempotencyKey, eventType, recipients[0], 86400);
      await recordRateLimit(rateKey, 1);
    }

    return result;
  } catch (err: any) {
    if (logId) {
      await svc
        .from(TABLE)
        .update({
          status: "failed",
          error: err.message ?? String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return {
      success: false,
      error: err.message ?? String(err),
      provider: "gmail",
    };
  }
}

/** Default idempotency key = sha256(eventType + recipient + subject). */
async function defaultIdempotencyKey(
  eventType: string,
  recipient: string,
  subject: string,
): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(`${eventType}|${recipient.toLowerCase().trim()}|${subject}`)
    .digest("hex");
}

export const emailGmailService = { sendEmailGmail };
