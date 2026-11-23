import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Per-client invoice clearance setting (Client 360 → Billing → Payment terms).
 *
 * Stored on client_360_clients.payment_term_days:
 *   NULL = no invoice reminders for this client
 *   0    = same day
 *   >0   = days after the counted-from date (delivery date by default)
 */

export interface ClientPaymentTerm {
  clientId: string;
  canonicalName: string;
  paymentTermDays: number | null;
}

/**
 * Load every client in an organization with its payment term.
 *
 * `termsAvailable` is false when the payment_term_days column does not exist
 * yet (migration 20261118070000 not applied). Callers must treat that as "no
 * invoice reminders configured" rather than as an error: deadline alerts do not
 * depend on the column and must keep working.
 */
export async function loadClientDirectory(organizationId: string): Promise<{
  clients: ClientPaymentTerm[];
  termsAvailable: boolean;
}> {
  const supabase = await createServiceClient();

  const withTerms = await supabase
    .from("client_360_clients")
    .select("id, canonical_name, payment_term_days")
    .eq("organization_id", organizationId);

  if (!withTerms.error) {
    return { clients: (withTerms.data ?? []).map(toPaymentTerm), termsAvailable: true };
  }

  const missingColumn = /payment_term_days/.test(withTerms.error.message);
  if (!missingColumn) {
    console.error("[email-alerts] failed to load clients:", withTerms.error.message);
    return { clients: [], termsAvailable: false };
  }

  console.warn(
    "[email-alerts] client_360_clients.payment_term_days is missing — invoice reminders are off until migration 20261118070000 is applied",
  );
  const withoutTerms = await supabase
    .from("client_360_clients")
    .select("id, canonical_name")
    .eq("organization_id", organizationId);

  if (withoutTerms.error) {
    console.error("[email-alerts] failed to load clients:", withoutTerms.error.message);
    return { clients: [], termsAvailable: false };
  }

  return {
    clients: (withoutTerms.data ?? []).map((row) => ({
      clientId: row.id as string,
      canonicalName: (row.canonical_name as string) ?? "",
      paymentTermDays: null,
    })),
    termsAvailable: false,
  };
}

function toPaymentTerm(row: Record<string, unknown>): ClientPaymentTerm {
  return {
    clientId: row.id as string,
    canonicalName: (row.canonical_name as string) ?? "",
    paymentTermDays: typeof row.payment_term_days === "number" ? (row.payment_term_days as number) : null,
  };
}

export async function listClientPaymentTerms(
  organizationId: string,
): Promise<Map<string, ClientPaymentTerm>> {
  const { clients } = await loadClientDirectory(organizationId);
  return new Map(clients.map((client) => [client.clientId, client]));
}

export async function setClientPaymentTerm(
  organizationId: string,
  clientId: string,
  paymentTermDays: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(paymentTermDays ?? 0) || (paymentTermDays ?? 0) < 0 || (paymentTermDays ?? 0) > 3650) {
    return { ok: false, error: "Payment term must be a whole number of days between 0 and 3650" };
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("client_360_clients")
    .update({ payment_term_days: paymentTermDays, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .select("id");

  if (error) {
    console.error("[email-alerts] failed to save payment term:", error.message);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Client not found in this organization" };
  }
  return { ok: true };
}

/** Map a stored day count to the display label used in the billing UI. */
export function paymentTermLabel(days: number | null | undefined): string {
  if (days == null) return "Not added";
  if (days === 0) return "Immediate (same day)";
  if ([7, 15, 30, 45, 60].includes(days)) return `Net ${days}`;
  return `Custom (${days} days)`;
}