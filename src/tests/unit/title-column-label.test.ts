import { describe, it, expect } from "vitest";
import {
  DEFAULT_TITLE_COLUMN_LABEL,
  nextGroupTitle,
  normalizeTitleColumnLabel,
  resolveImportTitleColumnLabel,
  resolveTitleColumnLabel,
  shouldPromptForTitleColumnRename,
  titleColumnLabelFromFileHeader,
} from "@/features/boards/engine/lib/title-column";

describe("title column label", () => {
  it("falls back to the default label instead of another column's name", () => {
    expect(resolveTitleColumnLabel()).toBe(DEFAULT_TITLE_COLUMN_LABEL);
    expect(resolveTitleColumnLabel(null, "", "   ")).toBe(DEFAULT_TITLE_COLUMN_LABEL);
  });

  it("uses the first non-empty candidate", () => {
    expect(resolveTitleColumnLabel(null, "Client / Company Name")).toBe(
      "Client / Company Name",
    );
  });

  it("normalizes blank labels to null", () => {
    expect(normalizeTitleColumnLabel("  ")).toBeNull();
    expect(normalizeTitleColumnLabel(" Client ")).toBe("Client");
    expect(normalizeTitleColumnLabel(undefined)).toBeNull();
  });

  it("derives the persisted label from the chosen file header", () => {
    expect(titleColumnLabelFromFileHeader("Client / Company Name")).toBe(
      "Client / Company Name",
    );
    // "None" must not fall back to an unrelated column's label.
    expect(titleColumnLabelFromFileHeader(null)).toBe(DEFAULT_TITLE_COLUMN_LABEL);
    expect(titleColumnLabelFromFileHeader("")).toBe(DEFAULT_TITLE_COLUMN_LABEL);
  });

  it("never borrows the label of a data column", () => {
    // The data columns of the board are NOT candidates for the title label —
    // only the title column's own label (board/group field or the chosen file
    // header) may be used.
    const dataColumnLabel = "Batch Details (PFM1_No)";
    const chosenTitleHeader = "Client / Company Name";

    expect(titleColumnLabelFromFileHeader(chosenTitleHeader)).toBe(
      chosenTitleHeader,
    );
    expect(resolveTitleColumnLabel(null, undefined, chosenTitleHeader)).toBe(
      chosenTitleHeader,
    );
    expect(resolveTitleColumnLabel(null, undefined, "")).toBe(
      DEFAULT_TITLE_COLUMN_LABEL,
    );
    expect(dataColumnLabel).not.toBe(
      resolveTitleColumnLabel(null, undefined, chosenTitleHeader),
    );
  });
});

describe("shouldPromptForTitleColumnRename", () => {
  it("does not prompt when the labels match", () => {
    expect(
      shouldPromptForTitleColumnRename("Client / Company Name", "Client / Company Name"),
    ).toBe(false);
  });

  it("prompts when the target already has a different label", () => {
    expect(
      shouldPromptForTitleColumnRename("Batch Details (PFM1_No)", "Client / Company Name"),
    ).toBe(true);
  });

  it("does not prompt when there is no chosen label or no existing label", () => {
    expect(shouldPromptForTitleColumnRename("Anything", null)).toBe(false);
    expect(shouldPromptForTitleColumnRename(null, "Client")).toBe(false);
  });
});

describe("resolveImportTitleColumnLabel", () => {
  it("keeps the existing label when the wizard chose None", () => {
    expect(
      resolveImportTitleColumnLabel({
        fileHeader: null,
        existingLabel: "Client / Company Name",
        renameAccepted: true,
      }),
    ).toBeNull();
  });

  it("applies the chosen label when the target has no conflicting label", () => {
    expect(
      resolveImportTitleColumnLabel({
        fileHeader: "Client / Company Name",
        existingLabel: "Client / Company Name",
        renameAccepted: true,
      }),
    ).toBe("Client / Company Name");
  });

  it("keeps the existing label when the rename prompt is declined", () => {
    expect(
      resolveImportTitleColumnLabel({
        fileHeader: "Client / Company Name",
        existingLabel: "Batch Details (PFM1_No)",
        renameAccepted: false,
      }),
    ).toBeNull();
  });

  it("applies the chosen label when the rename prompt is accepted", () => {
    expect(
      resolveImportTitleColumnLabel({
        fileHeader: "Client / Company Name",
        existingLabel: "Batch Details (PFM1_No)",
        renameAccepted: true,
      }),
    ).toBe("Client / Company Name");
  });

  it("always applies the label for a brand new group", () => {
    expect(
      resolveImportTitleColumnLabel({
        fileHeader: "Client / Company Name",
        existingLabel: null,
        renameAccepted: false,
      }),
    ).toBe("Client / Company Name");
  });
});

describe("nextGroupTitle", () => {
  it("returns the base title when it is free", () => {
    expect(nextGroupTitle([])).toBe("New Group");
    expect(nextGroupTitle(["Other"])).toBe("New Group");
  });

  it("auto-numbers around taken titles", () => {
    expect(nextGroupTitle(["New Group"])).toBe("New Group 2");
    expect(nextGroupTitle(["New Group", "New Group 2"])).toBe("New Group 3");
    expect(nextGroupTitle(["new group"])).toBe("New Group 2");
  });
});
