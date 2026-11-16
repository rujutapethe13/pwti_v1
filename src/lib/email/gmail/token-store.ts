import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "./crypto";
import { checkRateLimit } from "../rate-limit";
import type { StoredTokens } from "./types";

const TABLE = "public.email_provider_tokens";
const TOKEN_ID = 1;

/** Buffer before access-token expiry at which we proactively refresh. */
const EXPIRY_BUFFER_SECONDS = 60;

/** Rate-limit key for unhealthy-provider alert emails (once per hour). */
const UNHEALTHY_ALERT_KEY = "gmail:unhealthy-alert";

/**
 * Persisted Gmail OAuth token store.
 *
 * Only one row exists (id = 1). The refresh token is stored encrypted;
 * the access token + expiry are cached plaintext (short-lived).
 *
 * IMPORTANT: Google does NOT return a new refresh_token on refresh. The
 * stored refresh token is preserved unless a new one is returned, and is
 * never overwritten with an empty value.
 *
 * A row-level CAS-style lock (refresh_locked_at) serializes refreshes so two
 * concurrent requests cannot both rotate the refresh token.
 */
export class GmailTokenStore {
  /**
   * Returns a valid access token, refreshing if expired or about to expire.
   * Throws if no refresh token has been provisioned (connect flow not run).
   *
   * On refresh failure with `invalid_grant` (revoked/expired refresh token)
   * the row is marked unhealthy and an alert is emailed to OWNER_EMAIL via
   * Resend (rate-limited to once per hour) so the admin can re-connect.
   */
  async getAccessToken(): Promise<string> {
    const svc = await createServiceClient();
    const row = await this.currentRow(svc);
    if (!row) {
      throw new Error(
        "[email/gmail] No Gmail refresh token provisioned. Run the admin connect flow (/api/admin/gmail/connect).",
      );
    }

    const expiresAt = row.access_token_expires_at
      ? new Date(row.access_token_expires_at).getTime()
      : 0;
    const now = Date.now();

    // Access token still valid (with buffer).
    if (row.access_token && expiresAt > now + EXPIRY_BUFFER_SECONDS * 1000) {
      return row.access_token;
    }

    // Acquire the row-level refresh lock (CAS). Only one request rotates.
    const locked = await this.tryAcquireLock(svc);
    if (!locked) {
      const refreshed = await this.currentRow(svc);
      const e2 = refreshed?.access_token_expires_at
        ? new Date(refreshed.access_token_expires_at).getTime()
        : 0;
      if (refreshed?.access_token && e2 > now + EXPIRY_BUFFER_SECONDS * 1000) {
        return refreshed.access_token;
      }
      throw new Error(
        "[email/gmail] Refresh token is locked by another request; retry shortly.",
      );
    }

    try {
      const refreshToken = decrypt(row.encrypted_refresh_token);
      const tokens = await refreshAccessToken(refreshToken);

      // Persist the new access token + expiry.
      const update: Record<string, unknown> = {
        access_token: tokens.access_token,
        access_token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        refresh_locked_at: null,
        updated_at: new Date().toISOString(),
      };

      // Google does not return a new refresh_token on refresh. Only overwrite
      // if Google actually returns one; never overwrite with empty.
      if (tokens.refresh_token) {
        update.encrypted_refresh_token = encrypt(tokens.refresh_token);
      }

      await svc.from(TABLE).update(update).eq("id", TOKEN_ID);

      return tokens.access_token;
    } catch (err: any) {
      const isInvalidGrant =
        /invalid_grant/.test(err.message ?? "") ||
        /invalid_grant/.test(String(err));

      await svc.from(TABLE).update({ refresh_locked_at: null }).eq("id", TOKEN_ID);

      if (isInvalidGrant) {
        await this.markUnhealthy(
          svc,
          "invalid_grant: Gmail refresh token revoked or expired",
        );
        await this.sendUnhealthyAlert();
      }
      throw err;
    }
  }

  /** Provision tokens after the admin OAuth connect flow. */
  async provision(tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }): Promise<void> {
    const svc = await createServiceClient();
    const update: Record<string, unknown> = {
      id: TOKEN_ID,
      provider: "gmail",
      access_token: tokens.access_token,
      access_token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      refresh_locked_at: null,
      updated_at: new Date().toISOString(),
    };

    if (tokens.refresh_token) {
      update.encrypted_refresh_token = encrypt(tokens.refresh_token);
    }

    await svc.from(TABLE).upsert(update, { onConflict: "id" });
  }

  /** Whether a refresh token is currently provisioned. */
  async isProvisioned(): Promise<boolean> {
    const row = await this.currentRow(await createServiceClient());
    return !!row?.encrypted_refresh_token;
  }

  async markUnhealthy(svc: any, reason: string): Promise<void> {
    await svc
      .from(TABLE)
      .update({
        provider_unhealthy: true,
        unhealthy_at: new Date().toISOString(),
        unhealthy_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", TOKEN_ID);
  }

  async isUnhealthy(): Promise<boolean> {
    const row = await this.currentRow(await createServiceClient());
    return !!row?.provider_unhealthy;
  }

  /**
   * Send an admin alert email to OWNER_EMAIL via Resend (direct REST call,
   * never via Gmail to avoid a failure loop). Rate-limited to once per hour.
   */
  async sendUnhealthyAlert(): Promise<void> {
    const ownerEmail = process.env.OWNER_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;
    if (!ownerEmail || !resendKey) return;

    const allowed = await checkRateLimit(UNHEALTHY_ALERT_KEY, 1, 3600);
    if (!allowed) return;

    const row = await this.currentRow(await createServiceClient());
    const reason = row?.unhealthy_reason ?? "refresh token invalid";

    try {
      await fetch("https://api.resend.com/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.GMAIL_SENDER ??
            "Powerweave Studio <no-reply@powerweave.studio>",
          to: [ownerEmail],
          subject: "[PowerWeave] Gmail email provider unhealthy",
          html: `<p>The Gmail email provider is unhealthy.</p><p>Reason: ${reason}</p><p>Re-run the admin connect flow at /api/admin/gmail/connect to re-authorize the Gmail account.</p>`,
          text: `The Gmail email provider is unhealthy.\nReason: ${reason}\nRe-run the admin connect flow at /api/admin/gmail/connect to re-authorize the Gmail account.`,
        }),
      });
    } catch {
      // Best-effort alert; never throw into the refresh path.
    }
  }

  private async currentRow(svc: any): Promise<StoredTokens | null> {
    const { data, error } = await svc
      .from(TABLE)
      .select("*")
      .eq("id", TOKEN_ID)
      .maybeSingle();
    if (error || !data) return null;
    return data as StoredTokens;
  }

  /**
   * Row-level CAS lock: set refresh_locked_at only if it is currently free
   * (null) or stale (older than 10 minutes). Returns true if we won the lock.
   */
  private async tryAcquireLock(svc: any): Promise<boolean> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data, error, count } = await svc
      .from(TABLE)
      .update({ refresh_locked_at: new Date().toISOString() })
      .eq("id", TOKEN_ID)
      .or(`refresh_locked_at.is.null,refresh_locked_at.lt.${tenMinutesAgo}`)
      .select("id");
    if (error) return false;
    return (count ?? data?.length ?? 0) > 0;
  }
}

export const gmailTokenStore = new GmailTokenStore();

/**
 * Exchange a refresh token for a new access token via Google's token endpoint.
 *
 * Google does not rotate refresh tokens; a new refresh_token is only
 * returned on re-authorization with prompt=consent.
 */
async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "[email/gmail] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set",
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `[email/gmail] Token refresh failed (HTTP ${res.status}): ${detail}`,
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(
      `[email/gmail] Token refresh returned no access_token: ${data.error ?? data.error_description ?? "unknown"}`,
    );
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 3600,
  };
}
