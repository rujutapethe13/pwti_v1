/**
 * Import wizard — target group and title column label.
 *
 * Regression coverage for the two import-wizard gaps:
 *   - the target group list only offered the first group, so a user could
 *     not choose (or create) the group the rows land in;
 *   - the chosen title file column never reached the board, so the pinned
 *     header kept showing an unrelated column's label.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ConfirmStep,
  MappingStep,
} from "@/features/boards/engine/components/import-wizard";
import type {
  ColumnDefinition,
  Group,
} from "@/features/boards/engine/types";
import type { ColumnMapping } from "@/features/boards/engine/lib/import-export";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const groups: Group[] = [
  {
    id: "group-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId: "board-1",
    name: "January 2026",
    collapsed: false,
    order: 0,
    status: "active",
    titleColumnLabel: "Batch Details (PFM1_No)",
  } as unknown as Group,
  {
    id: "group-2",
    organizationId: "org-1",
    workspaceId: "ws-1",
    boardId: "board-1",
    name: "February 2026",
    collapsed: false,
    order: 1,
    status: "active",
    titleColumnLabel: "Client / Company Name",
  } as unknown as Group,
];

const mappings: ColumnMapping[] = [
  {
    id: "m-1",
    fileColumn: "Client / Company Name",
    fileColumnIndex: 0,
    suggestedType: "text",
    action: { kind: "create", type: "text", label: "Client / Company Name" },
  },
] as unknown as ColumnMapping[];

function renderMappingStep(overrides: Partial<Parameters<typeof MappingStep>[0]> = {}) {
  const props = {
    mappings,
    allMappings: mappings,
    columns: [] as ColumnDefinition[],
    existingColumns: [] as ColumnDefinition[],
    newColumns: [] as ColumnDefinition[],
    rows: [],
    unmatchedOptions: {},
    optionMappings: {},
    titleColumnFileHeader: "Client / Company Name",
    onTitleColumnChange: vi.fn(),
    onSetSkip: vi.fn(),
    onSetExisting: vi.fn(),
    onSetCreate: vi.fn(),
    onSetOptionMapping: vi.fn(),
    targetGroupId: "group-1",
    groups,
    onTargetGroupChange: vi.fn(),
    newGroupName: "",
    onNewGroupNameChange: vi.fn(),
    effectiveTitleColumnLabel: "Client / Company Name",
    validation: { valid: true, errors: [], warnings: [] },
    onBack: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof MappingStep>[0];

  return render(<MappingStep {...props} />);
}

describe("import wizard — target group", () => {
  it("offers every group plus an option to create a new one", () => {
    renderMappingStep();

    const select = screen.getByLabelText("Target group") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);

    expect(values).toContain("group-1");
    expect(values).toContain("group-2");
    expect(values).toContain("__create_new_group__");
    expect(
      Array.from(select.options).some((o) => o.text.includes("Create new group")),
    ).toBe(true);
  });

  it("reports the chosen target group", () => {
    const onTargetGroupChange = vi.fn();
    renderMappingStep({ onTargetGroupChange });

    const select = screen.getByLabelText("Target group") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "group-2" } });

    expect(onTargetGroupChange).toHaveBeenCalledWith("group-2");
  });

  it("asks for a name when a new group is created", () => {
    renderMappingStep({ targetGroupId: "__create_new_group__" });

    expect(screen.getByPlaceholderText("New group name")).toBeTruthy();
  });
});

describe("import wizard — title column", () => {
  it("offers None alongside the file columns", () => {
    renderMappingStep();

    const select = screen.getByLabelText(/Title column \(optional\)/) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);

    expect(values).toContain("");
    expect(values).toContain("Client / Company Name");
    expect(
      Array.from(select.options).some((o) => o.text.trim() === "None"),
    ).toBe(true);
  });

  it("shows the label the header will carry", () => {
    renderMappingStep({ effectiveTitleColumnLabel: "Client / Company Name" });

    expect(screen.getByText(/Title column header will read:/)).toBeTruthy();
    expect(screen.getAllByText("Client / Company Name").length).toBeGreaterThan(0);
  });
});

describe("import wizard — confirmation", () => {
  it("summarises rows, target group and title column", () => {
    render(
      <ConfirmStep
        columnSets={{ keep: [], create: [], remove: [], protected: [] }}
        columnsToRemoveInfo={[]}
        keepUnmappedColumns={false}
        onKeepUnmappedChange={vi.fn()}
        rowCount={39}
        targetGroupName="January 2026"
        createsNewGroup={false}
        titleColumnLabel="Client / Company Name"
        needsTitleColumnRename={false}
        pendingTitleColumnLabel={null}
        renameTitleColumn
        onRenameTitleColumnChange={vi.fn()}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const summary = document.body.textContent ?? "";
    expect(summary).toContain("39 rows into");
    expect(summary).toContain("January 2026");
    expect(summary).toContain("title column: Client / Company Name");
  });

  it("prompts before replacing an existing title column label", () => {
    const onRenameTitleColumnChange = vi.fn();
    render(
      <ConfirmStep
        columnSets={{ keep: [], create: [], remove: [], protected: [] }}
        columnsToRemoveInfo={[]}
        keepUnmappedColumns={false}
        onKeepUnmappedChange={vi.fn()}
        rowCount={39}
        targetGroupName="January 2026"
        createsNewGroup={false}
        titleColumnLabel="Client / Company Name"
        needsTitleColumnRename
        pendingTitleColumnLabel="Client / Company Name"
        renameTitleColumn
        onRenameTitleColumnChange={onRenameTitleColumnChange}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Rename the title column to/i),
    ).toBeTruthy();

    const checkbox = screen.getByRole("checkbox", {
      name: /Rename the title column to/i,
    }) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onRenameTitleColumnChange).toHaveBeenCalledWith(false);
  });
});
