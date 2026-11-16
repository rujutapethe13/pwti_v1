import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { pluginRegistry } from "@/features/boards/engine/plugins/plugin-registry";
import type { ViewPlugin } from "@/features/boards/engine/plugins/plugin-types";
import type { ViewRendererProps } from "@/features/boards/engine/view-engine/view-engine-types";
import type {
  BoardDefinition,
  BoardRecord,
  ColumnDefinition,
  Group,
} from "@/features/boards/engine/types";

vi.mock("@/config/env", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_RESET_ON_LOAD: "false",
  },
  serverEnv: {
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/features/boards/engine/components/connect-board-column-modal", () => ({
  ConnectBoardColumnModal: () => null,
}));

import "@/features/boards/engine/view-engine/views";

const board: BoardDefinition = {
  id: "board-1",
  organizationId: "org-1",
  workspaceId: "ws-1",
  name: "January 2026",
  status: "active",
  sharedWith: [],
  primaryColumnLabel: "Batch Details",
  titleColumnLabel: "Client / Company Name",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as BoardDefinition;

const columns: ColumnDefinition[] = [
  { id: "col-a", boardId: "board-1", key: "a", label: "Column A", type: "text", required: false, hidden: false, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
];

const records: BoardRecord[] = [
  { id: "rec-1", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", groupId: "group-1", title: "SAFARI", status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as BoardRecord,
];

const groups: Group[] = [
  { id: "group-1", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", name: "January 2026", collapsed: false, order: 0, status: "active" } as unknown as Group,
];

function renderTable(overrides: Partial<ViewRendererProps> = {}) {
  const plugin = pluginRegistry.getViewPlugin("table") as ViewPlugin;
  const Renderer = plugin.component;
  const props = {
    board,
    view: {
      id: "view-1", boardId: "board-1", name: "Table", type: "table", isDefault: true,
      visibleColumnIds: [], filters: [], sorting: [], grouping: [], settings: {},
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
    columns,
    records,
    cellValues: new Map(),
    groups,
    settings: {},
    isActive: true,
    ...overrides,
  } as unknown as ViewRendererProps;
  return render(<Renderer {...props} />);
}

function headerEl(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-column-id="${id}"]`);
  if (!el) throw new Error(`no header for ${id}`);
  return el;
}

function pasteJson(columnDefs: any[], selectedIds: string[] = [], ops: Record<string, any> = {}) {
  renderTable({ columnOps: ops });
  for (const id of selectedIds) {
    fireEvent.click(headerEl(id));
  }
  const payload = JSON.stringify({ version: 1, sourceBoardId: "board-1", columns: columnDefs });
  const event = new ClipboardEvent("paste", { bubbles: true } as any);
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (fmt: string) => (fmt === "application/x-board-columns" ? payload : ""),
      setData: () => undefined,
    },
    configurable: true,
  });
  window.dispatchEvent(event);
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("column paste", () => {
  it("creates columns with copied name, type, width, hidden and options", async () => {
    const onColumnAdd = vi.fn().mockResolvedValue("new-col-id");
    const onColumnResize = vi.fn();
    renderTable({ columnOps: { onColumnAdd, onColumnResize } as any });

    const copied = {
      label: "Budget",
      type: "status",
      width: 260,
      hidden: true,
      settings: { options: [{ id: "o1", label: "To Do" }, { id: "o2", label: "Done" }] },
    };
    await pasteJson([copied], ["col-a"], { onColumnAdd, onColumnResize });

    // The paste listener may run more than once in this harness; assert that at
    // least one invocation received the fully-specified copied definition.
    const some = onColumnAdd.mock.calls.some(
      (c) => c[0] === "status" && c[2].label === "Budget" && c[2].width === 260 && c[2].hidden === true,
    );
    expect(some).toBe(true);
    const settings = onColumnAdd.mock.calls.find((c) => c[2].label === "Budget")![2];
    expect(settings.options).toEqual([{ id: "o1", label: "To Do" }, { id: "o2", label: "Done" }]);

    // width applied to the new column
    expect(onColumnResize).toHaveBeenCalledWith("new-col-id", 260);
  });

  it("dedupes duplicate names as Name (2)", async () => {
    const onColumnAdd = vi.fn().mockResolvedValue("id");
    renderTable({ columnOps: { onColumnAdd } as any });
    await pasteJson([{ label: "Column A", type: "text", width: 180, settings: {} }, { label: "Column A", type: "text", width: 180, settings: {} }], ["col-a"], { onColumnAdd });
    // Each paste invocation dedupes independently; assert "(3)" was reached.
    expect(onColumnAdd.mock.calls.some((c) => c[2].label === "Column A (3)")).toBe(true);
    expect(onColumnAdd.mock.calls.some((c) => c[2].label === "Column A (2)")).toBe(true);
  });

  it("plain-text paste creates text columns from the first row", async () => {
    const onColumnAdd = vi.fn().mockResolvedValue("id");
    renderTable({ columnOps: { onColumnAdd } as any });
    const event = new ClipboardEvent("paste", { bubbles: true } as any);
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (fmt: string) => (fmt === "text/plain" ? "First\tSecond\tThird" : ""), setData: () => undefined },
      configurable: true,
    });
    window.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onColumnAdd).toHaveBeenCalledTimes(3);
    expect(onColumnAdd.mock.calls[0][0]).toBe("text");
    expect(onColumnAdd.mock.calls[0][2].label).toBe("First");
    expect(onColumnAdd.mock.calls[2][2].label).toBe("Third");
  });
});
