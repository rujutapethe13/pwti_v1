import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: (table: string) => queryMock(table),
  }),
}));

const rows: Record<string, any[]> = {};

function queryMock(table: string) {
  const cleanTable = table.replace(/^public\./, "");
  const filters: Record<string, unknown[]> = {};
  const node: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "range"]) {
    node[method] = () => node;
  }
  node.eq = (column: string, value: unknown) => {
    filters[column] = [value];
    return node;
  };
  node.gt = (column: string, value: unknown) => {
    filters[column] = [value];
    return node;
  };
  node.maybeSingle = () => {
    let data = rows[cleanTable]?.[0] ?? null;
    if (data && typeof data === "object") {
      for (const [column, allowed] of Object.entries(filters)) {
        if (!(column in data)) continue;
        const cell = data[column];
        const ref = allowed[0];
        let pass = true;
        if (column.endsWith("_at") || column === "expires_at") {
          // gt on a timestamp: cell must be > ref.
          pass = String(cell) > String(ref);
        } else {
          pass = allowed.includes(cell);
        }
        if (!pass) {
          data = null;
          break;
        }
      }
    }
    return Promise.resolve({ data, error: null });
  };
  node.insert = (payload: any) => ({
    select: () => ({
      single: () =>
        Promise.resolve({ data: { ...payload, id: "test-id" }, error: null }),
    }),
  });
  node.upsert = (payload: any) => ({
    select: () => ({
      single: () =>
        Promise.resolve({ data: { ...payload, id: "test-id" }, error: null }),
    }),
  });
  node.update = (payload: any) => ({
    eq: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "test-id" }, error: null }),
      }),
    }),
  });
  node.delete = () => ({
    eq: () => Promise.resolve({ error: null }),
    lt: () => Promise.resolve({ error: null }),
  });
  return node;
}

afterEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  vi.restoreAllMocks();
});

describe("idempotency", () => {
  it("returns true when an unexpired key exists (duplicate send skipped)", async () => {
    rows["email_idempotency_keys"] = [
      {
        key: "dup-key",
        event_type: "test",
        recipient: "a@b.com",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ];
    const { checkIdempotency } = await import("@/lib/email/idempotency");
    expect(await checkIdempotency("dup-key")).toBe(true);
  });

  it("returns false when the key is expired", async () => {
    rows["email_idempotency_keys"] = [
      {
        key: "expired-key",
        event_type: "test",
        recipient: "a@b.com",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    ];
    const { checkIdempotency } = await import("@/lib/email/idempotency");
    expect(await checkIdempotency("expired-key")).toBe(false);
  });

  it("records and then blocks a duplicate key", async () => {
    const { recordIdempotency, checkIdempotency } = await import(
      "@/lib/email/idempotency"
    );
    await recordIdempotency("new-key", "test-event", "a@b.com", 86400);
    rows["email_idempotency_keys"] = [
      {
        key: "new-key",
        event_type: "test-event",
        recipient: "a@b.com",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ];
    expect(await checkIdempotency("new-key")).toBe(true);
  });
});
