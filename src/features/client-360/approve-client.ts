import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export const CLIENT_APPROVE_GENERIC_DENYLIST = new Set([
  "a", "apperals", "backpack", "bag", "bottle", "flatlay", "footwear", "product", "trolley bag",
  "item", "test", "na", "n/a", "none", "unknown", "-", "--", "client", "company", "sample",
]);

export function normalizeClientKey(value: string | null | undefined): string {
  return String(value ?? "").replace(/[\u2019']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeClientDisplay(value: string | null | undefined): string {
  return String(value ?? "").replace(/[\u2019']/g, "'").replace(/\s+/g, " ").trim();
}

export interface ApproveClientInput {
  organizationId: string;
  rawName: string;
  mode: "create_new" | "alias_to";
  targetClientId?: string | null;
}

export interface ApproveClientResult {
  ok: boolean;
  action?: "created_client_and_alias" | "created_alias" | "already_linked";
  clientId?: string;
  canonicalName?: string;
  aliasText?: string;
  error?: string;
}

function makeClientId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function approveUnmatchedClient(input: ApproveClientInput): Promise<ApproveClientResult> {
  const supabase = await createServiceClient();
  const organizationId = String(input.organizationId ?? "").trim();
  const rawName = normalizeClientDisplay(input.rawName);
  const aliasKey = normalizeClientKey(rawName);
  const mode = input.mode;

  if (!organizationId) return { ok: false, error: "organizationId is required" };
  if (!rawName) return { ok: false, error: "rawName is required" };
  if (!aliasKey || CLIENT_APPROVE_GENERIC_DENYLIST.has(aliasKey)) {
    return { ok: false, error: "rawName is not eligible for approval" };
  }
  if (mode !== "create_new" && mode !== "alias_to") {
    return { ok: false, error: "Invalid mode" };
  }

  // Idempotent: existing alias for this normalized text in org?
  const { data: existingAliases, error: eaErr } = await supabase
    .from("client_360_client_aliases")
    .select("client_id, alias_text")
    .eq("organization_id", organizationId);
  if (eaErr) throw eaErr;
  const existing = (existingAliases ?? []).find(a => normalizeClientKey(a.alias_text) === aliasKey);
  if (existing) {
    const { data: c } = await supabase.from("client_360_clients").select("id, canonical_name").eq("id", existing.client_id).eq("organization_id", organizationId).maybeSingle();
    return { ok: true, action: "already_linked", clientId: existing.client_id, canonicalName: c?.canonical_name ?? undefined, aliasText: existing.alias_text };
  }

  if (mode === "alias_to") {
    const targetClientId = String(input.targetClientId ?? "").trim();
    if (!targetClientId) return { ok: false, error: "targetClientId is required for alias_to" };
    const { data: target, error: tErr } = await supabase
      .from("client_360_clients")
      .select("id, canonical_name")
      .eq("id", targetClientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!target) return { ok: false, error: "Target client not found in organization" };

    const { error: insErr } = await supabase
      .from("client_360_client_aliases")
      .insert({ client_id: target.id, organization_id: organizationId, alias_text: rawName, created_at: new Date().toISOString() });
    if (insErr) {
      // race/idempotency
      if ((insErr as any).code === "23505") {
        return { ok: true, action: "already_linked", clientId: target.id, canonicalName: target.canonical_name, aliasText: rawName };
      }
      throw insErr;
    }
    return { ok: true, action: "created_alias", clientId: target.id, canonicalName: target.canonical_name, aliasText: rawName };
  }

  // create_new
  const clientId = makeClientId();
  const now = new Date().toISOString();
  const { error: cErr } = await supabase
    .from("client_360_clients")
    .insert({ id: clientId, organization_id: organizationId, canonical_name: rawName, needs_confirmation: false, created_at: now, updated_at: now });
  if (cErr) {
    // possible unique canonical_name conflict in org: fall back to aliasing to existing canonical if same normalized? but canonical_name unique constraint is (org, canonical_name)
    if ((cErr as any).code === "23505") {
      const { data: existingClient } = await supabase.from("client_360_clients").select("id,canonical_name").eq("organization_id", organizationId).ilike("canonical_name", rawName).maybeSingle();
      if (existingClient) {
        const { error: ins2 } = await supabase.from("client_360_client_aliases").insert({ client_id: existingClient.id, organization_id: organizationId, alias_text: rawName, created_at: now });
        if (ins2 && (ins2 as any).code !== "23505") throw ins2;
        return { ok: true, action: "created_alias", clientId: existingClient.id, canonicalName: existingClient.canonical_name, aliasText: rawName };
      }
    }
    throw cErr;
  }
  const { error: aErr } = await supabase
    .from("client_360_client_aliases")
    .insert({ client_id: clientId, organization_id: organizationId, alias_text: rawName, created_at: now });
  if (aErr) {
    if ((aErr as any).code !== "23505") throw aErr;
  }
  return { ok: true, action: "created_client_and_alias", clientId, canonicalName: rawName, aliasText: rawName };
}
