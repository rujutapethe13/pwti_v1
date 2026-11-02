import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, rpcResults } = vi.hoisted(() => {
  const rpcResults = new Map<string, unknown>();
  function createClient() {
    return {
      rpc: (fn: string) => {
        const canned = rpcResults.get(fn);
        return Promise.resolve(
          canned !== null && typeof canned === "object"
            ? (canned as { data: unknown; error: unknown })
            : { data: canned, error: null },
        );
      },
    };
  }
  return { createClient, rpcResults };
});

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/headers", () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }));

const { getUserWorkspaceAccess, getUserWorkspaces } = await import("@/lib/workspace-access");

beforeEach(() => {
  rpcResults.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  rpcResults.clear();
});

describe("getUserWorkspaceAccess", () => {
  it("returns the access level resolved by the database", async () => {
    rpcResults.set("resolve_workspace_access", { data: "edit", error: null });
    const access = await getUserWorkspaceAccess("user-1", "ws-1");
    expect(access).toBe("edit");
  });

  it("returns null when the user has no access", async () => {
    rpcResults.set("resolve_workspace_access", { data: null, error: null });
    const access = await getUserWorkspaceAccess("user-1", "ws-1");
    expect(access).toBe(null);
  });

  it("fails closed when the RPC errors", async () => {
    rpcResults.set("resolve_workspace_access", {
      data: null,
      error: { message: "down" },
    } as never);
    const access = await getUserWorkspaceAccess("user-1", "ws-1");
    expect(access).toBe(null);
  });

  it("returns null for missing ids", async () => {
    expect(await getUserWorkspaceAccess("", "ws-1")).toBeNull();
    expect(await getUserWorkspaceAccess("user-1", "")).toBeNull();
  });
});

describe("getUserWorkspaces", () => {
  it("returns only the caller's workspaces", async () => {
    rpcResults.set("get_my_workspaces", {
      data: [
        { id: "ws-1", organization_id: "org-1", name: "One", slug: "one", can_view: true, can_edit: true },
        { id: "ws-2", organization_id: "org-1", name: "Two", slug: "two", can_view: true, can_edit: false },
      ],
      error: null,
    });
    const workspaces = await getUserWorkspaces();
    expect(workspaces).toEqual([
      { id: "ws-1", name: "One", slug: "one", organizationId: "org-1", canView: true, canEdit: true },
      { id: "ws-2", name: "Two", slug: "two", organizationId: "org-1", canView: true, canEdit: false },
    ]);
  });

  it("returns an empty list when there are no memberships", async () => {
    rpcResults.set("get_my_workspaces", { data: [], error: null });
    const workspaces = await getUserWorkspaces();
    expect(workspaces).toEqual([]);
  });

  it("returns an empty list when the RPC fails", async () => {
    rpcResults.set("get_my_workspaces", {
      data: null,
      error: { message: "down" },
    } as never);
    const workspaces = await getUserWorkspaces();
    expect(workspaces).toEqual([]);
  });
});
