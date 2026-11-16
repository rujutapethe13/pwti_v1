import "server-only";

import { gmailTokenStore } from "./token-store";
import type { EmailResult, GmailSendInput } from "./types";

const GMAIL_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/me/messages/send";

/** Status codes we retry on (with backoff). */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

/**
 * Gmail API sender.
 *
 * Sends a single email via POST /gmail/v1/me/messages/send with a base64url
 * raw RFC 2822 message. Retries with backoff only on 429 / 5xx / network
 * errors; never retries on 4xx. Access token is refreshed automatically on
 * 401 (one retry).
 */
export class GmailSender {
  async send(input: GmailSendInput): Promise<EmailResult> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const cc = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : [];
    const bcc = input.bcc
      ? Array.isArray(input.bcc)
        ? input.bcc
        : [input.bcc]
      : [];
    const replyTo = input.replyTo
      ? Array.isArray(input.replyTo)
        ? input.replyTo
        : [input.replyTo]
      : [];

    const headers: Record<string, string> = {};
    headers["To"] = to.join(", ");
    if (cc.length) headers["Cc"] = cc.join(", ");
    if (bcc.length) headers["Bcc"] = bcc.join(", ");
    if (replyTo.length) headers["Reply-To"] = replyTo.join(", ");
    headers["Subject"] = input.subject;
    headers["MIME-Version"] = "1.0";
    headers["Content-Type"] = 'text/html; charset="UTF-8"';

    const headerBlock = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");

    const rawMessage = `${headerBlock}\r\n\r\n${input.html}`;
    const raw = Buffer.from(rawMessage, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    let lastError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const accessToken = await gmailTokenStore.getAccessToken();
        const res = await fetch(GMAIL_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { id?: string };
          return {
            success: true,
            id: data.id,
            provider: "gmail",
            statusCode: res.status,
          };
        }

        const status = res.status;
        const detail = await res.text().catch(() => "");

        // 401: access token invalid/expired -> refresh once and retry.
        if (status === 401 && attempt === 0) {
          lastError = new Error(`[email/gmail] Gmail 401: ${detail}`);
          continue;
        }

        // 429 / 5xx: retry with backoff (respect Retry-After).
        if (RETRYABLE_STATUS.has(status) && attempt < MAX_RETRIES) {
          const retryAfter = res.headers.get("retry-after");
          const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.backoff(attempt);
          lastError = new Error(`[email/gmail] Gmail ${status} (retryable): ${detail}`);
          await this.sleep(delayMs);
          continue;
        }

        // 4xx (incl. 400/403/404) or exhausted retries: no retry.
        return {
          success: false,
          error: `Gmail ${status}: ${detail}`,
          provider: "gmail",
          statusCode: status,
        };
      } catch (err: any) {
        if (attempt < MAX_RETRIES) {
          lastError = err;
          await this.sleep(this.backoff(attempt));
          continue;
        }
        return {
          success: false,
          error: err.message ?? String(err),
          provider: "gmail",
        };
      }
    }

    return {
      success: false,
      error: lastError?.message ?? "Gmail send failed",
      provider: "gmail",
    };
  }

  private backoff(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const gmailSender = new GmailSender();
