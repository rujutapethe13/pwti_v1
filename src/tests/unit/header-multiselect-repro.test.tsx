import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  { id: "col-b", boardId: "board-1", key: "b", label: "Column B", type: "number", required: false, hidden: false, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
  { id: "col-c", boardId: "board-1", key: "c", label: "Column C", type: "text", required: false, hidden: false, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
];

const records: BoardRecord[] = [
  { id: "rec-1", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", groupId: "group-1", title: "SAFARI", status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as BoardRecord,
  { id: "rec-2", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", groupId: "group-1", title: "Row 2", status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as BoardRecord,
  { id: "rec-3", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", groupId: "group-1", title: "Row 3", status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as BoardRecord,
  { id: "rec-4", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", groupId: "group-1", title: "Row 4", status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as BoardRecord,
  { id: "rec-5", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1", groupId: "group-1", title: "Row 5", status: "active", version: 1, archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as BoardRecord,
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

const GREEN = "ring-2 ring-green-500 bg-green-500/10";

function headerEl(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-column-id="${id}"]`);
  if (!el) throw new Error(`no header for ${id}`);
  return el;
}

function headerIds() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-column-id]')).map((el) => el.getAttribute("data-column-id")!);
}

function selectedIds() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-column-id]'))
    .filter((el) => el.classList.contains("ring-green-500"))
    .map((el) => el.getAttribute("data-column-id")!);
}

function click(id: string, init: {} = {}) {
  fireEvent.click(headerEl(id), init);
}

describe("header multi-select", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("single click selects one", () => {
    renderTable();
    click("col-a");
    expect(selectedIds()).toEqual(["col-a"]);
  });

  it("ctrl+click toggles a second column", () => {
    renderTable();
    click("col-a");
    click("col-b", { ctrlKey: true });
    expect(selectedIds()).toEqual(["col-a", "col-b"]);
  });

  it("shift+click selects a range", () => {
    renderTable();
    click("col-a");
    click("col-c", { shiftKey: true });
    expect(selectedIds()).toEqual(["col-a", "col-b", "col-c"]);
  });

  it("clicking outside clears selection", () => {
    renderTable();
    click("col-a");
    fireEvent.mouseDown(document.body);
    expect(selectedIds()).toEqual([]);
  });

  it("table header select-all selects 5 rows and toggles back to 0", () => {
    renderTable();
    const selectAll = screen.getByRole("checkbox", { name: "Select all" });
    fireEvent.click(selectAll);
    expect(screen.getByText("5 items selected")).toBeTruthy();

    fireEvent.click(selectAll);
    expect(screen.queryByText("5 items selected")).toBeNull();
  });
});
