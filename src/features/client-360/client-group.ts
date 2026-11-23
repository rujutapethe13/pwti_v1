import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export const CLIENT_ALIAS_GROUPS: Record<string, string[]> = {
  "nasher miles": ["nasher mile", "nasher miles"],
  bioweaves: ["bioweave", "bioweaves"],
  labbada: ["labada", "labbada"],
  "papa don't preach": ["papa don,t peach", "papa dont peach", "papa don't preach"],
  levis: ["levi's", "levis strauss & co", "levis strauss and co", "levis"],
  safari: ["safari select", "safari-genie", "safari"],
};

export function normalizeClient(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function aliasGroup(value: string): string[] {
  return (
    Object.values(CLIENT_ALIAS_GROUPS).find((group) =>
      group.some((name) => normalizeClient(name) === normalizeClient(value)),
    ) ?? [value]
  );
}

export interface ClientGroup {
  ids: Set<string>;
  paymentTermDays: number | null;
  canonicalName: string | null;
}

/**
 * Resolve a selected client_360 client id into every alias/canonical sibling id
 * in the same group, plus the stored client payment term. Every Client 360 job
 * count (card, tile, drawer) goes through this so the numbers always match.
 */
export async function resolveClientGroup(
  organizationId: string,
  clientId: string,
): Promise<ClientGroup> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("client_360_clients")
    .select("id, canonical_name, payment_term_days")
    .eq("organization_id", organizationId);

  if (error || !data) {
    return { ids: new Set([clientId]), paymentTermDays: null, canonicalName: null };
  }

  const requested = data.find((client) => String(client.id) === clientId);
  if (!requested) {
    return { ids: new Set([clientId]), paymentTermDays: null, canonicalName: null };
  }

  const names = aliasGroup(String(requested.canonical_name ?? ""));
  const ids = new Set(
    data
      .filter((client) =>
        names.some(
          (name) => normalizeClient(name) === normalizeClient(String(client.canonical_name ?? "")),
        ),
      )
      .map((client) => String(client.id)),
  );
  if (ids.size === 0) ids.add(clientId);

  return {
    ids,
    paymentTermDays:
      typeof requested.payment_term_days === "number"
        ? (requested.payment_term_days as number)
        : null,
    canonicalName: (requested.canonical_name as string) ?? null,
  };
}
