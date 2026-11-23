"use server";

import { getSessionIdentity } from "@/lib/rbac/resolve";
import { getUserOrganizationId } from "@/lib/organization";
import { setClientPaymentTerm } from "@/features/email-alerts/settings";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Persist a client's invoice-clearance payment term (Client 360 → Billing).
 *
 * Admin-only, mirroring the approve-client action: the session role must be
 * 'admin' (the same permission the rest of Client 360 administration uses).
 * NULL/empty disables invoice reminders for the client.
 */
export async function setClientPaymentTermAction(input: {
  clientId: string;
  paymentTermDays: number | null;
  organizationId?: string;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const identity = await getSessionIdentity();
    if (!identity) return { ok: false, error: "Not authenticated", status: 401 };
    if (identity.role !== "admin") return { ok: false, error: "Admin access required", status: 403 };

    const orgId = input.organizationId || identity.organizationId || (await getUserOrganizationId());
    if (!orgId) return { ok: false, error: "Unable to determine organization", status: 400 };

    if (identity.organizationId && input.organizationId && identity.organizationId !== input.organizationId) {
      return { ok: false, error: "Organization mismatch", status: 403 };
    }

    const result = await setClientPaymentTerm(orgId, input.clientId, input.paymentTermDays);
    if (result.ok) {
      const supabase = await createServiceClient();
      const { error: auditError } = await supabase.from("activity_logs").insert({
        organization_id: orgId,
        actor_user_id: identity.userId,
        action: "client.payment_terms_changed",
        payload: {
          client_id: input.clientId,
          payment_term_days: input.paymentTermDays,
        },
      });
      if (auditError) console.error("Failed to write payment-term audit log:", auditError.message);
    }
    return { ...result, status: result.ok ? 200 : 400 };
  } catch (err) {
    console.error("setClientPaymentTermAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save payment term",
      status: 500,
    };
  }
}