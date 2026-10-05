import { describe, expect, it } from "vitest";
import {
  mirrorSettingsSchema,
  addColumnSchemaWithConnectBoard,
  type MirrorSettingsInput,
} from "@/features/boards/engine/schemas/column-schemas";
import { emptyMirrorColumnSettings, type MirrorColumnSettings } from "@/features/boards/engine/types";

describe("mirrorSettingsSchema (Zod)", () => {
  it("parses a fully configured mirror settings object (legacy single-column)", () => {
    const parsed = mirrorSettingsSchema.parse({
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: "col-target-1",
      mirrored_columns: [],
      display_config: { aggregation: "sum" },
    });
    expect(parsed.source_connect_column_id).toEqual("col-connect-1");
    expect(parsed.mirrored_column_id).toEqual("col-target-1");
    expect(parsed.display_config.aggregation).toEqual("sum");
  });

  it("parses a fully configured mirror settings object (multi-column)", () => {
    const parsed = mirrorSettingsSchema.parse({
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: null,
      mirrored_columns: [
        { board_id: "board-2", column_id: "col-status", aggregation: "list" },
      ],
      display_config: { aggregation: null },
    });
    expect(parsed.source_connect_column_id).toEqual("col-connect-1");
    expect(parsed.mirrored_columns).toHaveLength(1);
    expect(parsed.mirrored_columns[0].column_id).toEqual("col-status");
  });

  it("accepts null aggregation (single-item mirror)", () => {
    const parsed = mirrorSettingsSchema.parse({
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: "col-target-1",
      mirrored_columns: [],
      display_config: { aggregation: null },
    });
    expect(parsed.display_config.aggregation).toBeNull();
  });

  it("rejects a missing source_connect_column_id", () => {
    const result = mirrorSettingsSchema.safeParse({
      source_connect_column_id: "",
      mirrored_column_id: "col-target-1",
      mirrored_columns: [],
      display_config: { aggregation: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when both mirrored_column_id and mirrored_columns are empty", () => {
    const result = mirrorSettingsSchema.safeParse({
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: null,
      mirrored_columns: [],
      display_config: { aggregation: null },
    });
    expect(result.success).toBe(false);
  });
});

describe("addColumnSchemaWithConnectBoard (boundary validation)", () => {
  const base = {
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId: "board-1",
    key: "mirror_1",
    label: "Mirror",
    type: "mirror" as const,
    defaultValue: null,
  };

  it("accepts a mirror column with valid settings (legacy)", () => {
    const result = addColumnSchemaWithConnectBoard.safeParse({
      ...base,
      settings: {
        source_connect_column_id: "col-connect-1",
        mirrored_column_id: "col-target-1",
        mirrored_columns: [],
        display_config: { aggregation: "latest" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a mirror column with multi-column settings", () => {
    const result = addColumnSchemaWithConnectBoard.safeParse({
      ...base,
      settings: {
        source_connect_column_id: "col-connect-1",
        mirrored_column_id: null,
        mirrored_columns: [
          { board_id: "board-2", column_id: "col-status", aggregation: "list" },
        ],
        display_config: { aggregation: null },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a mirror column missing mirrored columns", () => {
    const result = addColumnSchemaWithConnectBoard.safeParse({
      ...base,
      settings: {
        source_connect_column_id: "col-connect-1",
        mirrored_column_id: "",
        mirrored_columns: [],
        display_config: { aggregation: null },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("emptyMirrorColumnSettings", () => {
  it("provides a nulled-out default shape", () => {
    const s = emptyMirrorColumnSettings();
    expect(s.source_connect_column_id).toBeNull();
    expect(s.mirrored_column_id).toBeNull();
    expect(s.mirrored_columns).toEqual([]);
    expect(s.display_config.aggregation).toBeNull();
  });
});

describe("Mirror settings persistence (JSON round-trip)", () => {
  it("preserves all fields through serialization", () => {
    const settings: MirrorColumnSettings = {
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: "col-target-1",
      mirrored_columns: [],
      display_config: { aggregation: "sum" },
    };
    const restored = JSON.parse(JSON.stringify(settings)) as MirrorSettingsInput;
    const parsed = mirrorSettingsSchema.parse(restored);
    expect(parsed).toEqual(settings);
  });

  it("round-trips a multi-column config", () => {
    const settings: MirrorColumnSettings = {
      source_connect_column_id: "col-connect-1",
      mirrored_column_id: null,
      mirrored_columns: [
        { board_id: "board-2", column_id: "col-status", aggregation: "list" },
        { board_id: "board-2", column_id: "col-group", aggregation: null },
      ],
      display_config: { aggregation: null },
    };
    const restored = JSON.parse(JSON.stringify(settings)) as MirrorSettingsInput;
    const parsed = mirrorSettingsSchema.parse(restored);
    expect(parsed.mirrored_columns).toHaveLength(2);
  });

  it("stores and retrieves the unconfigured (empty) default shape", () => {
    const settings = emptyMirrorColumnSettings();
    const restored = JSON.parse(
      JSON.stringify(settings),
    ) as MirrorColumnSettings;
    expect(restored.source_connect_column_id).toBeNull();
    expect(restored.mirrored_column_id).toBeNull();
    expect(restored.mirrored_columns).toEqual([]);
    expect(restored.display_config.aggregation).toBeNull();

    const strict = mirrorSettingsSchema.safeParse(restored);
    expect(strict.success).toBe(false);
  });
});
