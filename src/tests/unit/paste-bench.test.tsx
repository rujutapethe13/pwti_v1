/**
 * Paste benchmark (client side, server mocked).
 *
 * Measures the work the grid does per paste: clipboard parse, cell mapping and
 * the write fan-out. The server is mocked, so the absolute milliseconds are a
 * local lower bound — the production difference is in the NUMBER of requests
 * (see the console table at the end).
 *
 * Run: npx vitest run src/tests/unit/paste-bench.test.tsx
 */
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
  serverEnv: { SUPABASE_SERVICE_ROLE_KEY: "test-service-key", OPENAI_API_KEY: "test-openai-key" },
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
import { matrixToTSV, padMatrix, parseTSV } from "@/features/boards/engine/lib/grid-clipboard";

const boardId = "board-1";

const board = {
  id: boardId,
  organizationId: "org-1",
  workspaceId: "ws-1",
  name: "Bench",
  status: "active",
  sharedWith: [],
  primaryColumnLabel: "Batch Details",
  titleColumnLabel: "Client / Company Name",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as BoardDefinition;

const COLUMNS = 5;

const columns: ColumnDefinition[] = Array.from({ length: COLUMNS }, (_, i) => ({
  id: i === 0 ? "col-title" : `col-${i}`,
  boardId,
  key: `c${i}`,
  label: i === 0 ? "Client / Company Name" : `Column ${i}`,
  type: "text",
  required: false,
  hidden: false,
  frozen: false,
  defaultValue: null,
  settings: {},
  permissions: { view: [], edit: [], configure: [] },
  validation: [],
  version: 1,
  order: i,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})) as unknown as ColumnDefinition[];

const groups: Group[] = [
  { id: "group-1", organizationId: "org-1", workspaceId: "ws-1", boardId, name: "G", collapsed: false, order: 0, status: "active" } as unknown as Group,
];

const view = {
  id: "view-1", boardId, name: "Table", type: "table", isDefault: true,
  visibleColumnIds: [], filters: [], sorting: [], grouping: [], settings: {},
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeRecords(count: number): BoardRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `rec-${i + 1}`,
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId,
    groupId: "group-1",
    title: `Client ${i}`,
    status: "active",
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  })) as unknown as BoardRecord[];
}

type Stats = { bulkCalls: number; bulkCells: number; singleCalls: number; titleCalls: number };

function Harness({ recordCount, stats }: { recordCount: number; stats: Stats }) {
  const plugin = pluginRegistry.getViewPlugin("table") as ViewPlugin;
  const Renderer = plugin.component;
  const [records] = useState(() => makeRecords(recordCount));
  const [values] = useState(() => new Map<string, ColumnValue>());

  return (
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
        // Bulk path: the chunked write fan-out used by paste.
        onBulkCellChange: (updates: Array<{ recordId: string; columnId: string; value: ColumnValue }>) => {
          stats.bulkCalls += 1;
          stats.bulkCells += updates.length;
          return Promise.resolve();
        },
        onBulkRecordTitleChange: (updates: Array<{ recordId: string; title: string }>) => {
          stats.titleCalls += 1;
          return Promise.resolve();
        },
        onBulkNewItem: (count: number) => {
          stats.bulkCalls += 1;
          return Promise.resolve(Array.from({ length: count }, (_, i) => `new-${i}`));
        },
      } as unknown as ViewRendererProps}
    />
  );
}

/** Legacy path: no bulk callbacks, so every cell becomes its own write. */
function LegacyHarness({ recordCount, stats }: { recordCount: number; stats: Stats }) {
  const plugin = pluginRegistry.getViewPlugin("table") as ViewPlugin;
  const Renderer = plugin.component;
  const [records] = useState(() => makeRecords(recordCount));
  const [values] = useState(() => new Map<string, ColumnValue>());

  return (
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
        onCellChange: () => {
          stats.singleCalls += 1;
          stats.bulkCells += 1;
        },
        onRecordTitleChange: () => {
          stats.singleCalls += 1;
          stats.titleCalls += 1;
        },
        onNewItem: () => {
          stats.singleCalls += 1;
          return Promise.resolve("new-1");
        },
      } as unknown as ViewRendererProps}
    />
  );
}

function tsv(rows: number, cols: number): string {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => `r${r}c${c}`).join("\t"),
  ).join("\n");
}

async function paste(text: string): Promise<number> {
  const grid = document.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error("grid container not found");
  fireEvent.keyDown(grid, { key: "a", ctrlKey: true });

  const event = new ClipboardEvent("paste", { bubbles: true } as MouseEventInit);
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (fmt: string) => (fmt === "text/plain" ? text : ""), setData: () => undefined },
    configurable: true,
  });

  const started = performance.now();
  window.dispatchEvent(event);
  // doGridPaste is async; flush the write chain.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return performance.now() - started;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("paste benchmark", () => {
  it("reports paste cost for 50 rows", async () => {
    const rows = 50;
    const stats: Stats = { bulkCalls: 0, bulkCells: 0, singleCalls: 0, titleCalls: 0 };

    render(<Harness recordCount={rows} stats={stats} />);
    const bulkMs = await paste(tsv(rows, COLUMNS));

    const legacy: Stats = { bulkCalls: 0, bulkCells: 0, singleCalls: 0, titleCalls: 0 };
    cleanup();
    render(<LegacyHarness recordCount={rows} stats={legacy} />);
    const legacyMs = await paste(tsv(rows, COLUMNS));

    // 50 rows x 5 columns = 250 cells; the title column is 50 of them.
    const cells = rows * (COLUMNS - 1);

    // Pure CPU cost of the work the paste path owns: parse + re-serialize +
    // chunk. React rendering dominates the wall-clock above, so this isolates
    // the part that changed.
    const text = tsv(rows, COLUMNS);
    const cpuStart = performance.now();
    for (let i = 0; i < 20; i++) {
      const parsed = parseTSV(text);
      matrixToTSV(padMatrix(parsed));
    }
    const cpuMs = (performance.now() - cpuStart) / 20;

    // eslint-disable-next-line no-console
    console.info(
      [
        "",
        "── paste benchmark (50 rows x 5 columns, server mocked) ──",
        `cells written:            ${cells} (+${rows} titles)`,
        `legacy  cell writes:     ${legacy.bulkCells} (one server action per cell)`,
        `batched cell writes:     ${stats.bulkCalls} (${stats.bulkCells} cells, <=200 per write)`,
        `legacy  client ms:       ${legacyMs.toFixed(1)} (render-bound in jsdom)`,
        `batched client ms:       ${bulkMs.toFixed(1)} (render-bound in jsdom)`,
        `parse+map CPU per paste: ${cpuMs.toFixed(2)} ms`,
        "",
      ].join("\n"),
    );

    expect(stats.bulkCells).toBe(cells);
    // Batched fan-out must be dramatically smaller than one call per cell.
    expect(stats.bulkCalls + stats.titleCalls).toBeLessThan(legacy.singleCalls / 10);
  }, 30000);
});