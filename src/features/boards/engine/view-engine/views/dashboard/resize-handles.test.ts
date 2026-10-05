import { describe, it, expect } from "vitest";
import { GRID_COLUMNS } from "./dashboard-types";
import { computeResize, snapResize, createResizeState, RESIZE_HANDLES, type ResizeState, type ResizeDirection } from "./resize-handles";

const colWidth = 100;
const rowHeight = 80;
const minW = 2;
const minH = 2;
const maxW = GRID_COLUMNS;
const maxH = 24;

function makeState(
  direction: ResizeDirection,
  widget: { w: number; h: number; x: number; y: number },
  clientX = 500,
  clientY = 300,
): ResizeState {
  return createResizeState(
    direction,
    {
      id: "test",
      type: "chart",
      title: "Test",
      ...widget,
      minW: 2,
      minH: 2,
      config: {},
      hasFilter: false,
    },
    clientX,
    clientY,
  );
}

describe("computeResize (bottom-right corner only)", () => {
  it("grows width when dragging right", () => {
    const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 }, 500, 300);
    const result = computeResize(state, 700, 300, colWidth, rowHeight, minW, minH, maxW, maxH);
    expect(result.w).toBeCloseTo(6, 5);
    expect(result.h).toBeCloseTo(4, 5);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("grows height when dragging down", () => {
    const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 }, 500, 300);
    const result = computeResize(state, 500, 460, colWidth, rowHeight, minW, minH, maxW, maxH);
    expect(result.h).toBeCloseTo(6, 5);
    expect(result.w).toBeCloseTo(4, 5);
  });

  it("shrinks width when dragging left", () => {
    const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 }, 700, 300);
    const result = computeResize(state, 600, 300, colWidth, rowHeight, minW, minH, maxW, maxH);
    expect(result.w).toBeCloseTo(3, 5);
  });

  describe("constraints", () => {
    it("does not shrink below minW", () => {
      const state = makeState("se", { w: 2, h: 4, x: 0, y: 0 }, 500, 300);
      const result = computeResize(state, 400, 300, colWidth, rowHeight, minW, minH, maxW, maxH);
      expect(result.w).toBe(minW);
    });

    it("does not shrink below minH", () => {
      const state = makeState("se", { w: 4, h: 2, x: 0, y: 0 }, 500, 300);
      const result = computeResize(state, 500, 200, colWidth, rowHeight, minW, minH, maxW, maxH);
      expect(result.h).toBe(minH);
    });

    it("does not exceed maxW", () => {
      const state = makeState("se", { w: 8, h: 4, x: 0, y: 0 }, 500, 300);
      const result = computeResize(state, 2000, 300, colWidth, rowHeight, minW, minH, maxW, maxH);
      expect(result.w).toBe(maxW);
    });

    it("does not exceed maxH", () => {
      const state = makeState("se", { w: 4, h: 20, x: 0, y: 0 }, 500, 300);
      const result = computeResize(state, 500, 5000, colWidth, rowHeight, minW, minH, maxW, maxH);
      expect(result.h).toBe(maxH);
    });

    it("does not let x go below 0", () => {
      const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 }, 500, 300);
      const result = computeResize(state, -2000, 300, colWidth, rowHeight, minW, minH, maxW, maxH);
      expect(result.x).toBeGreaterThanOrEqual(0);
    });

    it("does not let y go below 0", () => {
      const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 }, 500, 300);
      const result = computeResize(state, 500, -2000, colWidth, rowHeight, minW, minH, maxW, maxH);
      expect(result.y).toBeGreaterThanOrEqual(0);
    });
  });

  describe("no-op when colWidth or rowHeight is 0", () => {
    it("returns start values when colWidth is 0", () => {
      const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 });
      const result = computeResize(state, 100, 100, 0, rowHeight, minW, minH, maxW, maxH);
      expect(result.w).toBe(4);
      expect(result.h).toBe(4);
    });

    it("returns start values when rowHeight is 0", () => {
      const state = makeState("se", { w: 4, h: 4, x: 0, y: 0 });
      const result = computeResize(state, 100, 100, colWidth, 0, minW, minH, maxW, maxH);
      expect(result.w).toBe(4);
      expect(result.h).toBe(4);
    });
  });
});

describe("snapResize", () => {
  it("rounds to nearest grid unit", () => {
    const result = snapResize({ w: 5.4, h: 3.6, x: 2.1, y: 1.9 }, minW, minH, maxW, maxH);
    expect(result.w).toBe(5);
    expect(result.h).toBe(4);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
  });

  it("enforces minW", () => {
    const result = snapResize({ w: 1.2, h: 4, x: 2, y: 2 }, minW, minH, maxW, maxH);
    expect(result.w).toBe(minW);
  });

  it("enforces maxW", () => {
    const result = snapResize({ w: 15.8, h: 4, x: 2, y: 2 }, minW, minH, maxW, maxH);
    expect(result.w).toBe(maxW);
  });

  it("clamps x within grid bounds", () => {
    const result = snapResize({ w: 5, h: 4, x: -3, y: 2 }, minW, minH, maxW, maxH);
    expect(result.x).toBe(0);
  });

  it("clamps x so x + w <= maxW", () => {
    const result = snapResize({ w: 5, h: 4, x: 15, y: 2 }, minW, minH, maxW, maxH);
    expect(result.x).toBe(maxW - 5);
  });

  it("clamps y to non-negative", () => {
    const result = snapResize({ w: 5, h: 4, x: 2, y: -3 }, minW, minH, maxW, maxH);
    expect(result.y).toBe(0);
  });
});

describe("createResizeState", () => {
  it("creates correct state from widget and pointer position", () => {
    const state = createResizeState(
      "se",
      { id: "w1", type: "chart", title: "Test", x: 3, y: 5, w: 4, h: 6, config: {}, hasFilter: false },
      100,
      200,
    );
    expect(state.direction).toBe("se");
    expect(state.startW).toBe(4);
    expect(state.startH).toBe(6);
    expect(state.startPx).toBe(3);
    expect(state.startPy).toBe(5);
    expect(state.startClientX).toBe(100);
    expect(state.startClientY).toBe(200);
  });
});

describe("RESIZE_HANDLES configuration", () => {
  it("has exactly 1 handle (bottom-right only)", () => {
    expect(RESIZE_HANDLES).toHaveLength(1);
  });

  it("exposes only the se direction", () => {
    expect(RESIZE_HANDLES[0]?.direction).toBe("se");
  });

  it("uses the nwse-resize cursor", () => {
    expect(RESIZE_HANDLES[0]?.cursor).toBe("cursor-nwse-resize");
  });
});
