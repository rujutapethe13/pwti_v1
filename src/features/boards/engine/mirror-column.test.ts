import { describe, expect, it } from "vitest";
import { createColumn } from "@/features/boards/engine/demo-data";
import { columnTypeRegistry } from "@/features/boards/engine/column-registry";
import type { MirrorColumnSettings } from "@/features/boards/engine/types";

describe("Mirror column creation (in-memory engine)", () => {
  it("registers the mirror type in the column registry", () => {
    expect(columnTypeRegistry["mirror"]).toBeDefined();
    expect(columnTypeRegistry["mirror"].label).toEqual("Mirror");
  });

  it("creates a mirror column and persists its settings (legacy single-column)", () => {
    const settings: MirrorColumnSettings = {
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: "col-target-1",
      mirrored_columns: [],
      display_config: { aggregation: "sum" },
    };
    const column = createColumn(
      "board-1",
      "col-mirror-1",
      "mirror_1",
      "Budget (mirrored)",
      "mirror",
      3,
      null,
      settings as unknown as Record<string, unknown>,
    );

    expect(column.type).toEqual("mirror");
    expect(column.id).toEqual("col-mirror-1");
    expect(column.label).toEqual("Budget (mirrored)");

    const restored = column.settings as unknown as MirrorColumnSettings;
    expect(restored.source_connect_column_id).toEqual("col-connect-1");
    expect(restored.mirrored_column_id).toEqual("col-target-1");
    expect(restored.display_config.aggregation).toEqual("sum");
  });

  it("creates a mirror column with multi-column mirrored_columns", () => {
    const settings: MirrorColumnSettings = {
      source_connect_column_id: "col-connect-2",
      mirrored_column_id: null,
      mirrored_columns: [
        { board_id: "board-2", column_id: "col-status", aggregation: "list" },
        { board_id: "board-2", column_id: "col-group", aggregation: null },
      ],
      display_config: { aggregation: null },
    };
    const column = createColumn(
      "board-1",
      "col-mirror-3",
      "mirror_3",
      "Client info (mirrored)",
      "mirror",
      4,
      null,
      settings as unknown as Record<string, unknown>,
    );

    const restored = column.settings as unknown as MirrorColumnSettings;
    expect(restored.source_connect_column_id).toEqual("col-connect-2");
    expect(restored.mirrored_columns).toHaveLength(2);
    expect(restored.mirrored_columns[0].column_id).toEqual("col-status");
    expect(restored.mirrored_columns[1].column_id).toEqual("col-group");
  });

  it("retrieves settings back from a stored column definition", () => {
    const settings: MirrorColumnSettings = {
      source_connect_column_id: "col-connect-2",
      mirrored_column_id: "col-target-2",
      mirrored_columns: [],
      display_config: { aggregation: null },
    };
    const column = createColumn(
      "board-1",
      "col-mirror-2",
      "mirror_2",
      "Status (mirrored)",
      "mirror",
      4,
      null,
      settings as unknown as Record<string, unknown>,
    );

    const readBack = column.settings as unknown as MirrorColumnSettings;
    expect(readBack.source_connect_column_id).toEqual("col-connect-2");
    expect(readBack.mirrored_column_id).toEqual("col-target-2");
    expect(readBack.display_config.aggregation).toBeNull();
  });
});
