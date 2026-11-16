import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

const TABLE = "public.email_rate_limits";

/**
 * Fixed-window rate limiter keyed by identifier (IP or IP:recipient).
 *
 * allowed(maxPerWindow, windowSeconds): increments the counter for the
 * current window and returns whether the request is still under the limit.
 */

export const MAX_PER_WINDOW = 20;
export const WINDOW_SECONDS = 3600;

export async function checkRateLimit(
  identifier: string,
  maxPerWindow = MAX_PER_WINDOW,
  windowSeconds = WINDOW_SECONDS,
): Promise<boolean> {
  const svc = await createServiceClient();
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // Clean stale rows outside the window.
  await svc.from(TABLE).delete().lt("updated_at", windowStart);

  const { data, error } = await svc
    .from(TABLE)
    .select("count, window_start, updated_at")
    .eq("identifier", identifier)
    .maybeSingle();
  if (error) return true; // fail open

  if (!data) {
    await svc.from(TABLE).insert({
      identifier,
      count: 1,
      window_start: now,
      updated_at: now,
    });
    return true;
  }

  const row = data as { count: number; window_start: string; updated_at: string };
  const windowBegins = new Date(row.window_start).getTime();
  if (Date.now() - windowBegins >= windowSeconds * 1000) {
    // New window: reset counter.
    await svc
      .from(TABLE)
      .update({ count: 1, window_start: now, updated_at: now })
      .eq("identifier", identifier);
    return true;
  }

  if (row.count >= maxPerWindow) return false;

  await svc
    .from(TABLE)
    .update({ count: row.count + 1, updated_at: now })
    .eq("identifier", identifier);
  return true;
}

export async function recordRateLimit(
  identifier: string,
  increment = 1,
): Promise<void> {
  // Best-effort: ensure a row exists so subsequent checkRateLimit sees it.
  const svc = await createServiceClient();
  const now = new Date().toISOString();
  const { data } = await svc
    .from(TABLE)
    .select("count")
    .eq("identifier", identifier)
    .maybeSingle();
  if (!data) {
    await svc.from(TABLE).insert({
      identifier,
      count: increment,
      window_start: now,
      updated_at: now,
    });
  }
}
