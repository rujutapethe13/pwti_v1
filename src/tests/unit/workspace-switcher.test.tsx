import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createClient, setRpc } = vi.hoisted(() => {
  const rpcResults = new Map<string, unknown>();
  function createClient() {
    return {
      rpc: (fn: string) => Promise.resolve({ data: rpcResults.get(fn) ?? null, error: null }),
      __setRpc: (fn: string, result: unknown) => rpcResults.set(fn, result),
    };
  }
  return { createClient, setRpc: (fn: string, result: unknown) => rpcResults.set(fn, result) };
});

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/headers", () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import { WorkspaceSwitcher } from "@/components/shared/workspace-switcher";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  routerPush.mockClear();
});

describe("WorkspaceSwitcher", () => {
  it("lists only the user's workspaces and links to their overviews", async () => {
    setRpc("get_my_workspaces", [
      { id: "ws-1", organization_id: "org-1", name: "One", slug: "one", can_view: true, can_edit: true },
      { id: "ws-2", organization_id: "org-1", name: "Two", slug: "two", can_view: true, can_edit: false },
    ]);

    render(<WorkspaceSwitcher />);

    await waitFor(() => expect(screen.getByText("One")).toBeInTheDocument());

    // Open the dropdown and pick the second workspace.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /One/ }));
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: /Two/ })).toBeInTheDocument(),
    );
    expect(screen.getByText("Two")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Two/ }));

    expect(routerPush).toHaveBeenCalledWith("/workspaces/ws-2/overview");
  });

  it("shows a friendly empty state when the user has no workspaces", async () => {
    setRpc("get_my_workspaces", []);

    render(<WorkspaceSwitcher />);

    await waitFor(() =>
      expect(screen.getByText(/No workspaces yet/)).toBeInTheDocument(),
    );
  });
});
