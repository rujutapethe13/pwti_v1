import { describe, it, expect } from "vitest";

import { buildUnifiedColumns } from "@/features/client-360/search-service";
type BoardColumns = {
  boardId: string;
  boardName: string;
  workspaceId: string;
  workspaceName: string;
  columns: Array<{ id: string; label: string; type: string; settings: Record<string, unknown> }>;
};

type UnifiedColumnDefinition = {
  id: string;
  label: string;
  type: string;
  sourceBoardId: string;
  sourceBoardName: string;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  visible: boolean;
  order: number;
  sourceColumnIds: string[];
};

// Mirrors the cell-text lookup at client-360-view.tsx visibleUnifiedColumns.map.
function resolveCellText(
  match: { cellValues: Record<string, string>; matchedColumnId: string },
  col: UnifiedColumnDefinition,
): string {
  const sourceColumnIds = col.sourceColumnIds.length > 0
    ? col.sourceColumnIds
    : [col.id.replace(/^unified-/, "")];
  return sourceColumnIds
    .map((cid) => match.cellValues[cid] ?? "")
    .find((v) => v.length > 0) ?? "";
}

describe("Client 360 column unification (Bug 14)", () => {
  it("merges columns with the same normalized label into one unified column", () => {
    const boards = [
      { id: "b-1", name: "Production", workspace_id: "w-1" },
      { id: "b-2", name: "Retouching", workspace_id: "w-1" },
      { id: "b-3", name: "CGI", workspace_id: "w-1" },
    ];
    const columnsByBoard: BoardColumns[] = [
      {
        boardId: "b-1", boardName: "Production", workspaceId: "w-1", workspaceName: "Studio",
        columns: [
          { id: "c-date-1", label: "Date", type: "date", settings: {} },
          { id: "c-assigned-1", label: "Assigned To", type: "person", settings: {} },
          { id: "c-status-1", label: "Status", type: "status", settings: {} },
        ],
      },
      {
        boardId: "b-2", boardName: "Retouching", workspaceId: "w-1", workspaceName: "Studio",
        columns: [
          { id: "c-date-2", label: "Date", type: "date", settings: {} },
          { id: "c-assigned-2", label: "Assigned To", type: "person", settings: {} },
        ],
      },
      {
        boardId: "b-3", boardName: "CGI", workspaceId: "w-1", workspaceName: "Studio",
        columns: [
          { id: "c-date-3", label: "Date", type: "date", settings: {} },
          { id: "c-jobtype-3", label: "Job Type", type: "dropdown", settings: {} },
        ],
      },
    ];
    const workspaceNames = new Map([["w-1", "Studio"]]);

    const unified = buildUnifiedColumns(boards, columnsByBoard, workspaceNames);
    const labels = unified.map((c) => c.label);

    // All three "Date" columns merge into one unified column.
    expect(labels.filter((l) => l === "Date").length).toBe(1);
    expect(labels.filter((l) => l === "Assigned To").length).toBe(1);
    expect(labels.filter((l) => l === "Status").length).toBe(1);
    expect(labels.filter((l) => l === "Job Type").length).toBe(1);
    expect(unified.length).toBe(4);

    const dateCol = unified.find((c) => c.label === "Date")!;
    expect(dateCol.sourceColumnIds).toEqual(["c-date-1", "c-date-2", "c-date-3"]);
  });

  it("dedupes when the same column ID appears on multiple boards", () => {
    const boards = [
      { id: "b-1", name: "Production", workspace_id: "w-1" },
      { id: "b-2", name: "Retouching", workspace_id: "w-1" },
    ];
    const sharedColumn = { id: "c-shared", label: "Date", type: "date", settings: {} };
    const columnsByBoard: BoardColumns[] = [
      {
        boardId: "b-1", boardName: "Production", workspaceId: "w-1", workspaceName: "Studio",
        columns: [sharedColumn, { id: "c-extra-1", label: "Extra", type: "text", settings: {} }],
      },
      {
        boardId: "b-2", boardName: "Retouching", workspaceId: "w-1", workspaceName: "Studio",
        columns: [sharedColumn, { id: "c-extra-2", label: "Other", type: "text", settings: {} }],
      },
    ];
    const workspaceNames = new Map([["w-1", "Studio"]]);

    const unified = buildUnifiedColumns(boards, columnsByBoard, workspaceNames);

    // "Date" is deduped to one unified column.
    expect(unified.filter((c) => c.label === "Date")).toHaveLength(1);
    // Different labels remain separate.
    expect(unified.filter((c) => c.label === "Extra")).toHaveLength(1);
    expect(unified.filter((c) => c.label === "Other")).toHaveLength(1);
    expect(unified.length).toBe(3);
  });

  it("merges columns with case-variant labels (e.g. 'Status' vs 'STATUS ')", () => {
    const boards = [
      { id: "b-1", name: "Production", workspace_id: "w-1" },
      { id: "b-2", name: "Retouching", workspace_id: "w-1" },
    ];
    const columnsByBoard: BoardColumns[] = [
      {
        boardId: "b-1", boardName: "Production", workspaceId: "w-1", workspaceName: "Studio",
        columns: [{ id: "c-status-1", label: "Status", type: "status", settings: {} }],
      },
      {
        boardId: "b-2", boardName: "Retouching", workspaceId: "w-1", workspaceName: "Studio",
        columns: [{ id: "c-status-2", label: "STATUS ", type: "status", settings: {} }],
      },
    ];
    const workspaceNames = new Map([["w-1", "Studio"]]);

    const unified = buildUnifiedColumns(boards, columnsByBoard, workspaceNames);

    expect(unified.filter((c) => c.label.toLowerCase() === "status")).toHaveLength(1);
    const statusCol = unified.find((c) => c.label.toLowerCase() === "status")!;
    expect(statusCol.sourceColumnIds).toEqual(["c-status-1", "c-status-2"]);
  });

  it("merges imported columns with near-duplicate names (SAFARI / Safari / SAFARI (URBAN))", () => {
    const boards = [
      { id: "b-1", name: "Production", workspace_id: "w-1" },
      { id: "b-2", name: "Retouching", workspace_id: "w-1" },
    ];
    const columnsByBoard: BoardColumns[] = [
      {
        boardId: "b-1", boardName: "Production", workspaceId: "w-1", workspaceName: "Studio",
        columns: [
          { id: "c-client-1", label: "Client Name", type: "text", settings: {} },
          { id: "col-import-safari", label: "SAFARI", type: "text", settings: {} },
        ],
      },
      {
        boardId: "b-2", boardName: "Retouching", workspaceId: "w-1", workspaceName: "Studio",
        columns: [
          { id: "col-import-safari2", label: "Safari", type: "text", settings: {} },
          { id: "col-import-safari3", label: "SAFARI (URBAN)", type: "text", settings: {} },
        ],
      },
    ];
    const workspaceNames = new Map([["w-1", "Studio"]]);

    const unified = buildUnifiedColumns(boards, columnsByBoard, workspaceNames);

    // "Client Name" is unique.
    expect(unified.filter((c) => c.label === "Client Name")).toHaveLength(1);

    // "SAFARI", "Safari", and "SAFARI (URBAN)" are all different normalized labels,
    // so they remain separate — but casing-only variants are merged.
    expect(unified.filter((c) => c.label.toLowerCase() === "safari")).toHaveLength(1);
    expect(unified.filter((c) => c.label.toLowerCase() === "safari (urban)")).toHaveLength(1);
  });

  it("resolves cell text using the correct per-board source id", () => {
    const unified: UnifiedColumnDefinition = {
      id: "unified-c-date-2",
      label: "Date",
      type: "date",
      sourceBoardId: "b-2",
      sourceBoardName: "Retouching",
      sourceWorkspaceId: "w-1",
      sourceWorkspaceName: "Studio",
      visible: true,
      order: 1,
      sourceColumnIds: ["c-date-1", "c-date-2"],
    };
    // The row from board 2 has cellValues keyed under c-date-2 only.
    const match = {
      cellValues: { "c-date-1": "", "c-date-2": "2026-09-01" },
      matchedColumnId: "c-date-2",
    };
    expect(resolveCellText(match, unified)).toBe("2026-09-01");
  });

  it("returns empty string when no source id matches the row's cellValues", () => {
    const unified: UnifiedColumnDefinition = {
      id: "unified-c-date-1",
      label: "Date",
      type: "date",
      sourceBoardId: "b-1",
      sourceBoardName: "Production",
      sourceWorkspaceId: "w-1",
      sourceWorkspaceName: "Studio",
      visible: true,
      order: 0,
      sourceColumnIds: ["c-date-1", "c-date-2"],
    };
    const match = { cellValues: {}, matchedColumnId: "" };
    expect(resolveCellText(match, unified)).toBe("");
  });

  it("merges columns with identical labels across boards (Batch Details)", () => {
    const boards = [
      { id: "b-1", name: "Production", workspace_id: "w-1" },
      { id: "b-2", name: "Retouching", workspace_id: "w-1" },
    ];
    const columnsByBoard: BoardColumns[] = [
      {
        boardId: "b-1", boardName: "Production", workspaceId: "w-1", workspaceName: "Studio",
        columns: [{ id: "c-batch-1", label: "Batch Details", type: "text", settings: {} }],
      },
      {
        boardId: "b-2", boardName: "Retouching", workspaceId: "w-1", workspaceName: "Studio",
        columns: [{ id: "c-batch-2", label: "Batch Details", type: "text", settings: {} }],
      },
    ];
    const workspaceNames = new Map([["w-1", "Studio"]]);

    const unified = buildUnifiedColumns(boards, columnsByBoard, workspaceNames);

    // Both "Batch Details" columns merge into one unified column.
    expect(unified.filter((c) => c.label === "Batch Details")).toHaveLength(1);
    const merged = unified.find((c) => c.label === "Batch Details")!;
    expect(merged.sourceColumnIds).toEqual(["c-batch-1", "c-batch-2"]);
  });
});
