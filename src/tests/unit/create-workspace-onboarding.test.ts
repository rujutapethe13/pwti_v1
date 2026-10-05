import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    setAll: () => {},
  }),
}));

const { mockServerClient, mockServiceClient, workspaceInsertSpy, rpcSpy, getUserSpy } =
  vi.hoisted(() => {
    const workspaceSingle = vi.fn().mockResolvedValue({
      data: {
        id: "ws-test",
        name: "Test Workspace",
        description: "",
        organization_id: "org-test",
        created_by: null,
      },
      error: null,
    });

    const workspaceInsert = vi.fn().mockReturnValue({
      select: () => ({ single: workspaceSingle }),
    });

    const boardInsert = vi.fn().mockResolvedValue({ error: null });

    const getUser = vi.fn();
    const rpc = vi.fn();

    const serverClient = {
      from: vi.fn(() => ({})),
      auth: { getUser },
      rpc,
    };

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "workspaces") return { insert: workspaceInsert };
        if (table === "boards") return { insert: boardInsert };
        return {};
      }),
    };

    return {
      mockServerClient: serverClient,
      mockServiceClient: serviceClient,
      workspaceInsertSpy: workspaceInsert,
      rpcSpy: rpc,
      getUserSpy: getUser,
    };
  });

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
  createServiceClient: () => mockServiceClient,
}));

const { createWorkspaceInDb } = await import(
  "@/features/boards/engine/actions/workspace-actions"
);

describe("createWorkspaceInDb — onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSpy.mockResolvedValue({
      data: { user: { id: "user-real-123" } },
    });
    rpcSpy.mockResolvedValue({ error: null });
  });

  it("creates workspace with correct fields", async () => {
    await createWorkspaceInDb("Test Workspace", "org-test");

    expect(workspaceInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Workspace",
        organization_id: "org-test",
        status: "active",
        created_by: "user-real-123",
      }),
    );
  });

  it("calls onboard_workspace_owner via the server client (preserves user session)", async () => {
    await createWorkspaceInDb("Test Workspace", "org-test");

    expect(rpcSpy).toHaveBeenCalledWith("onboard_workspace_owner", {
      p_workspace_id: expect.any(String),
    });
  });

  it("skips onboarding when no user is authenticated", async () => {
    getUserSpy.mockResolvedValue({ data: { user: null } });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await createWorkspaceInDb("Test Workspace", "org-test");

    expect(rpcSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[createWorkspaceInDb] No authenticated user found; skipping onboarding",
    );
    expect(workspaceInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: null }),
    );

    consoleWarnSpy.mockRestore();
  });

  it("surfaces onboarding RPC failures to the caller", async () => {
    rpcSpy.mockResolvedValue({ error: { message: "RPC failed" } });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(createWorkspaceInDb("Test Workspace", "org-test")).rejects.toThrow(
      "Failed to onboard workspace owner: RPC failed",
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[createWorkspaceInDb] Failed to onboard workspace owner:",
      { message: "RPC failed" },
    );

    consoleErrorSpy.mockRestore();
  });
});
