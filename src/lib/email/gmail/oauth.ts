import "server-only";

import { createHash } from "node:crypto";

/**
 * Gmail OAuth helpers for the admin connect flow.
 *
 * Authorization endpoint: https://accounts.google.com/o/oauth2/v2/auth
 * Token endpoint: https://oauth2.googleapis.com/token
 *
 * Scopes: gmail.send (send email), userinfo.email (verify the account).
 * access_type=offline to receive a refresh token; prompt=consent to ensure
 * one is issued on first connect.
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SCOPES =
  "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

function requireClient() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "[email/gmail] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set",
    );
  }
  return { clientId: CLIENT_ID!, clientSecret: CLIENT_SECRET! };
}

/** PKCE code verifier (43–128 chars, [A-Za-z0-9\-._~]). */
export function makeCodeVerifier(): string {
  const buf = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(buf)
    .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 64])
    .join("");
}

/** PKCE code challenge = base64url(sha256(verifier)), no padding. */
export function makeCodeChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier).digest();
  return Buffer.from(digest)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build the Google authorize URL for the admin connect flow. */
export function buildAuthorizeUrl({
  redirectUri,
  state,
  codeChallenge,
}: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  requireClient();
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens (first connect).
 * Returns { access_token, refresh_token?, expires_in }.
 */
export async function exchangeCodeForTokens({
  code,
  redirectUri,
  codeVerifier,
}: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  requireClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `[email/gmail] OAuth token exchange failed (HTTP ${res.status}): ${detail}`,
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
      `[email/gmail] OAuth exchange returned no access_token: ${data.error ?? data.error_description ?? "unknown"}`,
    );
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 3600,
  };
}

/** Generate a cryptographically random state value. */
export function makeState(): string {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Short-lived state store (in DB) to prevent CSRF on the connect flow. */
const STATE_TABLE = "public.email_oauth_state";

export async function storeOAuthState(state: string, ttlSeconds = 600) {
  const svc = await (await import("@/lib/supabase/server")).createServiceClient();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await svc.from(STATE_TABLE).upsert(
    { state, expires_at: expiresAt, created_at: new Date().toISOString() },
    { onConflict: "state" },
  );
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  const svc = await (await import("@/lib/supabase/server")).createServiceClient();
  const { data, error } = await svc
    .from(STATE_TABLE)
    .select("expires_at")
    .eq("state", state)
    .maybeSingle();
  if (error || !data) return false;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return false;
  await svc.from(STATE_TABLE).delete().eq("state", state);
  return true;
}

/**
 * Call GET https://www.googleapis.com/oauth2/v2/userinfo to retrieve the
 * authenticated account's email. Used after the OAuth exchange to verify the
 * connected account matches GMAIL_SENDER.
 */
export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `[email/gmail] GET userinfo failed (HTTP ${res.status}): ${detail}`,
    );
  }
  const data = (await res.json()) as { email?: string };
  return data.email ?? "";
}
