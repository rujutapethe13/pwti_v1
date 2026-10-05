import { describe, it, expect } from "vitest";
import {
  UNKNOWN_OPTION_LABEL,
  findOptionForValue,
  getColumnOptions,
  isOptionColumnType,
  looksLikeOptionId,
  normalizeOptions,
  resolveOptionDisplay,
  resolveOptionListDisplay,
  stableOptionId,
} from "@/features/boards/engine/lib/option-lookup";

/**
 * The option columns store the option ID in the cell and the label in
 * `column.settings.options`. These tests pin the contract that a raw "opt-…"
 * id is never surfaced as display text.
 */

const col = (options: unknown) => ({ settings: { options } }) as never;

describe("normalizeOptions", () => {
  it("normalizes object entries", () => {
    expect(normalizeOptions([{ id: "a", label: "Alpha", color: "#fff" }])).toEqual([
      { id: "a", label: "Alpha", color: "#fff" },
    ]);
  });

  it("normalizes legacy string arrays", () => {
    expect(normalizeOptions(["SAFARI", "KI"])).toEqual([
      { id: "SAFARI", label: "SAFARI" },
      { id: "KI", label: "KI" },
    ]);
  });

  it("falls back to the label when an object has no id", () => {
    expect(normalizeOptions([{ label: "Alpha" }])).toEqual([{ id: "Alpha", label: "Alpha" }]);
  });

  it("drops entries carrying neither id nor label", () => {
    expect(normalizeOptions([{ id: "" }, {}, null, 5])).toEqual([]);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeOptions(undefined)).toEqual([]);
    expect(normalizeOptions({ options: [] })).toEqual([]);
  });
});

describe("findOptionForValue", () => {
  const options = normalizeOptions([
    { id: "opt-a", label: "Product" },
    { id: "opt-b", label: "Apperals" },
  ]);

  it("matches by id", () => {
    expect(findOptionForValue(options, "opt-a")?.label).toBe("Product");
  });

  it("matches by exact label", () => {
    expect(findOptionForValue(options, "Apperals")?.id).toBe("opt-b");
  });

  it("matches by case-insensitive label", () => {
    expect(findOptionForValue(options, "apperals")?.id).toBe("opt-b");
  });

  it("prefers an id match over a label match", () => {
    const ambiguous = normalizeOptions([
      { id: "x", label: "Product" },
      { id: "Product", label: "Other" },
    ]);
    expect(findOptionForValue(ambiguous, "Product")?.id).toBe("Product");
    expect(findOptionForValue(ambiguous, "Other")?.id).toBe("Product");
  });

  it("returns undefined for an unknown id", () => {
    expect(findOptionForValue(options, "opt-zzz")).toBeUndefined();
  });
});

describe("resolveOptionDisplay", () => {
  const options = normalizeOptions([
    { id: "opt-1790843037295-0", label: "Apperals" },
    { id: "opt-1790843037295-22", label: "Product" },
  ]);

  it("displays the label for a stored option id", () => {
    const r = resolveOptionDisplay(options, "opt-1790843037295-0");
    expect(r.label).toBe("Apperals");
    expect(r.isUnknown).toBe(false);
    expect(r.option?.id).toBe("opt-1790843037295-0");
  });

  it("returns the Unknown option fallback for an orphaned id", () => {
    const r = resolveOptionDisplay(options, "opt-9999-77");
    expect(r.label).toBe(UNKNOWN_OPTION_LABEL);
    expect(r.isUnknown).toBe(true);
  });

  it("returns the Unknown option fallback when there are no options at all", () => {
    const r = resolveOptionDisplay([], "opt-1790843037295-0");
    expect(r.label).toBe(UNKNOWN_OPTION_LABEL);
    expect(r.isUnknown).toBe(true);
  });

  it("treats an option whose label is still its own id as unknown", () => {
    const r = resolveOptionDisplay(normalizeOptions([{ id: "opt-1", label: "opt-1" }]), "opt-1");
    expect(r.label).toBe(UNKNOWN_OPTION_LABEL);
    expect(r.isUnknown).toBe(true);
  });

  it("treats an option with a blank label as unknown", () => {
    const r = resolveOptionDisplay(normalizeOptions([{ id: "opt-1" }]), "opt-1");
    expect(r.label).toBe(UNKNOWN_OPTION_LABEL);
    expect(r.isUnknown).toBe(true);
  });

  it("passes through a plain label that is not an option id", () => {
    const r = resolveOptionDisplay(options, "Retouching");
    expect(r.label).toBe("Retouching");
    expect(r.isUnknown).toBe(false);
  });

  it("reports empty for null, undefined and empty string", () => {
    for (const v of [null, undefined, ""]) {
      const r = resolveOptionDisplay(options, v as never);
      expect(r.isEmpty).toBe(true);
      expect(r.label).toBe("");
    }
  });

  it("unwraps an object value via its label", () => {
    const r = resolveOptionDisplay(options, { label: "Apperals" } as never);
    expect(r.label).toBe("Apperals");
  });

  it("never returns a string matching an option-id shape", () => {
    const samples = [
      "opt-1",
      "opt-1790843037295-0",
      "opt_import_5",
      "OPT-abc",
      "opt-",
    ];
    for (const v of samples) {
      expect(looksLikeOptionId(v)).toBe(true);
      expect(looksLikeOptionId(resolveOptionDisplay(options, v).label)).toBe(false);
    }
  });
});

describe("resolveOptionListDisplay", () => {
  const options = normalizeOptions([
    { id: "opt-a", label: "Product" },
    { id: "opt-b", label: "Apperals" },
  ]);

  it("maps each id in a multi-select array to its label", () => {
    expect(resolveOptionListDisplay(options, ["opt-a", "opt-b"])).toBe("Product, Apperals");
  });

  it("drops unresolvable ids", () => {
    expect(resolveOptionListDisplay(options, ["opt-a", "opt-zzz"])).toBe("Product");
  });

  it("handles a non-array value", () => {
    expect(resolveOptionListDisplay(options, "opt-b")).toBe("Apperals");
  });
});

describe("stableOptionId", () => {
  it("is deterministic for the same label", () => {
    expect(stableOptionId("Product")).toBe(stableOptionId("Product"));
  });

  it("slugifies the label", () => {
    expect(stableOptionId("Laptop Bag Selling Bag")).toBe("opt-import-laptop-bag-selling-bag");
  });

  it("avoids colliding with an id already in use", () => {
    const taken = new Set([stableOptionId("Product")]);
    expect(stableOptionId("Product", taken)).toBe("opt-import-product-2");
  });

  it("handles labels with no alphanumeric characters", () => {
    expect(stableOptionId("***")).toBe("opt-import-option");
  });
});

describe("isOptionColumnType / getColumnOptions", () => {
  it("recognises the option column types", () => {
    expect(isOptionColumnType("dropdown")).toBe(true);
    expect(isOptionColumnType("status")).toBe(true);
    expect(isOptionColumnType("priority")).toBe(true);
    expect(isOptionColumnType("multi_select")).toBe(true);
    expect(isOptionColumnType("text")).toBe(false);
  });

  it("reads options straight off the column settings", () => {
    expect(getColumnOptions(col([{ id: "a", label: "Alpha" }]))).toEqual([
      { id: "a", label: "Alpha" },
    ]);
  });
});
