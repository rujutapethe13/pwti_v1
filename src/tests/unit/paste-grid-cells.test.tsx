import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { pluginRegistry } from "@/features/boards/engine/plugins/plugin-registry";
import type { ViewPlugin } from "@/features/boards/engine/plugins/plugin-types";
import type { ViewRendererProps } from "@/features/boards/engine/view-engine/view-engine-types";
import type {
  BoardDefinition,
  BoardRecord,
  ColumnDefinition,
  ColumnValue,
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

const boardId = "board-1";

const board = {
  id: boardId,
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
  // Primary column: backed by records.title.
  { id: "col-title", boardId, key: "title", label: "Client / Company Name", type: "text", required: false, hidden: false, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
  // Ordinary writable text column.
  { id: "col-notes", boardId, key: "notes", label: "Notes", type: "text", required: false, hidden: false, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
  // Read-only (formula) column: must never receive pasted values.
  { id: "col-formula", boardId, key: "formula", label: "Formula", type: "formula", required: false, hidden: false, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
  // Hidden column: excluded from the grid mapping entirely.
  { id: "col-secret", boardId, key: "secret", label: "Secret", type: "text", required: false, hidden: true, frozen: false, defaultValue: null, settings: {}, permissions: { view: [], edit: [], configure: [] }, validation: [], version: 1, order: 3, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as unknown as ColumnDefinition,
];

function makeRecords(count: number, title = "Untitled"): BoardRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `rec-${i + 1}`,
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId,
    groupId: "group-1",
    title,
    status: "active",
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  })) as unknown as BoardRecord[];
}

const groups: Group[] = [
  { id: "group-1", organizationId: "org-1", workspaceId: "ws-1", boardId, name: "January 2026", collapsed: false, order: 0, status: "active" } as unknown as Group,
];

const view = {
  id: "view-1", boardId, name: "Table", type: "table", isDefault: true,
  visibleColumnIds: [], filters: [], sorting: [], grouping: [], settings: {},
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

type HarnessProps = {
  recordCount?: number;
  cellValues?: Map<string, ColumnValue>;
  onBulkCellChange?: (updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>) => Promise<void> | void;
  onBulkRecordTitleChange?: (updates: Array<{ recordId: string; title: string }>) => Promise<void> | void;
  onBulkNewItem?: (count: number, groupId?: string | null) => Promise<string[]>;
};

/**
 * Mirrors engine-board-page: holds records/cell values in state and applies
 * pasted titles optimistically, so tests can assert on what the user sees.
 */
function Harness({
  recordCount = 3,
  cellValues = new Map(),
  onBulkCellChange,
  onBulkRecordTitleChange,
  onBulkNewItem,
}: HarnessProps) {
  const plugin = pluginRegistry.getViewPlugin("table") as ViewPlugin;
  const Renderer = plugin.component;
  const [records, setRecords] = useState(() => makeRecords(recordCount));
  const [values] = useState(cellValues);

  return (
    <>
      <Renderer
        {...{
          board,
          view,
          columns,
          records,
          cellValues: values,
          groups,
          settings: {},
          isActive: true,
          onBulkCellChange: onBulkCellChange
            ? async (updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>) => {
                await onBulkCellChange(updates);
              }
            : undefined,
          onBulkRecordTitleChange: onBulkRecordTitleChange
            ? async (updates: Array<{ recordId: string; title: string }>) => {
                setRecords((prev) => {
                  const byId = new Map(updates.map((u) => [u.recordId, u.title] as const));
                  return prev.map((r) => (byId.has(r.id) ? { ...r, title: byId.get(r.id)! } : r));
                });
                await onBulkRecordTitleChange(updates);
              }
            : undefined,
          onBulkNewItem: onBulkNewItem ?? (async () => []),
        } as unknown as ViewRendererProps}
      />
      <div data-testid="titles">{records.map((r) => r.title).join("|")}</div>
      <div data-testid="values">{[...values.entries()].map(([k, v]) => `${k}=${String(v)}`).join("|")}</div>
    </>
  );
}

/** Paste `text` into the grid as if the user pressed Ctrl+V. */
function pasteIntoGrid(text: string) {
  const event = new ClipboardEvent("paste", { bubbles: true } as MouseEventInit);
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (fmt: string) => (fmt === "text/plain" ? text : ""),
      setData: () => undefined,
    },
    configurable: true,
  });
  window.dispatchEvent(event);
  // doGridPaste is async (await applyPasteUpdates); let microtasks flush.
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Ctrl+A on the grid container selects every cell. */
function selectAllCells() {
  const grid = document.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error("grid container not found");
  fireEvent.keyDown(grid, { key: "a", ctrlKey: true });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("grid cell paste", () => {
  it("chunks a 1000-row paste into 5 bulk writes of at most 200 cells", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);
    const onBulkNewItem = vi.fn(async (count: number) =>
      Array.from({ length: count }, (_, i) => `new-${i}`),
    );

    render(
      <Harness
        recordCount={3}
        onBulkCellChange={onBulkCellChange}
        onBulkRecordTitleChange={onBulkRecordTitleChange}
        onBulkNewItem={onBulkNewItem}
      />,
    );
    selectAllCells();

    // 1000 rows x 2 columns: title column + notes column.
    const lines = Array.from({ length: 1000 }, (_, i) => `Client ${i}\tNote ${i}`);
    await pasteIntoGrid(lines.join("\n"));

    expect(onBulkCellChange).toHaveBeenCalledTimes(5);
    const sizes = onBulkCellChange.mock.calls.map((c) => (c[0] as unknown[]).length);
    expect(sizes).toEqual([200, 200, 200, 200, 200]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1000);

    // Titles are chunked the same way, never one request per row.
    expect(onBulkRecordTitleChange).toHaveBeenCalledTimes(5);
    const titleSizes = onBulkRecordTitleChange.mock.calls.map((c) => (c[0] as unknown[]).length);
    expect(titleSizes).toEqual([200, 200, 200, 200, 200]);

    // Row creation is chunked too: 997 rows to create -> 5 creates.
    expect(onBulkNewItem).toHaveBeenCalledTimes(5);
    const created = onBulkNewItem.mock.calls.reduce(
      (n, c) => n + (c[0] as number),
      0,
    );
    expect(created).toBe(997);
  });

  it("pastes every cell of a multi-row block into the right cells", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);

    render(<Harness recordCount={3} onBulkCellChange={onBulkCellChange} onBulkRecordTitleChange={onBulkRecordTitleChange} />);
    selectAllCells();

    await pasteIntoGrid("Alpha\tA1\nBeta\tB1\nGamma\tC1");

    const cells = onBulkCellChange.mock.calls.flatMap((c) => c[0] as Array<{ recordId: string; columnId: string; value: ColumnValue }>);
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.value)).toEqual(["A1", "B1", "C1"]);
    expect(cells.every((c) => c.columnId === "col-notes")).toBe(true);

    const titles = onBulkRecordTitleChange.mock.calls.flatMap((c) => c[0] as Array<{ recordId: string; title: string }>);
    expect(titles.map((t) => t.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("pasting the Client / Company column sets records.title and clears Untitled", async () => {
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);

    render(
      <Harness
        recordCount={3}
        onBulkCellChange={onBulkCellChange}
        onBulkRecordTitleChange={onBulkRecordTitleChange}
      />,
    );
    selectAllCells();

    // Title column only, 3 rows.
    await pasteIntoGrid("Acme Corp\nGlobex\nInitech");

    expect(onBulkRecordTitleChange).toHaveBeenCalledTimes(1);
    const titles = onBulkRecordTitleChange.mock.calls[0][0] as Array<{ recordId: string; title: string }>;
    expect(titles.map((t) => t.title)).toEqual(["Acme Corp", "Globex", "Initech"]);
    expect(document.querySelector('[data-testid="titles"]')!.textContent).toBe(
      "Acme Corp|Globex|Initech",
    );
    expect(document.querySelector('[data-testid="titles"]')!.textContent).not.toContain("Untitled");
  });

  it("skips computed columns and still writes hidden columns that the grid renders", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);

    render(
      <Harness
        recordCount={2}
        onBulkCellChange={onBulkCellChange}
        onBulkRecordTitleChange={onBulkRecordTitleChange}
      />,
    );
    selectAllCells();

    // Grid columns, in order: title | notes | formula | secret(hidden but rendered)
    await pasteIntoGrid("Row1\tN1\tF1\tS1\nRow2\tN2\tF2\tS2");

    const cells = onBulkCellChange.mock.calls.flatMap(
      (c) => c[0] as Array<{ columnId: string; value: ColumnValue }>,
    );
    // formula is computed -> skipped by the same guard that skips read-only columns.
    expect(cells.map((c) => c.columnId)).toEqual([
      "col-notes",
      "col-secret",
      "col-notes",
      "col-secret",
    ]);
    expect(cells.map((c) => c.value)).toEqual(["N1", "S1", "N2", "S2"]);
    expect(cells.some((c) => c.columnId === "col-formula")).toBe(false);

    const titles = onBulkRecordTitleChange.mock.calls.flatMap(
      (c) => c[0] as Array<{ title: string }>,
    );
    expect(titles.map((t) => t.title)).toEqual(["Row1", "Row2"]);
  });

  it("drops source columns past the last grid column instead of wrapping", async () => {
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);

    render(
      <Harness
        recordCount={1}
        onBulkCellChange={onBulkCellChange}
        onBulkRecordTitleChange={onBulkRecordTitleChange}
      />,
    );
    selectAllCells();

    // 6 source columns, only 4 exist in the grid.
    await pasteIntoGrid("T\tN\tF\tS\tX\tY");

    const cells = onBulkCellChange.mock.calls.flatMap(
      (c) => c[0] as Array<{ columnId: string; value: ColumnValue }>,
    );
    expect(cells.map((c) => c.value)).toEqual(["N", "S"]);
    expect(cells.some((c) => c.value === "X" || c.value === "Y")).toBe(false);
  });

  it("undo restores the previous values in a single step (one entry per paste)", async () => {
    const initial = new Map<string, ColumnValue>([
      ["rec-1:col-notes", "old-1"],
      ["rec-2:col-notes", "old-2"],
      ["rec-3:col-notes", "old-3"],
    ]);
    const onBulkCellChange = vi.fn().mockResolvedValue(undefined);
    const onBulkRecordTitleChange = vi.fn().mockResolvedValue(undefined);

    render(
      <Harness
        recordCount={3}
        cellValues={initial}
        onBulkCellChange={onBulkCellChange}
        onBulkRecordTitleChange={onBulkRecordTitleChange}
      />,
    );
    selectAllCells();

    await pasteIntoGrid("T1\tnew-1\nT2\tnew-2\nT3\tnew-3");
    expect(onBulkCellChange).toHaveBeenCalledTimes(1);

    // Ctrl+Z on the grid container.
    const grid = document.querySelector<HTMLElement>('[role="grid"]');
    if (!grid) throw new Error("grid container not found");
    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // One undo step restores all three cells: the last bulk write is the inverse.
    expect(onBulkCellChange).toHaveBeenCalledTimes(2);
    const undo = onBulkCellChange.mock.calls[1][0] as Array<{ recordId: string; columnId: string; value: ColumnValue }>;
    expect(undo).toHaveLength(3);
    expect(undo.map((u) => u.value)).toEqual(["old-1", "old-2", "old-3"]);
  });
});