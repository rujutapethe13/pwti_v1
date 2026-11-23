import { describe, it, expect } from "vitest";
import {
  mapSourceColumnsToTarget,
  type ColumnMeta,
  type ColumnDefinitionMinimal,
  type ColumnMapping,
} from "@/features/boards/engine/lib/grid-clipboard";

function makeSourceMeta(cols: Array<{ id?: string; title: string; type: string; isPrimary?: boolean }>): ColumnMeta[] {
  return cols.map((c) => ({ id: c.id ?? "", title: c.title, type: c.type, isPrimary: c.isPrimary ?? false }));
}

function makeTargetCol(cols: Array<{ id: string; label: string; type: string; isPrimary?: boolean; hidden?: boolean }>): ColumnDefinitionMinimal[] {
  return cols.map((c) => ({ id: c.id, label: c.label, type: c.type, isPrimary: c.isPrimary ?? false, hidden: c.hidden }));
}

function findTarget(target: ColumnDefinitionMinimal[], index: number | null): ColumnDefinitionMinimal | null {
  return index !== null ? target[index] : null;
}

describe("column mapping", () => {
  it("maps by column ID when same board (exact ID match)", () => {
    const source = makeSourceMeta([
      { id: "col-title", title: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", title: "Type of Job", type: "status" },
      { id: "col-comment", title: "Comment", type: "text" },
    ]);
    const target = makeTargetCol([
      { id: "col-title", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", label: "Type of Job", type: "status" },
      { id: "col-comment", label: "Comment", type: "text" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    expect(mappings).toHaveLength(3);
    expect(mappings[0]).toEqual({ sourceIndex: 0, targetIndex: 0, matchType: "id" });
    expect(mappings[1]).toEqual({ sourceIndex: 1, targetIndex: 1, matchType: "id" });
    expect(mappings[2]).toEqual({ sourceIndex: 2, targetIndex: 2, matchType: "id" });
    expect(findTarget(target, mappings[0].targetIndex)).toBe(target[0]);
    expect(findTarget(target, mappings[1].targetIndex)).toBe(target[1]);
    expect(findTarget(target, mappings[2].targetIndex)).toBe(target[2]);
  });

  it("maps by column title when cross-board (different IDs, same titles)", () => {
    const source = makeSourceMeta([
      { id: "col-a", title: "Client / Company", type: "text", isPrimary: true },
      { id: "col-b", title: "Type of Job", type: "status" },
      { id: "col-c", title: "Comment", type: "text" },
    ]);
    const target = makeTargetCol([
      { id: "col-x", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-y", label: "Type of Job", type: "status" },
      { id: "col-z", label: "Comment", type: "text" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    expect(mappings).toHaveLength(3);
    expect(mappings[0].matchType).toBe("title");
    expect(findTarget(target, mappings[0].targetIndex)).toBe(target[0]);
    expect(mappings[1].matchType).toBe("title");
    expect(findTarget(target, mappings[1].targetIndex)).toBe(target[1]);
    expect(mappings[2].matchType).toBe("title");
    expect(findTarget(target, mappings[2].targetIndex)).toBe(target[2]);
  });

  it("maps by position for external paste (no source metadata)", () => {
    const source = makeSourceMeta([
      { id: "", title: "", type: "text" },
      { id: "", title: "", type: "text" },
      { id: "", title: "", type: "text" },
    ]);
    const target = makeTargetCol([
      { id: "col-1", label: "A", type: "text" },
      { id: "col-2", label: "B", type: "text" },
      { id: "col-3", label: "C", type: "text" },
      { id: "col-4", label: "D", type: "text" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target, 1, 3); // start at column 1 (B), 3 source columns

    expect(mappings).toHaveLength(3);
    expect(mappings[0]).toEqual({ sourceIndex: 0, targetIndex: 1, matchType: "position" });
    expect(mappings[1]).toEqual({ sourceIndex: 1, targetIndex: 2, matchType: "position" });
    expect(mappings[2]).toEqual({ sourceIndex: 2, targetIndex: 3, matchType: "position" });
  });

  it("handles different column order (same board, different order)", () => {
    // Source board: Client, Type, Comment
    // Target board: Comment, Client, Type (different order)
    const source = makeSourceMeta([
      { id: "col-client", title: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", title: "Type of Job", type: "status" },
      { id: "col-comment", title: "Comment", type: "text" },
    ]);
    const target = makeTargetCol([
      { id: "col-comment", label: "Comment", type: "text" },
      { id: "col-client", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", label: "Type of Job", type: "status" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    // Should map by ID, not position
    expect(findTarget(target, mappings[0].targetIndex)).toBe(target[1]); // Client -> Client (index 1 in target)
    expect(findTarget(target, mappings[1].targetIndex)).toBe(target[2]); // Type -> Type (index 2 in target)
    expect(findTarget(target, mappings[2].targetIndex)).toBe(target[0]); // Comment -> Comment (index 0 in target)
    expect(mappings.every((m) => m.matchType === "id")).toBe(true);
  });

  it("handles missing column in target (source has column target lacks)", () => {
    const source = makeSourceMeta([
      { id: "col-client", title: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", title: "Type of Job", type: "status" },
      { id: "col-extra", title: "Extra Column", type: "text" }, // Not in target
    ]);
    const target = makeTargetCol([
      { id: "col-client", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", label: "Type of Job", type: "status" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    expect(mappings).toHaveLength(3);
    expect(mappings[0].matchType).toBe("id");
    expect(mappings[1].matchType).toBe("id");
    expect(mappings[2].matchType).toBe("none");
    expect(mappings[2].targetIndex).toBeNull();
  });

  it("handles extra column in target (target has column source lacks)", () => {
    const source = makeSourceMeta([
      { id: "col-client", title: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", title: "Type of Job", type: "status" },
    ]);
    const target = makeTargetCol([
      { id: "col-client", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", label: "Type of Job", type: "status" },
      { id: "col-extra", label: "Extra Column", type: "text" }, // Not in source
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    expect(mappings).toHaveLength(2);
    expect(mappings[0].matchType).toBe("id");
    expect(mappings[1].matchType).toBe("id");
    // Extra column in target is simply not mapped (no source column for it)
  });

  it("handles case-insensitive title matching", () => {
    const source = makeSourceMeta([
      { id: "col-a", title: "CLIENT / COMPANY", type: "text", isPrimary: true },
      { id: "col-b", title: "type of job", type: "status" },
    ]);
    const target = makeTargetCol([
      { id: "col-x", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-y", label: "Type of Job", type: "status" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    expect(mappings[0].matchType).toBe("title");
    expect(findTarget(target, mappings[0].targetIndex)).toBe(target[0]);
    expect(mappings[1].matchType).toBe("title");
    expect(findTarget(target, mappings[1].targetIndex)).toBe(target[1]);
  });

  it("handles trimmed title matching", () => {
    const source = makeSourceMeta([
      { id: "col-a", title: "  Client / Company  ", type: "text", isPrimary: true },
    ]);
    const target = makeTargetCol([
      { id: "col-x", label: "Client / Company", type: "text", isPrimary: true },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    expect(mappings[0].matchType).toBe("title");
    expect(findTarget(target, mappings[0].targetIndex)).toBe(target[0]);
  });

  it("primary column is correctly identified in mapping", () => {
    const source = makeSourceMeta([
      { id: "col-client", title: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", title: "Type of Job", type: "status" },
    ]);
    const target = makeTargetCol([
      { id: "col-client", label: "Client / Company", type: "text", isPrimary: true },
      { id: "col-type", label: "Type of Job", type: "status" },
    ]);

    const mappings = mapSourceColumnsToTarget(source, target);

    const primaryMapping = mappings.find((m) => findTarget(target, m.targetIndex)?.isPrimary);
    expect(primaryMapping).not.toBeUndefined();
    expect(findTarget(target, primaryMapping!.targetIndex)!.id).toBe("col-client");
  });
});