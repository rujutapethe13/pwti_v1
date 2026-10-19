import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ColumnContextMenu } from "@/components/shared/column-context-menu";
import type { ColumnDefinition } from "@/features/boards/engine/types";

vi.mock("@/components/ui/dropdown-menu", async () => {
  const actual = await vi.importActual("@/components/ui/dropdown-menu");
  return {
    ...actual,
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-content">{children}</div>,
    DropdownMenuItem: ({ children, onSelect, disabled }: { children: React.ReactNode; onSelect?: () => void; disabled?: boolean }) => (
      <button disabled={disabled} onClick={onSelect} data-testid="dropdown-item">
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="sub-trigger">{children}</div>,
    DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("@/components/ui/dialog", async () => {
  const actual = await vi.importActual("@/components/ui/dialog");
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("@/components/ui/tooltip", async () => {
  const actual = await vi.importActual("@/components/ui/tooltip");
  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("@/config/env", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_RESET_ON_LOAD: "false",
  },
  serverEnv: {
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
    RESEND_API_KEY: "test-resend-key",
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/boards/engine/components/column-settings-panel", () => ({
  ColumnSettingsPanel: () => null,
}));

vi.mock("@/features/boards/engine/components/column-type-picker", () => ({
  ColumnTypePicker: () => null,
  ENABLED_TYPES: ["text", "number", "date", "status", "person"],
}));

vi.mock("@/features/boards/engine/components/connect-board-column-modal", () => ({
  ConnectBoardColumnModal: () => null,
}));

const mockColumn: ColumnDefinition = {
  id: "123e4567-e89b-12d6-0000-000000000001",
  boardId: "board-1",
  key: "custom",
  label: "Status",
  type: "text",
  required: false,
  hidden: false,
  frozen: false,
  defaultValue: null,
  settings: {},
  permissions: { view: ["owner", "editor", "commenter", "viewer"], edit: ["owner", "editor"], configure: ["owner"] },
  validation: [],
  version: 1,
  order: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const nameColumn: ColumnDefinition = {
  ...mockColumn,
  id: "123e4567-e89b-12d6-0000-000000000002",
  key: "name",
  label: "Name",
};

function findDeleteItem() {
  const items = screen.getAllByTestId("dropdown-item");
  return items.find((el) => el.textContent?.includes("Delete column"));
}

function findConfirmButton() {
  const buttons = screen.getAllByRole("button");
  return buttons.find((el) => el.textContent === "Delete");
}

describe("ColumnContextMenu — Delete column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onDelete when the user confirms the delete dialog", async () => {
    const onDelete = vi.fn();
    render(<ColumnContextMenu column={mockColumn} onDelete={onDelete} />);

    const deleteItem = findDeleteItem();
    expect(deleteItem).toBeDefined();
    fireEvent.click(deleteItem!);

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeInTheDocument();
    });

    const confirmBtn = findConfirmButton();
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(mockColumn.id);
    });
  });

  it("does not call onDelete when the user cancels the delete dialog", async () => {
    const onDelete = vi.fn();
    render(<ColumnContextMenu column={mockColumn} onDelete={onDelete} />);

    const deleteItem = findDeleteItem();
    fireEvent.click(deleteItem!);

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeInTheDocument();
    });

    const cancelBtn = screen.getAllByRole("button").find((el) => el.textContent === "Cancel");
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn!);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("disables the delete menu item when deleteLoading is true", async () => {
    const onDelete = vi.fn();
    render(<ColumnContextMenu column={mockColumn} onDelete={onDelete} deleteLoading={true} />);

    const deleteItem = findDeleteItem();
    expect(deleteItem).toBeDisabled();
  });

  it("disables the delete menu item for the protected Name column", async () => {
    const onDelete = vi.fn();
    render(<ColumnContextMenu column={nameColumn} onDelete={onDelete} />);

    const deleteItem = findDeleteItem();
    expect(deleteItem).toBeDisabled();
  });
});
