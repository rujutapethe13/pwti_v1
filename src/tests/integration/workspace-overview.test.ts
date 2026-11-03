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
    limit: () => Chain;
    maybeSingle: () => Promise<QueryResult>;
    then: (resolve: (value: unknown) => void) => void;
  }

  let authUser = {
    id: "user-1",
    email: "u@example.com",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  };

  function chainFor(table: string) {
    const result = () =>
      Promise.resolve(tables.get(table) ?? { data: null, error: null });
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: result,
      then(resolve) {
        result().then(resolve);
      },
    };
    return chain;
  }

  function makeSupabaseClient() {
    return {
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: authUser }, error: null }),
      },
      from: (table: string) => chainFor(table),
      rpc: (fn: string) => {
        const canned = rpcResults.get(fn);
        return Promise.resolve(
          canned !== null && typeof canned === "object"
            ? (canned as { data: unknown; error: unknown })
            : { data: canned, error: null },
        );
      },
      __setTable: (table: string, result: { data: unknown; error: { message: string } | null }) =>
        tables.set(table, result),
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
    setAuthUser: (user: typeof authUser) => (authUser = user),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient,
  createClient,
}));

vi.mock("@/lib/rbac/resolve", () => ({
  getSessionIdentity: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ getAll: () => [] })),
}));

const { getSessionIdentity } = await import("@/lib/rbac/resolve");
const { GET } = await import("@/app/api/workspaces/[workspaceId]/overview/route");
const { getWorkspaceOverview } = await import("@/features/workspaces/overview-actions");

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

const workspaceId = "ws-1";

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();
  vi.mocked(getSessionIdentity).mockResolvedValue({
    userId: "user-1",
    email: "u@example.com",
    role: "client",
    organizationId: "org-1",
  } as never);
});

afterEach(() => {
  resetDb();
});

describe("GET /api/workspaces/[workspaceId]/overview", () => {
  it("returns the full overview for a member in one call", async () => {
    rpcResults.set("resolve_workspace_access", { data: "edit", error: null });
    tableResults.set("workspaces", {
      data: { id: workspaceId, name: "Acme Co", slug: "acme-co", description: null },
      error: null,
    });
    tableResults.set("boards", {
      data: [
        { id: "b-1", name: "Jobs board", slug: "jobs-board", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "b-2", name: "Archive", slug: "archive", created_at: "2026-01-02T00:00:00.000Z" },
      ],
      error: null,
    });
    tableResults.set("records", {
      data: [
        { board_id: "b-1", status: "done" },
        { board_id: "b-1", status: "in progress" },
        { board_id: "b-1", status: "not started" },
        { board_id: "b-2", status: "done" },
      ],
      error: null,
    });
    rpcResults.set("list_workspace_members", {
      data: [
        { user_id: "user-1", full_name: "U One", email: "u@example.com", avatar_url: null, role: "owner" },
        { user_id: "user-2", full_name: "U Two", email: "u2@example.com", avatar_url: null, role: "view" },
      ],
      error: null,
    });
    tableResults.set("activity_logs", {
      data: [
        { id: "a-1", action: "record.create", payload: { after: { title: "Job A" } }, created_at: "2026-01-05T10:00:00.000Z" },
      ],
      error: null,
    });

    const response = await GET(createMockRequest(`http://localhost/api/workspaces/${workspaceId}/overview`), {
  params: Promise.resolve({ workspaceId }),
} as { params: Promise<{ workspaceId: string }> });
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.error).toBeUndefined();
    expect(json.data.workspace).toMatchObject({ id: workspaceId, name: "Acme Co", role: "Admin" });
    expect(json.data.boards).toHaveLength(2);
    const board = json.data.boards.find((b: { id: string }) => b.id === "b-1");
    expect(board.jobsPending).toBe(1);
    expect(board.jobsInProgress).toBe(1);
    expect(board.jobsDone).toBe(1);
    expect(board.jobsTotal).toBe(3);
    expect(json.data.totalPending).toBe(1);
    expect(json.data.members).toHaveLength(2);
    expect(json.data.activity).toHaveLength(1);
    expect(json.data.activity[0].title).toBe("Job A");
  });

  it("returns the full overview for a new owner", async () => {
    rpcResults.set("resolve_workspace_access", { data: "owner", error: null });
    tableResults.set("workspaces", {
      data: { id: workspaceId, name: "Acme Co", slug: "acme-co", description: null },
      error: null,
    });
    tableResults.set("boards", {
      data: [{ id: "b-1", name: "Jobs board", slug: "jobs-board", created_at: "2026-01-01T00:00:00.000Z" }],
      error: null,
    });
    tableResults.set("records", { data: [], error: null });
    rpcResults.set("list_workspace_members", { data: [], error: null });
    tableResults.set("activity_logs", { data: [], error: null });

    const response = await GET(createMockRequest(`http://localhost/api/workspaces/${workspaceId}/overview`), {
      params: Promise.resolve({ workspaceId }),
    } as { params: Promise<{ workspaceId: string }> });
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.error).toBeUndefined();
    expect(json.data.workspace.role).toBe("Owner");
  });

  it("returns 403 for a non-member", async () => {
    rpcResults.set("resolve_workspace_access", { data: null, error: null });

    const response = await GET(createMockRequest(`http://localhost/api/workspaces/${workspaceId}/overview`), {
  params: Promise.resolve({ workspaceId }),
} as { params: Promise<{ workspaceId: string }> });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a workspace that does not exist", async () => {
    rpcResults.set("resolve_workspace_access", { data: "view", error: null });
    tableResults.set("workspaces", { data: null, error: null });

    const response = await GET(createMockRequest(`http://localhost/api/workspaces/${workspaceId}/overview`), {
  params: Promise.resolve({ workspaceId }),
} as { params: Promise<{ workspaceId: string }> });
    expect(response.status).toBe(404);
  });

  it("surfaces database errors as 500 instead of empty data", async () => {
    rpcResults.set("resolve_workspace_access", { data: "edit", error: null });
    tableResults.set("workspaces", {
      data: { id: workspaceId, name: "Acme Co", slug: "acme-co" },
      error: null,
    });
    tableResults.set("boards", { data: null, error: { message: "connection failed" } });

    const response = await GET(createMockRequest(`http://localhost/api/workspaces/${workspaceId}/overview`), {
  params: Promise.resolve({ workspaceId }),
} as { params: Promise<{ workspaceId: string }> });
    expect(response.status).toBe(500);
  });
});

describe("getWorkspaceOverview server action", () => {
  it("returns empty collections rather than crashing for an empty workspace", async () => {
    rpcResults.set("resolve_workspace_access", { data: "view", error: null });
    tableResults.set("workspaces", {
      data: { id: workspaceId, name: "Empty Co", slug: "empty-co" },
      error: null,
    });
    tableResults.set("boards", { data: [], error: null });
    tableResults.set("records", { data: [], error: null });
    rpcResults.set("list_workspace_members", { data: [], error: null });
    tableResults.set("activity_logs", { data: [], error: null });

    const result = await getWorkspaceOverview(workspaceId);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.boards).toEqual([]);
    expect(result.data!.totalPending).toBe(0);
    expect(result.data!.members).toEqual([]);
    expect(result.data!.activity).toEqual([]);
  });
});
