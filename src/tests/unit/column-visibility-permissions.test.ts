import { describe, it, expect } from "vitest";
import type { ColumnDefinition } from "@/features/boards/engine/types";
import type { ColumnVisibilityConfig } from "@/features/boards/engine/components/column-access-modal";

function isColumnVisibleToUser(
  column: ColumnDefinition,
  user: { id: string; email: string; role: "owner" | "edit" | "view" },
  previewAsUserId?: string | null,
  allMembers: Array<{ user_id: string; email: string; role: "owner" | "edit" | "view" }> = []
): boolean {
  const settings = (column.settings ?? {}) as Record<string, unknown>;
  const vis = settings.visibility as ColumnVisibilityConfig | undefined;

  if (!vis && !column.restrictView) return true;

  const mode = vis?.mode ?? (column.restrictView ? "staff_only" : "everyone");
  if (mode === "everyone") return true;

  // If in preview simulation mode:
  if (previewAsUserId) {
    const previewMember = allMembers.find((m) => m.user_id === previewAsUserId);
    const isPreviewStaff = previewMember ? (previewMember.role === "owner" || previewMember.role === "edit") : false;
    if (mode === "staff_only") {
      return isPreviewStaff;
    }
    if (mode === "selected") {
      const allowedIds = new Set(vis?.allowedUserIds ?? []);
      const allowedEmails = new Set((vis?.allowedEmails ?? []).map((e) => e.toLowerCase()));
      const isAllowed = allowedIds.has(previewAsUserId) || (previewMember?.email && allowedEmails.has(previewMember.email.toLowerCase()));
      return isAllowed || previewMember?.role === "owner";
    }
  }

  // Real user logic:
  // Owners & Board Admins see all columns when not simulating
  if (user.role === "owner") return true;

  // Staff (role: "edit") can see staff_only columns
  if (mode === "staff_only") {
    return user.role === "edit";
  }

  if (mode === "selected") {
    const currentUserId = user.id;
    const currentUserEmail = user.email.toLowerCase();
    const allowedIds = new Set(vis?.allowedUserIds ?? []);
    const allowedEmails = new Set((vis?.allowedEmails ?? []).map((e) => e.toLowerCase()));
    const isAllowed = (currentUserId && allowedIds.has(currentUserId)) ||
                      (currentUserEmail && allowedEmails.has(currentUserEmail));
    return Boolean(isAllowed);
  }

  return true;
}

describe("Column-Level Confidentiality & Per-Client Visibility Permissions", () => {
  const baseColumn: ColumnDefinition = {
    id: "col-cost",
    boardId: "test-board",
    key: "cost",
    label: "Production Cost",
    type: "number",
    required: false,
    hidden: false,
    frozen: false,
    defaultValue: null,
    settings: {},
    permissions: { view: [], edit: [], configure: [] },
    validation: [],
    version: 1,
    order: 1,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  const ownerUser = { id: "user-owner", email: "rujutapethe@gmail.com", role: "owner" as const };
  const staffUser = { id: "user-staff", email: "producer@studio.com", role: "edit" as const };
  const clientSafari = { id: "user-safari", email: "client@safari.com", role: "view" as const };
  const clientLevis = { id: "user-levis", email: "client@levis.com", role: "view" as const };

  const members = [ownerUser, staffUser, clientSafari, clientLevis].map((u) => ({
    user_id: u.id,
    email: u.email,
    role: u.role,
  }));

  it("mode 'everyone' allows both staff and clients to see the column", () => {
    const col: ColumnDefinition = {
      ...baseColumn,
      settings: { visibility: { mode: "everyone", allowedUserIds: [], allowedEmails: [] } },
    };
    expect(isColumnVisibleToUser(col, ownerUser, null, members)).toBe(true);
    expect(isColumnVisibleToUser(col, staffUser, null, members)).toBe(true);
    expect(isColumnVisibleToUser(col, clientSafari, null, members)).toBe(true);
    expect(isColumnVisibleToUser(col, clientLevis, null, members)).toBe(true);
  });

  it("mode 'staff_only' hides the column from clients but keeps it for staff/owner", () => {
    const col: ColumnDefinition = {
      ...baseColumn,
      settings: { visibility: { mode: "staff_only", allowedUserIds: [], allowedEmails: [] } },
    };
    expect(isColumnVisibleToUser(col, ownerUser, null, members)).toBe(true);
    expect(isColumnVisibleToUser(col, staffUser, null, members)).toBe(true);
    expect(isColumnVisibleToUser(col, clientSafari, null, members)).toBe(false);
    expect(isColumnVisibleToUser(col, clientLevis, null, members)).toBe(false);
  });

  it("mode 'selected' allows only the chosen client login and hides from other clients", () => {
    const col: ColumnDefinition = {
      ...baseColumn,
      settings: {
        visibility: {
          mode: "selected",
          allowedUserIds: ["user-safari"],
          allowedEmails: ["client@safari.com"],
        },
      },
    };
    // Safari client was granted permission:
    expect(isColumnVisibleToUser(col, clientSafari, null, members)).toBe(true);
    // Levis client was NOT granted permission -> hidden:
    expect(isColumnVisibleToUser(col, clientLevis, null, members)).toBe(false);
    // Unrestricted owner can see it:
    expect(isColumnVisibleToUser(col, ownerUser, null, members)).toBe(true);
  });

  it("preview simulation mode renders what the chosen client actually sees", () => {
    const col: ColumnDefinition = {
      ...baseColumn,
      settings: {
        visibility: {
          mode: "selected",
          allowedUserIds: ["user-safari"],
          allowedEmails: ["client@safari.com"],
        },
      },
    };
    // Admin simulates viewing as Safari client -> visible:
    expect(isColumnVisibleToUser(col, ownerUser, "user-safari", members)).toBe(true);
    // Admin simulates viewing as Levis client -> hidden:
    expect(isColumnVisibleToUser(col, ownerUser, "user-levis", members)).toBe(false);
  });
});
