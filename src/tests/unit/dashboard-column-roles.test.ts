import { describe, expect, it } from "vitest";
import type { ColumnDefinition } from "@/features/boards/engine/types";
import {
  RECORD_TITLE_COLUMN_ID,
  buildStatusBucketMap,
  classifyStatusValue,
  clientGroupKey,
  clientGroupLabel,
  isColumnCompatibleWithRole,
  isRecordOverdue,
  parseFlexibleDate,
  parseLooseNumber,
  readRoleCell,
  recordTurnaroundDays,
  resolveRecordStatus,
  suggestRoleMapping,
} from "@/features/boards/engine/view-engine/views/dashboard/column-roles";
import {
  clampWidgetsToGrid,
  createRecordTitleColumn,
} from "@/features/boards/engine/view-engine/views/dashboard/dashboard-types";
import {
  buildDefaultDashboardWidgets,
  repairRoleBoundWidgets,
} from "@/features/boards/engine/view-engine/views/dashboard/default-dashboard-template";

function column(id: string, label: string, type: ColumnDefinition["type"]): ColumnDefinition {
  return {
    id,
    boardId: "b1",
    key: id,
    label,
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: "",
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 0,
    createdAt: "",
    updatedAt: "",
  } as ColumnDefinition;
}

function cells(entries: Array<[string, string, string]>): Map<string, string> {
  return new Map(entries.map(([recordId, columnId, value]) => [`${recordId}:${columnId}`, value]));
}

describe("parseFlexibleDate", () => {
  it("reads day-first dates without swapping day and month", () => {
    const parsed = parseFlexibleDate("29-10-2025");
    expect(parsed?.getUTCFullYear()).toBe(2025);
    expect(parsed?.getUTCMonth()).toBe(9);
    expect(parsed?.getUTCDate()).toBe(29);
  });

  it("prefers day-first over year-first for ambiguous 10-03-2026", () => {
    const parsed = parseFlexibleDate("10-03-2026");
    expect(parsed?.getUTCMonth()).toBe(2);
    expect(parsed?.getUTCDate()).toBe(10);
  });

  it("accepts ISO dates and timestamps", () => {
    expect(parseFlexibleDate("2026-03-10")?.getUTCDate()).toBe(10);
    expect(parseFlexibleDate("2026-03-10T08:30:00Z")?.getUTCMonth()).toBe(2);
  });

  it("returns null for impossible and empty values instead of throwing", () => {
    expect(parseFlexibleDate("31 Feb")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate("not a date")).toBeNull();
  });
});

describe("parseLooseNumber", () => {
  it("extracts numbers from annotated text", () => {
    expect(parseLooseNumber("104 img")).toBe(104);
    expect(parseLooseNumber("13 img")).toBe(13);
  });

  it("sums plus-separated counts", () => {
    expect(parseLooseNumber("41+15")).toBe(56);
    expect(parseLooseNumber("41 + 15")).toBe(56);
  });

  it("passes through plain numbers and rejects unparseable text", () => {
    expect(parseLooseNumber(12)).toBe(12);
    expect(parseLooseNumber("1,200")).toBe(1200);
    expect(parseLooseNumber("none")).toBeNull();
    expect(parseLooseNumber("")).toBeNull();
  });
});

describe("classifyStatusValue", () => {
  it("maps the real-world status values into four buckets", () => {
    expect(classifyStatusValue("Done")).toBe("done");
    expect(classifyStatusValue("Delivered")).toBe("done");
    expect(classifyStatusValue("Uploaded")).toBe("done");
    expect(classifyStatusValue("Sent to billing team")).toBe("done");
    expect(classifyStatusValue("Upload to Ziflow")).toBe("done");
    expect(classifyStatusValue("Hold")).toBe("on_hold");
    expect(classifyStatusValue("Pending")).toBe("not_started");
    expect(classifyStatusValue("In progress")).toBe("working_on_it");
  });
});

describe("clientGroupKey", () => {
  it("groups case-insensitively and trims whitespace", () => {
    expect(clientGroupKey(" Levis ")).toBe(clientGroupKey("LEVIS"));
    expect(clientGroupKey("Levis")).toBe(clientGroupKey("LEVIS"));
  });

  it("applies aliases and survives a cyclic alias map", () => {
    expect(clientGroupKey("SAFARI TRADE", { "SAFARI TRADE": "SAFARI" })).toBe("SAFARI");
    const cyclic = { A: "B", B: "A" };
    expect(["A", "B"]).toContain(clientGroupKey("A", cyclic));
  });

  it("labels a key with its alias target when one exists", () => {
    expect(clientGroupLabel("WIPRO", { WIPRO: "Wipro Ltd" })).toBe("Wipro Ltd");
    expect(clientGroupLabel("SAFARI")).toBe("SAFARI");
  });
});

describe("suggestRoleMapping", () => {
  const columns = [
    column("c1", "Client", "text"),
    column("c2", "Job Type", "text"),
    column("c3", "Receive Date", "date"),
    column("c4", "Date of Upload", "date"),
    column("c5", "Status", "status"),
    column("c6", "No of Images", "number"),
    column("c7", "SKU Count", "number"),
    column("c8", "Artist", "text"),
  ];

  it("suggests each role from its header name", () => {
    const roles = suggestRoleMapping(columns);
    expect(roles.client).toBe("c1");
    expect(roles.jobType).toBe("c2");
    expect(roles.receivedDate).toBe("c3");
    expect(roles.completedDate).toBe("c4");
    expect(roles.status).toBe("c5");
    expect(roles.images).toBe("c6");
    expect(roles.skuCount).toBe("c7");
    expect(roles.owner).toBe("c8");
  });

  it("never assigns one column to two roles", () => {
    const roles = suggestRoleMapping([column("d1", "Date", "date"), column("d2", "Date", "date")]);
    const assigned = Object.values(roles);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("does not map a date role onto a text column", () => {
    const roles = suggestRoleMapping([column("t1", "Received", "text")]);
    expect(roles.receivedDate).toBeUndefined();
  });

  it("offers the first column as Item / Batch name when there is no mapping", () => {
    const name = { ...createRecordTitleColumn(), id: RECORD_TITLE_COLUMN_ID };
    const roles = suggestRoleMapping([name, column("c1", "Client", "text")]);
    expect(roles.client).toBe("c1");
    expect(roles.itemName).toBe(RECORD_TITLE_COLUMN_ID);
  });

  it("maps the first column to Client when its values repeat heavily", () => {
    const name = { ...createRecordTitleColumn(), id: RECORD_TITLE_COLUMN_ID };
    const roles = suggestRoleMapping([name], { nameDistinctRatio: 3 / 200 });
    expect(roles.client).toBe(RECORD_TITLE_COLUMN_ID);
    expect(roles.itemName).toBeUndefined();
  });

  it("never steals Client from a dedicated Client column", () => {
    const name = { ...createRecordTitleColumn(), id: RECORD_TITLE_COLUMN_ID };
    const roles = suggestRoleMapping([name, column("c1", "Client", "text")], {
      nameDistinctRatio: 2 / 200,
    });
    expect(roles.client).toBe("c1");
    expect(roles.itemName).toBe(RECORD_TITLE_COLUMN_ID);
  });
});

describe("isColumnCompatibleWithRole", () => {
  it("offers only date columns for date roles", () => {
    expect(isColumnCompatibleWithRole(column("d", "Received", "date"), "receivedDate")).toBe(true);
    expect(isColumnCompatibleWithRole(column("t", "Received", "text"), "receivedDate")).toBe(false);
  });

  it("offers only numeric columns for count roles", () => {
    expect(isColumnCompatibleWithRole(column("n", "Images", "number"), "skuCount")).toBe(true);
    expect(isColumnCompatibleWithRole(column("t", "Images", "text"), "skuCount")).toBe(false);
  });

  it("offers the Name first column for every text-compatible role", () => {
    const name = createRecordTitleColumn();
    for (const role of ["client", "jobType", "status", "owner", "itemName"] as const) {
      expect(isColumnCompatibleWithRole(name, role)).toBe(true);
    }
    expect(isColumnCompatibleWithRole(name, "amount")).toBe(false);
  });
});

describe("readRoleCell", () => {
  it("reads the first column from the record title", () => {
    const record = { id: "r1", title: "Levis batch 12" };
    expect(readRoleCell(record, RECORD_TITLE_COLUMN_ID, new Map())).toBe("Levis batch 12");
  });

  it("reads any other mapped column from the cell map", () => {
    const record = { id: "r1", title: "Job" };
    const cellValues = cells([["r1", "c1", "Wipro"]]);
    expect(readRoleCell(record, "c1", cellValues as never)).toBe("Wipro");
  });
});

describe("status resolution and overdue", () => {
  it("falls back to the completed date when there is no status column", () => {
    const roles = { completedDate: "done" };
    const record = { id: "r1", title: "Job" };
    const cellValues = cells([["r1", "done", "2026-01-05"]]);
    expect(resolveRecordStatus(record, roles, cellValues, {})).toBe("done");
  });

  it("uses the bucket map for a mapped status column", () => {
    const roles = { status: "s", completedDate: "done" };
    const record = { id: "r1", title: "Job" };
    const cellValues = cells([["r1", "s", "Hold"]]);
    expect(resolveRecordStatus(record, roles, cellValues, { Hold: "on_hold" })).toBe("on_hold");
  });

  it("treats a past due date as overdue only when not done", () => {
    const roles = { dueDate: "d", status: "s" };
    const record = { id: "r1", title: "Job" };
    const overdue = cells([["r1", "d", "2020-01-01"], ["r1", "s", "In progress"]]);
    const finished = cells([["r1", "d", "2020-01-01"], ["r1", "s", "Done"]]);
    const now = new Date("2026-06-01T00:00:00Z");
    expect(isRecordOverdue(record, roles, overdue, {}, now)).toBe(true);
    expect(isRecordOverdue(record, roles, finished, {}, now)).toBe(false);
  });

  it("measures turnaround between two role dates", () => {
    const roles = { receivedDate: "a", completedDate: "b" };
    const record = { id: "r1", title: "Job" };
    const cellValues = cells([["r1", "a", "2026-01-01"], ["r1", "b", "2026-01-04"]]);
    expect(recordTurnaroundDays(record, roles, cellValues)).toBe(3);
  });
});

describe("buildStatusBucketMap", () => {
  it("produces a bucket for every distinct value", () => {
    expect(buildStatusBucketMap(["Done", "Hold"])).toEqual({ Done: "done", Hold: "on_hold" });
  });
});

describe("buildDefaultDashboardWidgets", () => {
  const roles = suggestRoleMapping([
    column("c1", "Client", "text"),
    column("c2", "Job Type", "text"),
    column("c3", "Receive Date", "date"),
    column("c4", "Date of Upload", "date"),
    column("c5", "Status", "status"),
    column("c6", "No of Images", "number"),
    column("c7", "SKU Count", "number"),
    column("c8", "Artist", "text"),
  ]);

  it("lays out KPI cards, charts and lists within the grid", () => {
    const widgets = buildDefaultDashboardWidgets(roles);
    expect(widgets.length).toBeGreaterThan(0);
    for (const widget of widgets) {
      expect(widget.x).toBeGreaterThanOrEqual(0);
      expect(widget.x + widget.w).toBeLessThanOrEqual(12);
    }
    expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
  });

  it("includes one KPI card per metric", () => {
    const metrics = buildDefaultDashboardWidgets(roles)
      .filter((w) => w.type === "kpi-card")
      .map((w) => (w.config as { metric: string }).metric);
    expect(metrics).toEqual([
      "total_jobs",
      "working_on_it",
      "done",
      "overdue",
      "total_images",
      "total_skus",
    ]);
  });

  it("still builds a layout when no role is mapped", () => {
    const widgets = buildDefaultDashboardWidgets({});
    expect(widgets.length).toBeGreaterThan(0);
  });

  it("binds chart axes to roles so re-mapping repoints them", () => {
    const widgets = buildDefaultDashboardWidgets(roles);
    const status = widgets.find((w) => w.title === "Status breakdown");
    expect((status?.config as { xAxisRole?: string }).xAxisRole).toBe("status");
    const trend = widgets.find((w) => w.title === "Volume trend — received");
    expect((trend?.config as { timeRole?: string }).timeRole).toBe("receivedDate");
  });
});

describe("repairRoleBoundWidgets", () => {
  it("stops Status breakdown grouping by a stale column", () => {
    const [repaired] = repairRoleBoundWidgets([
      {
        id: "status-1700000000000-1",
        type: "chart",
        title: "Status breakdown",
        x: 8,
        y: 2,
        w: 4,
        h: 8,
        config: { chartType: "donut", xAxisColumnId: "client_col" },
        hasFilter: false,
      },
    ]);
    expect(repaired.config.xAxisRole).toBe("status");
    // The stale column id stays for fallback, but the role now wins.
    expect(repaired.config.xAxisColumnId).toBe("client_col");
  });

  it("leaves widgets it does not recognise untouched", () => {
    const widget = {
      id: "chart-1700000000000-1",
      type: "chart" as const,
      title: "My chart",
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      config: { chartType: "bar" },
      hasFilter: false,
    };
    expect(repairRoleBoundWidgets([widget])[0]).toBe(widget);
  });
});

describe("clampWidgetsToGrid", () => {
  it("pulls a widget that overflows the grid back inside it", () => {
    const [clamped] = clampWidgetsToGrid([
      { id: "a", type: "chart", title: "A", x: 10, y: 0, w: 6, h: 3, config: {}, hasFilter: false },
    ]);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(12);
    expect(clamped.x).toBe(6);
  });

  it("never shrinks a widget below its own minW", () => {
    const [clamped] = clampWidgetsToGrid([
      { id: "a", type: "chart", title: "A", x: 0, y: 0, w: 8, h: 3, minW: 8, config: {}, hasFilter: false },
    ]);
    expect(clamped.w).toBe(8);
  });
});
