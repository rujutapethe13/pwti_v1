"use server";

import { getSessionIdentity } from "@/lib/rbac/resolve";
import { getUserOrganizationId } from "@/lib/organization";
import { approveUnmatchedClient, type ApproveClientInput, type ApproveClientResult } from "@/features/client-360/approve-client";

export async function approveUnmatchedClientAction(
  input: Omit<ApproveClientInput, "organizationId"> & { organizationId?: string },
): Promise<ApproveClientResult & { status?: number }> {
  try {
    const identity = await getSessionIdentity();
    if (!identity) return { ok: false, error: "Not authenticated", status: 401 };
    if (identity.role !== "admin") return { ok: false, error: "Admin access required", status: 403 };

    const orgId = input.organizationId || identity.organizationId || (await getUserOrganizationId());
    if (!orgId) return { ok: false, error: "Unable to determine organization", status: 400 };

    if (identity.organizationId && input.organizationId && identity.organizationId !== input.organizationId) {
      return { ok: false, error: "Organization mismatch", status: 403 };
    }

    const result = await approveUnmatchedClient({
      organizationId: orgId,
      rawName: input.rawName,
      mode: input.mode,
      targetClientId: input.targetClientId,
    });
    return { ...result, status: result.ok ? 200 : 400 };
  } catch (err) {
    console.error("approveUnmatchedClientAction failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed to approve client", status: 500 };
  }
}
