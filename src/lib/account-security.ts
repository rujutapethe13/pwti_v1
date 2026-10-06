import "server-only";

import { cookies } from "next/headers";
import { createClient as createStatelessSupabaseClient } from "@supabase/supabase-js";

import { clientEnv } from "@/config/env";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Account security operations.
 *
 * Everything here runs with the service role and is called only from
 * /api/auth/*. The service key bypasses RLS, which is precisely why no client
 * may reach this module: it reads password hashes and writes the security
 * log. The caller is responsible for having authenticated the request first.
 */

/** 5 attempts per 15 minutes, per user, per action. */
export const CHANGE_PASSWORD_MAX_ATTEMPTS = 5;
export const CHANGE_PASSWORD_WINDOW_SECONDS = 15 * 60;

/**
 * Retired hashes kept for reuse rejection: three, which together with the live
 * credential row is the "current plus last 3" window.
 */
export const PASSWORD_HISTORY_DEPTH = 3;

export const RATE_LIMIT_ACTION_CHANGE_PASSWORD = "change_password";
export const RATE_LIMIT_ACTION_FORGOT_PASSWORD = "forgot_password";

export interface PasswordState {
  /** False for an account created through Google/SSO, which has no password to change. */
  hasPassword: boolean;
  /** Null when the account predates account_credentials; the date is genuinely unknown. */
  passwordChangedAt: string | null;
}

export interface RateLimitState {
  allowed: boolean;
  attemptsUsed: number;
  lockedUntil: string | null;
}

/**
 * Reads the caller's own password state through the RPC, which is what can see
 * auth.users.
 *
 * Deliberately the cookie client, not the service client: the RPC identifies the
 * caller with auth.uid(), which resolves to NULL under service_role because that
 * key carries no end-user JWT. Using the service client here would silently
 * report every account as having no password, which would show "Set a password"
 * to users who do have one and ask an SSO-only user to set a password they
 * already have.
 */
export async function getPasswordStateForSelf(): Promise<PasswordState> {
  const supabase = await createClient(await cookies());

  const { data, error } = await supabase.rpc("account_password_state");

  if (error) {
    console.error("[account-security] account_password_state failed:", error.message);
    // Degraded rather than blocked: the settings page still renders.
    return { hasPassword: true, passwordChangedAt: null };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { has_password?: boolean; password_changed_at?: string | null }
    | null;

  return {
    hasPassword: row?.has_password === true,
    passwordChangedAt: row?.password_changed_at ?? null,
  };
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const svc = await createServiceClient();

  const { data, error } = await svc
    .from("profiles")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[account-security] profile lookup failed:", error.message);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

/**
 * Verify a password against GoTrue, without touching the caller's session.
 *
 * Needed only for accounts that predate account_credentials: there is no local
 * hash to compare against yet. Uses a client with no storage adapter, so the
 * session GoTrue mints in response is never persisted anywhere and cannot
 * displace the caller's real one.
 *
 * This does create one short-lived auth.sessions row per call. That is bounded
 * by the endpoint's own rate limit, and it happens at most once per account —
 * the route writes a credential row on the first successful change.
 */
export async function verifyPasswordAgainstGoTrue(
  email: string,
  password: string,
): Promise<boolean> {
  const authClient = createStatelessSupabaseClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    },
  );

  const { data, error } = await authClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  // Nothing is persisted (persistSession: false), so the returned session is
  // discarded simply by dropping the reference.
  void data;

  return !error;
}

/** The live hash plus the retired ones, in the order reuse rejection checks them. */
export async function loadCredentialHashes(
  userId: string,
): Promise<{ current: string | null; previous: string[] }> {
  const svc = await createServiceClient();

  const [{ data: credential, error: credentialError }, { data: history, error: historyError }] =
    await Promise.all([
      svc
        .from("account_credentials")
        .select("password_hash")
        .eq("user_id", userId)
        .maybeSingle(),
      svc
        .from("account_password_history")
        .select("password_hash")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PASSWORD_HISTORY_DEPTH),
    ]);

  if (credentialError) {
    console.error("[account-security] credential read failed:", credentialError.message);
  }

  if (historyError) {
    console.error("[account-security] password history read failed:", historyError.message);
  }

  return {
    current: (credential?.password_hash as string | undefined) ?? null,
    previous: ((history ?? []) as Array<{ password_hash: string }>).map(
      (row) => row.password_hash,
    ),
  };
}

/**
 * Write the new hash, retire the old one, prune history.
 *
 * Returns the ISO timestamp now recorded as password_changed_at, so the caller
 * reports the same instant the database holds rather than a fresh `now()` that
 * could disagree by a few milliseconds.
 */
export async function persistNewPassword(
  userId: string,
  newHash: string,
): Promise<string> {
  const svc = await createServiceClient();
  const changedAt = new Date().toISOString();

  const { data: existing, error: readError } = await svc
    .from("account_credentials")
    .select("password_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const outgoingHash = existing?.password_hash as string | undefined;

  if (outgoingHash) {
    const { error: historyError } = await svc
      .from("account_password_history")
      .insert({ user_id: userId, password_hash: outgoingHash });

    if (historyError) {
      throw historyError;
    }
  }

  const { error: upsertError } = await svc.from("account_credentials").upsert(
    {
      user_id: userId,
      password_hash: newHash,
      password_changed_at: changedAt,
      updated_at: changedAt,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    throw upsertError;
  }

  await prunePasswordHistory(svc, userId);

  return changedAt;
}

async function prunePasswordHistory(
  svc: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
): Promise<void> {
  const { data, error } = await svc
    .from("account_password_history")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[account-security] history prune read failed:", error.message);
    return;
  }

  const excessIds = ((data ?? []) as Array<{ id: string }>)
    .slice(PASSWORD_HISTORY_DEPTH)
    .map((row) => row.id);

  if (excessIds.length === 0) return;

  const { error: deleteError } = await svc
    .from("account_password_history")
    .delete()
    .in("id", excessIds);

  if (deleteError) {
    console.error("[account-security] history prune delete failed:", deleteError.message);
  }
}

export async function getRateLimitState(
  userId: string,
  action: string,
  maxAttempts: number = CHANGE_PASSWORD_MAX_ATTEMPTS,
  windowSeconds: number = CHANGE_PASSWORD_WINDOW_SECONDS,
): Promise<RateLimitState> {
  const svc = await createServiceClient();

  const { data, error } = await svc.rpc("account_rate_limit_state", {
    p_user_id: userId,
    p_action: action,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail open on a database error rather than locking every user out of
    // changing their password because the ledger is briefly unreadable.
    console.error("[account-security] rate limit read failed:", error.message);
    return { allowed: true, attemptsUsed: 0, lockedUntil: null };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: boolean; attempts_used?: number; locked_until?: string | null }
    | null;

  return {
    allowed: row?.allowed !== false,
    attemptsUsed: row?.attempts_used ?? 0,
    lockedUntil: row?.locked_until ?? null,
  };
}

export async function recordRateLimitEvent(
  userId: string,
  action: string,
  succeeded: boolean,
): Promise<void> {
  const svc = await createServiceClient();

  const { error } = await svc.rpc("account_record_rate_limit_event", {
    p_user_id: userId,
    p_action: action,
    p_succeeded: succeeded,
  });

  if (error) {
    console.error("[account-security] rate limit write failed:", error.message);
  }
}

export interface SecurityEventInput {
  userId: string;
  event: string;
  /** Context only. Never a password or a hash. */
  detail?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordSecurityEvent({
  userId,
  event,
  detail,
  ipAddress,
  userAgent,
}: SecurityEventInput): Promise<void> {
  const svc = await createServiceClient();

  const { error } = await svc.from("account_security_events").insert({
    user_id: userId,
    event,
    detail: detail ?? {},
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  });

  if (error) {
    console.error("[account-security] failed to log", event, error.message);
  }
}

/**
 * Mirror a security event into activity_logs so it shows up in the Overview
 * feed alongside everything else.
 *
 * Best effort by design. activity_logs requires an organization_id, and a user
 * may belong to none — account_security_events is the authoritative record and
 * this is a convenience. Never let a failed insert fail the request.
 */
export async function recordActivityFeedEntry({
  userId,
  action,
  payload,
}: {
  userId: string;
  action: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const svc = await createServiceClient();

    const { data: membership, error: membershipError } = await svc
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("[account-security] org lookup failed:", membershipError.message);
      return;
    }

    const organizationId = membership?.organization_id as string | undefined;

    if (!organizationId) {
      // No organization to attribute the event to. The security log has it.
      return;
    }

    const { error } = await svc.from("activity_logs").insert({
      organization_id: organizationId,
      actor_user_id: userId,
      action,
      payload,
    });

    if (error) {
      console.error("[account-security] activity_logs insert failed:", error.message);
    }
  } catch (err) {
    console.error("[account-security] activity feed mirror threw:", err);
  }
}

/**
 * Revoke every refresh token for the user. No session is preserved.
 *
 * Only the reset-by-token path uses this, and only because the caller there is
 * not signed in — so there is no "current" session worth keeping, and signing
 * out everywhere is the correct response to a recovery link being redeemed.
 *
 * The change-password path must NOT use this: it revokes "all except mine"
 * through Supabase's own `signOut({ scope: 'others' })`, which is the supported
 * API and needs no direct access to auth.sessions.
 *
 * Returns the number of sessions revoked.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const svc = await createServiceClient();

  const { data, error } = await svc.rpc("revoke_all_sessions", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[account-security] revoke_all_sessions failed:", error.message);
    return 0;
  }

  return typeof data === "number" ? data : 0;
}

/** Best-effort client IP, honouring the first entry of a proxy chain. */
export function readClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return headers.get("x-real-ip") ?? null;
}