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
  node.lt = (column: string, value: unknown) => {
    filters[column] = [value];
    return node;
  }
  node.maybeSingle = () => {
    let data = rows[cleanTable]?.[0] ?? null;
    if (data && typeof data === "object") {
      for (const [column, allowed] of Object.entries(filters)) {
        if (!(column in data)) continue;
        const cell = data[column];
        const ref = allowed[0];
        let pass = true;
        if (column.endsWith("_at") || column === "window_start") {
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
    eq: () => ({
      select: () => Promise.resolve({ data: null, error: null }),
    }),
  });
  node.update = (payload: any) => ({
    eq: () => Promise.resolve({ data: null, error: null }),
  });
  node.delete = () => ({
    lt: () => Promise.resolve({ error: null }),
  });
  return node;
}

afterEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  vi.restoreAllMocks();
});

describe("rate-limit", () => {
  it("allows requests under the limit", async () => {
    const { checkRateLimit } = await import("@/lib/email/rate-limit");
    expect(await checkRateLimit("ip:1", 5, 3600)).toBe(true);
  });

  it("blocks requests over the limit", async () => {
    const { checkRateLimit } = await import("@/lib/email/rate-limit");
    rows["email_rate_limits"] = [
      {
        identifier: "ip:blocked",
        count: 5,
        window_start: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    expect(await checkRateLimit("ip:blocked", 5, 3600)).toBe(false);
  });

  it("resets the counter in a new window", async () => {
    const { checkRateLimit } = await import("@/lib/email/rate-limit");
    const old = new Date(Date.now() - 7200 * 1000).toISOString();
    rows["email_rate_limits"] = [
      {
        identifier: "ip:reset",
        count: 5,
        window_start: old,
        updated_at: old,
      },
    ];
    expect(await checkRateLimit("ip:reset", 5, 3600)).toBe(true);
  });
});
