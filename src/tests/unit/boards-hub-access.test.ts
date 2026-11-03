import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createServiceClient, createClient, tableResults, rpcResults } = vi.hoisted(() => {
  const rpcResults = new Map<string, unknown>();
  const tables = new Map<string, { data: unknown; error: { message: string } | null }>();

  type QueryResult = { data: unknown; error: { message: string } | null };
  interface Chain {
    select: () => Chain;
    eq: () => Chain;
    neq: () => Chain;
    in: () => Chain;
    order: () => Chain;
    maybeSingle: () => Promise<QueryResult>;
  }

  let authUser = { id: "user-1", email: "u@example.com" };

  function chainFor(table: string) {
    const result = () => Promise.resolve(tables.get(table) ?? { data: null, error: null });
    const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    order: () => chain,
    maybeSingle: result,
  };
    return chain;
  }

  function makeSupabaseClient() {
    return {
      auth: { getUser: () => Promise.resolve({ data: { user: authUser }, error: null }) },
      from: (table: string) => chainFor(table),
      rpc: (fn: string) => {
        const canned = rpcResults.get(fn);
        return Promise.resolve(
          canned !== null && typeof canned === "object"
            ? (canned as { data: unknown; error: unknown })
            : { data: canned, error: null },
        );
      },
      __setTable: (table: string, result: QueryResult) => tables.set(table, result),
      __setRpc: (fn: string, result: unknown) => rpcResults.set(fn, result),
      __setAuthUser: (user: typeof authUser) => {
        authUser = user;
      },
    };
  }

  return {
    createServiceClient: makeSupabaseClient,
    createClient: makeSupabaseClient,
    tableResults: tables,
    rpcResults,
  };
});

vi.mock("@/lib/supabase/server", () => ({ createServiceClient, createClient }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ getAll: () => [] })),
}));

const { GET } = await import("@/app/api/boards-hub/route");

function createMockRequest(url: string): NextRequest {
  const request = new Request(url, { method: "GET" });
  Object.defineProperty(request, "nextUrl", {
    value: new URL(url),
    writable: false,
    configurable: true,
  });
  return request as unknown as NextRequest;
}

function resetDb() {
  tableResults.clear();
  rpcResults.clear();
}

const wsMember = "ws-member";
const wsNonMember = "ws-nonmember";

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();

  // Two workspaces: one the caller is a member of, one they are not.
  tableResults.set("workspaces", {
    data: [
      { id: wsMember, name: "Member Workspace", owner_id: "user-2" },
      { id: wsNonMember, name: "Other Workspace", owner_id: "user-3" },
    ],
    error: null,
  });

  // Caller is a member (view) of wsMember only.
  tableResults.set("workspace_members", {
    data: [{ workspace_id: wsMember, role: "client", can_edit: false }],
    error: null,
  });

  // Boards: open board in member ws; restricted board in member ws without grant;
  // restricted board in non-member ws; open board in non-member ws.
  tableResults.set("boards", {
    data: [
      { id: "b-open", name: "Open board", slug: "open-board", created_at: "2026-01-01T00:00:00Z", is_restricted: false, workspace_id: wsMember },
      { id: "b-restricted", name: "Restricted board", slug: "restricted-board", created_at: "2026-01-02T00:00:00Z", is_restricted: true, workspace_id: wsMember },
      { id: "b-other-restricted", name: "Other restricted", slug: "other-restricted", created_at: "2026-01-03T00:00:00Z", is_restricted: true, workspace_id: wsNonMember },
      { id: "b-other-open", name: "Other open", slug: "other-open", created_at: "2026-01-04T00:00:00Z", is_restricted: false, workspace_id: wsNonMember },
    ],
    error: null,
  });

  // No explicit board_access_overrides for the caller.
  tableResults.set("board_access_overrides", { data: [], error: null });
});

afterEach(() => {
  resetDb();
});

describe("GET /api/boards-hub", () => {
  it("lists every workspace and board regardless of membership", async () => {
    const response = await GET(createMockRequest("http://localhost/api/boards-hub"));
    expect(response.status).toBe(200);
    const json = await response.json();
    const workspaceNames = json.map((w: { name: string }) => w.name);
    expect(workspaceNames).toContain("Member Workspace");
    expect(workspaceNames).toContain("Other Workspace");
  });

  it("returns only minimum listing fields and never board contents", async () => {
    const response = await GET(createMockRequest("http://localhost/api/boards-hub"));
    const json = await response.json();
    const board = json.flatMap((w: { boards: unknown[] }) => w.boards).find((b: { id: string }) => b.id === "b-open");
    expect(board).toMatchObject({
      id: "b-open",
      name: "Open board",
      access_state: "Open",
      allowed: true,
    });
    expect(board.records).toBeUndefined();
    expect(board.jobs).toBeUndefined();
    expect(board.cells).toBeUndefined();
  });

  it("marks a restricted board the caller cannot reach as Locked", async () => {
    const response = await GET(createMockRequest("http://localhost/api/boards-hub"));
    const json = await response.json();
    const board = json.flatMap((w: { boards: unknown[] }) => w.boards).find((b: { id: string }) => b.id === "b-other-restricted");
    expect(board.access_state).toBe("Locked");
    expect(board.allowed).toBe(false);
  });

  it("marks a restricted board in the caller's workspace as Request access", async () => {
    const response = await GET(createMockRequest("http://localhost/api/boards-hub"));
    const json = await response.json();
    const board = json.flatMap((w: { boards: unknown[] }) => w.boards).find((b: { id: string }) => b.id === "b-restricted");
    expect(board.access_state).toBe("Request access");
    expect(board.allowed).toBe(false);
  });
});
