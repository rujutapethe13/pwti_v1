import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { toast } from "sonner";
import { pluginRegistry } from "@/features/boards/engine/plugins/plugin-registry";
import type { ViewPlugin } from "@/features/boards/engine/plugins/plugin-types";
import type { ViewRendererProps } from "@/features/boards/engine/view-engine/view-engine-types";
import type { BoardDefinition, BoardRecord, ColumnDefinition, Group } from "@/features/boards/engine/types";
import type { Member } from "@/lib/members-types";

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

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

// ── Make TanStack Virtual render rows in jsdom (scroll container has 0 height) ──
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
  const rect = originalGetBoundingClientRect.call(this);
  if (/board-table/.test(String(this.className ?? ""))) {
    return { ...rect, width: 1000, height: 2000, bottom: 2000, right: 1000 } as DOMRect;
  }
  return rect;
};

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    if (/board-table/.test(String(this.className ?? ""))) return 2000;
    return originalOffsetHeight?.get?.call(this) ?? 0;
  },
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get(this: HTMLElement) {
    if (/board-table/.test(String(this.className ?? ""))) return 1000;
    return originalOffsetWidth?.get?.call(this) ?? 0;
  },
});

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.callback = callback; }
  observe(_el: Element, _opts?: ResizeObserverOptions) {
    this.callback([{ target: _el, contentRect: { width: 1000, height: 2000 } } as unknown as ResizeObserverEntry], undefined as unknown as ResizeObserver);
  }
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

import "@/features/boards/engine/view-engine/views";

const board: BoardDefinition = {
  id: "board-1",
  organizationId: "org-1",
  workspaceId: "ws-1",
  name: "Test Board",
  status: "active",
  sharedWith: [],
  titleColumnLabel: "Client / Company",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as BoardDefinition;

const columns: ColumnDefinition[] = [
  {
    id: "col-title", boardId: "board-1", groupId: null, key: "title", label: "Client / Company",
    type: "text", required: false, hidden: false, frozen: false, defaultValue: null, settings: {},
    permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 0,
    isPrimary: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
  {
    id: "col-date", boardId: "board-1", groupId: null, key: "date", label: "Date",
    type: "date", required: false, hidden: false, frozen: false, defaultValue: null, settings: {},
    permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 1,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
  {
    id: "col-status", boardId: "board-1", groupId: null, key: "status", label: "Status",
    type: "status", required: false, hidden: false, frozen: false, defaultValue: null,
    settings: { labels: [{ id: "s1", label: "To Do" }, { id: "s2", label: "Doing" }, { id: "s3", label: "Done" }] },
    permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 2,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
  {
    id: "col-person", boardId: "board-1", groupId: null, key: "person", label: "Person",
    type: "person", required: false, hidden: false, frozen: false, defaultValue: null, settings: {},
    permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 3,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
  {
    id: "col-number", boardId: "board-1", groupId: null, key: "number", label: "Number",
    type: "number", required: false, hidden: false, frozen: false, defaultValue: null, settings: {},
    permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 4,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
  {
    id: "col-formula", boardId: "board-1", groupId: null, key: "formula", label: "Formula",
    type: "formula", required: false, hidden: false, frozen: false, defaultValue: null, settings: {},
    permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 5,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as ColumnDefinition,
];

const records: BoardRecord[] = [
  {
    id: "rec-1", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1",
    groupId: "group-1", title: "Alpha", status: "active", version: 1, archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as BoardRecord,
  {
    id: "rec-2", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1",
    groupId: "group-1", title: "Beta", status: "active", version: 1, archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as BoardRecord,
];

const groups: Group[] = [
  {
    id: "group-1", organizationId: "org-1", workspaceId: "ws-1", boardId: "board-1",
    name: "Group 1", collapsed: false, order: 0, status: "active",
  } as unknown as Group,
];

const members: Member[] = [
  {
    user_id: "u1", name: "Alice Smith", email: "alice@example.com", avatar_url: null,
    role: "edit", status: "active", inherited: true,
    joined_at: null, last_login_at: null, last_active_at: null,
  },
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
    cellValues: new Map<string, unknown>(),
    groups,
    members,
    settings: {},
    isActive: true,
    ...overrides,
  } as unknown as ViewRendererProps;
  return render(<Renderer {...props} />);
}

function selectCell(row: number, col: number) {
  const el = document.querySelector<HTMLElement>(
    `[data-grid-row="${row}"][data-grid-col="${col}"]`,
  );
  if (!el) throw new Error(`no cell at row ${row} col ${col}`);
  fireEvent.mouseDown(el as HTMLElement);
}

function pasteText(text: string) {
  const event = new ClipboardEvent("paste", { bubbles: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (fmt: string) => (fmt === "text/plain" ? text : ""),
      setData: () => undefined,
    },
    configurable: true,
  });
  window.dispatchEvent(event);
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("grid paste batching", () => {
  it("3x3 paste into existing cells calls bulk callbacks once each, no new rows", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);
    const onBulkNewItem = vi.fn().mockResolvedValue([] as string[]);

    renderTable({ onBulkCellChange, onBulkRecordTitleChange, onBulkNewItem });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("New Title 1\t03-05-2026\tTo Do\nNew Title 2\t2026-05-04\tDoing");

    expect(onBulkRecordTitleChange).toHaveBeenCalledTimes(1);
    expect(onBulkRecordTitleChange).toHaveBeenCalledWith([
      { recordId: "rec-1", title: "New Title 1" },
      { recordId: "rec-2", title: "New Title 2" },
    ]);

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const cellCalls = onBulkCellChange.mock.calls[0][0];
    expect(cellCalls).toContainEqual({ recordId: "rec-1", columnId: "col-date", value: "2026-05-03" });
    expect(cellCalls).toContainEqual({ recordId: "rec-2", columnId: "col-date", value: "2026-05-04" });
    expect(cellCalls).toContainEqual({ recordId: "rec-1", columnId: "col-status", value: "s1" });
    expect(cellCalls).toContainEqual({ recordId: "rec-2", columnId: "col-status", value: "s2" });

    expect(onBulkNewItem).not.toHaveBeenCalled();
  });

  it("paste beyond existing rows creates new rows in a single batch", async () => {
    const onBulkNewItem = vi.fn().mockResolvedValue(["new-1", "new-2"] as string[]);
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);

    renderTable({ onBulkNewItem, onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("T1\t2026-01-01\tTo Do\nT2\t2026-01-02\tDoing\nT3\t2026-01-03\tDone\nT4\t2026-01-04\tTo Do");

    expect(onBulkNewItem).toHaveBeenCalledTimes(1);
    expect(onBulkNewItem).toHaveBeenCalledWith(2, "group-1");
    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
  });

  it("dates parsed in multiple formats", async () => {
    const onBulkNewItem = vi.fn().mockResolvedValue(["new-3", "new-4"] as string[]);
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkNewItem, onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("x\t03-05-2026\nx\t03/05/2026\nx\t2026-06-15\nx\t45000");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    const dates = calls.filter((c) => c.columnId === "col-date").map((c) => String(c.value));
    expect(dates.length).toBe(4);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect(dates[0]).toBe("2026-05-03");
    expect(dates[1]).toBe("2026-05-03");
    expect(dates[2]).toBe("2026-06-15");
  });

  it("ambiguous date warned but not skipped", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("x\t03/05/2026");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-date", value: "2026-05-03" });
    const toastMsg = vi.mocked(toast).mock.calls.map((c) => String(c[0])).join(" ");
    expect(toastMsg).toContain("warned");
  });

  it("invalid date skipped with reason", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    // title=x (title update), date=not-a-date (skipped), status=To Do (valid cell)
    await pasteText("x\tnot-a-date\tTo Do");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-status", value: "s1" });
    expect(calls.filter((c) => c.columnId === "col-date")).toHaveLength(0);
  });

  it("status matched to option id; invalid status skipped, never creates option", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("x\t2026-01-01\tTo Do\nx\t2026-01-02\tNot A Status");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-status", value: "s1" });
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-date", value: "2026-01-01" });
    expect(calls).toContainEqual({ recordId: "rec-2", columnId: "col-date", value: "2026-01-02" });
    expect(calls.filter((c) => c.columnId === "col-status")).toHaveLength(1);
  });

  it("person matched to user_id; invalid person skipped", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange, columnOps: { members } });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("x\t2026-01-01\tTo Do\tAlice Smith\nx\t2026-01-02\tTo Do\tNobody");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-person", value: "u1" });
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-date", value: "2026-01-01" });
    expect(calls).toContainEqual({ recordId: "rec-2", columnId: "col-date", value: "2026-01-02" });
    expect(calls.filter((c) => c.columnId === "col-person")).toHaveLength(1);
  });

  it("empty cells are cleared", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("x\t\nx\t2026-01-01");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-date", value: null });
    expect(calls).toContainEqual({ recordId: "rec-2", columnId: "col-date", value: "2026-01-01" });
  });

  it("read-only / computed columns are skipped with reason read-only", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    // title, date, status, person, number, then a value aimed at the computed formula column
    await pasteText("T1\t2026-01-01\tTo Do\tAlice Smith\t42\tcomputed-value");

    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    const calls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    // computed formula column must never receive a write
    expect(calls.filter((c) => c.columnId === "col-formula")).toHaveLength(0);
    // the valid cells are still written
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-date", value: "2026-01-01" });
    expect(calls).toContainEqual({ recordId: "rec-1", columnId: "col-status", value: "s1" });
    // toast reports the read-only skip
    const toastMsg = vi.mocked(toast).mock.calls.map((c) => String(c[0])).join(" ");
    expect(toastMsg).toContain("read-only");
  });

  it("pasting into Client / Company sets records.title so the row no longer shows Untitled", async () => {
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkRecordTitleChange, onBulkCellChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("New Client Name");

    expect(onBulkRecordTitleChange).toHaveBeenCalledTimes(1);
    expect(onBulkRecordTitleChange).toHaveBeenCalledWith([
      { recordId: "rec-1", title: "New Client Name" },
    ]);
    // title paste does not emit a cell write
    expect(onBulkCellChange).not.toHaveBeenCalled();
  });

  it("one undo entry per paste: a single bulk write per type for a multi-cell paste", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkCellChange, onBulkRecordTitleChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText("T1\t2026-01-01\tTo Do\nT2\t2026-01-02\tDoing");

    // One batched write per type => one undo entry per paste
    expect(onBulkCellChange).toHaveBeenCalledTimes(1);
    expect(onBulkRecordTitleChange).toHaveBeenCalledTimes(1);
    const cellCalls: { recordId: string; columnId: string; value: unknown }[] = onBulkCellChange.mock.calls[0][0];
    expect(cellCalls).toHaveLength(4);
    expect(cellCalls.filter((c) => c.columnId === "col-date")).toHaveLength(2);
    expect(cellCalls.filter((c) => c.columnId === "col-status")).toHaveLength(2);
  });

  it("1000-row paste chunks title writes into ~200-update batches", async () => {
    // Row creation is chunked like the writes: one create per <=200 rows.
    const onBulkNewItem = vi.fn(async (count: number) =>
      Array.from({ length: count }, (_, i) => `new-${i + 1}`),
    );
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);
    renderTable({ onBulkNewItem, onBulkRecordTitleChange });
    await act(async () => {});

    selectCell(0, 0);
    await pasteText(Array.from({ length: 1000 }, (_, i) => `Title ${i + 1}`).join("\n"));

    // 998 rows to create (1000 pasted - 2 existing), in chunks of at most 200.
    const createCalls = onBulkNewItem.mock.calls.map((c) => c[0] as number);
    expect(createCalls.every((n) => n <= 200)).toBe(true);
    expect(createCalls.reduce((a, b) => a + b, 0)).toBe(998);
    expect(createCalls.length).toBe(Math.ceil(998 / 200));
    expect((onBulkNewItem.mock.calls[0] as unknown[])[1]).toBe("group-1");
    expect(onBulkRecordTitleChange).toHaveBeenCalledTimes(5);
    let total = 0;
    for (const call of onBulkRecordTitleChange.mock.calls) {
      const updates = call[0];
      expect(updates.length).toBeLessThanOrEqual(200);
      total += updates.length;
    }
    expect(total).toBe(1000);
  });
});
