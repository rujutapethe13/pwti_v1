import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

let supabaseUpdates: any[] = [];
let supabaseRow: any = {
  id: 1,
  encrypted_refresh_token: "enc(test-refresh-token)",
  access_token: "old-access",
  access_token_expires_at: new Date(Date.now() - 10000).toISOString(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: (table: string) => {
      if (table === "public.email_provider_tokens") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: supabaseRow, error: null }),
            }),
          }),
          update: (payload: any) => {
            supabaseUpdates.push(payload);
            return {
              eq: () => {
                return {
                  or: () => {
                    return {
                      select: () =>
                        Promise.resolve({
                          data: [{ id: 1 }],
                          error: null,
                          count: 1,
                        }),
                    };
                  },
                  select: () =>
                    Promise.resolve({ data: null, error: null }),
                };
              },
              select: () => Promise.resolve({ data: null, error: null }),
            };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    },
  }),
}));

vi.mock("@/lib/email/gmail/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => {
    if (s.startsWith("enc(") && s.endsWith(")")) return s.slice(4, -1);
    throw new Error("[email/gmail] malformed ciphertext");
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch as any;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.EMAIL_ENCRYPTION_KEY;
  supabaseUpdates = [];
  supabaseRow = {
    id: 1,
    encrypted_refresh_token: "enc(test-refresh-token)",
    access_token: "old-access",
    access_token_expires_at: new Date(Date.now() - 10000).toISOString(),
  };
});

async function importStore() {
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.EMAIL_ENCRYPTION_KEY =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  return await import("@/lib/email/gmail/token-store");
}

describe("gmail token-store refresh behaviour", () => {
  it("keeps the stored refresh token when Google returns none on refresh", async () => {
    global.fetch = vi.fn(async (): Promise<Response> => {
      return new Response(
        JSON.stringify({ access_token: "new-access", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;

    const mod = await importStore();
    await mod.gmailTokenStore.getAccessToken();

    const payload = supabaseUpdates.find((u) => "access_token" in u);
    expect(payload).toBeDefined();
    // Google returned no refresh_token: encrypted_refresh_token must NOT be
    // overwritten (and never set to empty).
    expect(payload.encrypted_refresh_token).toBeUndefined();
  });

  it("persists a new refresh token when Google returns one", async () => {
    global.fetch = vi.fn(async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "NEW-REFRESH",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;

    const mod = await importStore();
    await mod.gmailTokenStore.getAccessToken();

    const payload = supabaseUpdates.find((u) => "access_token" in u);
    expect(payload).toBeDefined();
    expect(typeof payload.encrypted_refresh_token).toBe("string");
  });
});
