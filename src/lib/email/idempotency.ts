import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

const TABLE = "public.email_idempotency_keys";

/**
 * Idempotency guard for email sends.
 *
 * key = sha256(eventType + recipient + submission/payload hash).
 * Rows carry expires_at (TTL). A key present and unexpired means the
 * email was already sent; skip to avoid duplicates.
 */

export async function checkIdempotency(key: string): Promise<boolean> {
  const svc = await createServiceClient();
  const { data, error } = await svc
    .from(TABLE)
    .select("id")
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function recordIdempotency(
  key: string,
  eventType: string,
  recipient: string,
  ttlSeconds: number,
): Promise<void> {
  const svc = await createServiceClient();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await svc
    .from(TABLE)
    .upsert(
      {
        key,
        event_type: eventType,
        recipient: recipient.toLowerCase().trim(),
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
}
