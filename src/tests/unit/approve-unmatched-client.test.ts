import { describe, expect, it, vi, beforeEach } from "vitest";

type ClientRow = { id: string; organization_id: string; canonical_name: string; needs_confirmation?: boolean; created_at?: string; updated_at?: string };
type AliasRow = { client_id: string; organization_id: string; alias_text: string; created_at?: string };

const store = {
  clients: [] as ClientRow[],
  aliases: [] as AliasRow[],
};

function reset() {
  store.clients = [];
  store.aliases = [];
}

function makeSupabase() {
  return {
    from(table: string) {
      if (table === "client_360_client_aliases") {
        return {
          select: () => ({
            eq: (_: string, orgId: string) => Promise.resolve({ data: store.aliases.filter((a) => a.organization_id === orgId), error: null }),
          }),
          insert: (row: AliasRow) => {
            const dup = store.aliases.find((a) => a.organization_id === row.organization_id && a.alias_text === row.alias_text);
            if (dup) return Promise.resolve({ error: { code: "23505", message: "duplicate" } as { code: string; message: string } });
            store.aliases.push({ ...row });
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "client_360_clients") {
        return {
          select: () => ({
            eq: (col1: string, val1: string) => ({
              eq: (col2: string, val2: string) => ({
                maybeSingle: () => {
                  const found = store.clients.find((c) => (c as Record<string, unknown>)[col1] === val1 && (c as Record<string, unknown>)[col2] === val2) || null;
                  return Promise.resolve({ data: found, error: null });
                },
              }),
              ilike: (_: string, name: string) => ({
                maybeSingle: () => Promise.resolve({ data: store.clients.find((c) => c.organization_id === val1 && String(c.canonical_name).toLowerCase() === String(name).toLowerCase()) || null, error: null }),
              }),
              maybeSingle: () => Promise.resolve({ data: store.clients.find((c) => (c as Record<string, unknown>)[col1] === val1) || null, error: null }),
            }),
          }),
          insert: (row: ClientRow) => {
            const dupCanon = store.clients.find((c) => c.organization_id === row.organization_id && c.canonical_name === row.canonical_name);
            if (dupCanon) return Promise.resolve({ error: { code: "23505", message: "duplicate canonical" } as { code: string; message: string } });
            const dupId = store.clients.find((c) => c.id === row.id);
            if (dupId) return Promise.resolve({ error: { code: "23505", message: "duplicate id" } as { code: string; message: string } });
            store.clients.push({ ...row });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => makeSupabase()),
}));

describe("approveUnmatchedClient", () => {
  beforeEach(() => {
    reset();
    vi.resetModules();
  });

  it("creates client and alias for create_new and is idempotent", async () => {
    const { approveUnmatchedClient } = await import("@/features/client-360/approve-client");
    const r1 = await approveUnmatchedClient({ organizationId: "org1", rawName: "  New   Client  ", mode: "create_new" });
    expect(r1.ok).toBe(true);
    expect(r1.action).toBe("created_client_and_alias");
    expect(store.clients).toHaveLength(1);
    expect(store.aliases).toHaveLength(1);
    expect(store.clients[0].canonical_name).toBe("New Client");
    expect(store.clients[0].needs_confirmation).toBe(false);
    expect(store.aliases[0].alias_text).toBe("New Client");

    const r2 = await approveUnmatchedClient({ organizationId: "org1", rawName: "new client", mode: "create_new" });
    expect(r2.ok).toBe(true);
    expect(r2.action).toBe("already_linked");
    expect(store.clients).toHaveLength(1);
    expect(store.aliases).toHaveLength(1);
  });

  it("aliases to existing client for alias_to and is idempotent", async () => {
    store.clients.push({ id: "c1", organization_id: "org1", canonical_name: "Safari", needs_confirmation: false });
    store.aliases.push({ client_id: "c1", organization_id: "org1", alias_text: "SAFARI" });
    const { approveUnmatchedClient } = await import("@/features/client-360/approve-client");
    const r1 = await approveUnmatchedClient({ organizationId: "org1", rawName: "Safari-Genie", mode: "alias_to", targetClientId: "c1" });
    expect(r1.ok).toBe(true);
    expect(r1.action).toBe("created_alias");
    expect(r1.clientId).toBe("c1");
    expect(store.aliases.filter((a) => a.organization_id === "org1")).toHaveLength(2);

    const r2 = await approveUnmatchedClient({ organizationId: "org1", rawName: "safari-genie", mode: "alias_to", targetClientId: "c1" });
    expect(r2.ok).toBe(true);
    expect(r2.action).toBe("already_linked");
    expect(store.aliases.filter((a) => a.organization_id === "org1")).toHaveLength(2);
  });

  it("rejects generic denylist names and cross-org/invalid targets", async () => {
    store.clients.push({ id: "c2", organization_id: "org2", canonical_name: "OtherOrg", needs_confirmation: false });
    const { approveUnmatchedClient } = await import("@/features/client-360/approve-client");
    const deny = await approveUnmatchedClient({ organizationId: "org1", rawName: "bag", mode: "create_new" });
    expect(deny.ok).toBe(false);
    const cross = await approveUnmatchedClient({ organizationId: "org1", rawName: "NewCo", mode: "alias_to", targetClientId: "c2" });
    expect(cross.ok).toBe(false);
  });
});
