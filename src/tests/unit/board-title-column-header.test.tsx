import { describe, it, expect, vi } from "vitest";
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

// The connect-column modal needs the workspace context, which is irrelevant
// to the title header and the add-group flow.
vi.mock("@/features/boards/engine/components/connect-board-column-modal", () => ({
  ConnectBoardColumnModal: () => null,
}));

// Registering the view plugins is what the board page does on mount.
import "@/features/boards/engine/view-engine/views";

const board: BoardDefinition = {
  id: "board-1",
  organizationId: "org-1",
  workspaceId: "ws-1",
  name: "January 2026",
  status: "active",
  sharedWith: [],
  // The legacy field still holds the WRONG label — the header must not use it.
  primaryColumnLabel: "Batch Details (PFM1_No)",
  titleColumnLabel: "Client / Company Name",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as BoardDefinition;

const columns: ColumnDefinition[] = [
  {
    id: "col-name",
    boardId: "board-1",
    key: "name",
    label: "Batch Details (PFM1_No)",
    type: "text",
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: {},
    permissions: {
      view: ["owner", "editor", "commenter", "viewer"],
      edit: ["owner", "editor"],
      configure: ["owner"],
    },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
];

const records: BoardRecord[] = [
  {
    id: "rec-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId: "board-1",
    groupId: "group-1",
    title: "SAFARI",
    status: "active",
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as BoardRecord,
];

const groups: Group[] = [
  {
    id: "group-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId: "board-1",
    name: "January 2026",
    collapsed: false,
    order: 0,
    status: "active",
  } as unknown as Group,
];

function renderTable(overrides: Partial<ViewRendererProps> = {}) {
  const plugin = pluginRegistry.getViewPlugin("table") as ViewPlugin;
  const Renderer = plugin.component;
  const props = {
    board,
    view: {
      id: "view-1",
      boardId: "board-1",
      name: "Table",
      type: "table",
      isDefault: true,
      visibleColumnIds: [],
      filters: [],
      sorting: [],
      grouping: [],
      settings: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
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

describe("board title column header", () => {
  it("renders the title column label, not the first data column's label", () => {
    renderTable();

    const header = screen.getByText("Client / Company Name");
    expect(header).toBeTruthy();
    expect(screen.queryByText("Batch Details (PFM1_No)")).toBeNull();
  });

  it("falls back to the board's title column label", () => {
    renderTable({
      board: { ...board, titleColumnLabel: undefined } as BoardDefinition,
      columnOps: { titleColumnLabel: "Client / Company Name" },
    });

    expect(screen.getByText("Client / Company Name")).toBeTruthy();
  });

  it("renames the title column through the header dialog", async () => {
    const onTitleColumnRename = vi.fn();
    renderTable({ columnOps: { onTitleColumnRename } });

    fireEvent.doubleClick(screen.getByText("Client / Company Name"));

    const input = await screen.findByPlaceholderText("Column label");
    fireEvent.change(input, { target: { value: "Advertiser" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onTitleColumnRename).toHaveBeenCalledWith("Advertiser");
  });
});

describe("add new group", () => {
  it("renders the add-group affordance and creates a group", async () => {
    const onAddGroup = vi.fn().mockResolvedValue("group-2");
    renderTable({ groupOps: { onAddGroup } });

    fireEvent.click(screen.getByText("Add new group"));

    const createButton = await screen.findByText("Create group");
    expect(createButton).toBeTruthy();

    fireEvent.click(createButton);

    expect(onAddGroup).toHaveBeenCalledTimes(1);
    const payload = onAddGroup.mock.calls[0][0];
    expect(payload.title).toBe("New Group");
    expect(payload.mode).toBe("blank");
  });

  it("auto-numbers the default title so groups never collide", async () => {
    const onAddGroup = vi.fn().mockResolvedValue("group-2");
    renderTable({
      groups: [
        ...groups,
        {
          ...groups[0],
          id: "group-existing",
          name: "New Group",
        } as Group,
      ],
      groupOps: { onAddGroup },
    });

    fireEvent.click(screen.getByText("Add new group"));
    fireEvent.click(await screen.findByText("Create group"));

    expect(onAddGroup).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Group 2" }),
    );
  });
});
