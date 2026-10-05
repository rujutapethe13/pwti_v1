import { describe, expect, it, vi } from "vitest";
import { MirrorStore } from "@/features/boards/engine/connected-data/mirror-store";
import type { ColumnValue } from "@/features/boards/engine/types";

/**
 * The MirrorStore is seeded from the demo data module. We assert against the
 * real demo boards (production, analytics, cgi) so the tests stay honest about
 * cross-board reads.
 */
describe("MirrorStore: seeding from demo data", () => {
  it("seeds columns for demo boards", () => {
    const store = new MirrorStore();
    const prodColumns = store.getColumns("production");
    expect(prodColumns.length).toBeGreaterThan(0);
    expect(prodColumns.map((c) => c.id)).toContain("production-status");
  });

  it("seeds cell values for demo boards", () => {
    const store = new MirrorStore();
    expect(store.getCellValue("production", "record-1", "production-status")).toBe("Done");
    expect(store.getCellValue("analytics", "analytics-1", "analytics-value")).toBe(92);
  });

  it("seeds records", () => {
    const store = new MirrorStore();
    const rec = store.getRecord("production", "record-1");
    expect(rec?.title).toBe("Levis");
  });
});

describe("MirrorStore: cross-board reads", () => {
  it("reads a cell from a different board than the one being viewed", () => {
    const store = new MirrorStore();
    // Simulate: viewing "production", but reading a value from "analytics".
    const value = store.getCellValue("analytics", "analytics-2", "analytics-value");
    expect(value).toBe(18);
  });

  it("returns null for an unknown cell", () => {
    const store = new MirrorStore();
    expect(store.getCellValue("production", "record-1", "does-not-exist")).toBeNull();
  });

  it("returns null for an unknown board", () => {
    const store = new MirrorStore();
    expect(store.getCellValue("nope", "r", "c")).toBeNull();
  });

  it("looks up a column definition by id", () => {
    const store = new MirrorStore();
    const col = store.getColumn("production", "production-status");
    expect(col?.type).toBe("status");
  });

  it("filters columns by type", () => {
    const store = new MirrorStore();
    const textCols = store.getColumnsByType("analytics", "text");
    expect(textCols.map((c) => c.id)).toContain("analytics-metric");
  });
});

describe("MirrorStore: write-through + propagation", () => {
  it("updates a source cell value in the store", () => {
    const store = new MirrorStore();
    store.setCellValue("production", "record-1", "production-status", "Done");
    expect(store.getCellValue("production", "record-1", "production-status")).toBe("Done");
  });

  it("notifies subscribers when a value changes (live propagation)", () => {
    const store = new MirrorStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setCellValue("production", "record-1", "production-status", "Done");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports multiple subscribers (every watching mirror re-renders)", () => {
    const store = new MirrorStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.setCellValue("analytics", "analytics-1", "analytics-value", 100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further notifications", () => {
    const store = new MirrorStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    store.setCellValue("production", "record-1", "production-status", "Done");
    unsub();
    store.setCellValue("production", "record-1", "production-status", "QA");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("write-through to a different board is readable cross-board", () => {
    const store = new MirrorStore();
    // Mirror on board A writes through to a source cell on board B.
    store.setCellValue("analytics", "analytics-1", "analytics-value", 120);
    // A mirror on board A reading that source cell sees the new value.
    expect(store.getCellValue("analytics", "analytics-1", "analytics-value")).toBe(120);
  });
});

describe("MirrorStore: syncBoard (live page state)", () => {
  it("overwrites a board's cells from a live source", () => {
    const store = new MirrorStore();
    const live = new Map<string, ColumnValue>([
      ["record-1:production-status", "Blocked"],
      ["record-1:production-progress", 50],
    ]);
    store.syncBoard("production", live);
    expect(store.getCellValue("production", "record-1", "production-status")).toBe("Blocked");
    expect(store.getCellValue("production", "record-1", "production-progress")).toBe(50);
  });

  it("syncBoard notifies subscribers", () => {
    const store = new MirrorStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.syncBoard("production", new Map());
    expect(listener).toHaveBeenCalled();
  });
});
