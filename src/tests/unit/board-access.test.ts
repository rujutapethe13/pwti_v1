import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `canUserAccessBoard` is a security gate: a "true" here decides whether a
 * user reaches a board. The behaviour locked in below is that an *unknown*
 * restriction flag is treated as "cannot confirm", so access is denied —
 * rather than being collapsed into "not restricted", which granted access to a
 * restricted board any time the lookup failed.
 */

/** Table name -> canned `maybeSingle()` response. */
const responses: Record<string, { data?: unknown; error?: { message: string } | null }> = {};

const OWNER_EMAIL = "rujutapethe@gmail.com";
const REGULAR = "regular-user-id";

/**
 * A query-builder stand-in that records the filters applied and honours them
 * when `maybeSingle()` runs. Filter methods return the same node, so the tests
 * do not depend on the exact `.eq()/.in()` chain each query uses — but the
 * values still matter, because `canManageWorkspace` narrows the admin lookup
 * with `.in("role", ["owner", "admin"])` and a "member" row must not pass.
 */
function queryMock(table: string) {
  const filters: Record<string, unknown[]> = {};

  const node: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "range"]) {
    node[method] = () => node;
  }
  node.eq = (column: string, value: unknown) => {
    filters[column] = [value];
    return node;
  };
  node.in = (column: string, values: unknown[]) => {
    filters[column] = values;
    return node;
  };
  node.maybeSingle = () => {
    const r = responses[table] ?? {};
    let data = r.data ?? null;
    if (data && typeof data === "object") {
      for (const [column, allowed] of Object.entries(filters)) {
        // Only enforce filters on columns the canned row actually carries; a
        // row that does not model `id` is not claiming to be a different user.
        if (!(column in (data as Record<string, unknown>))) continue;
        const value = (data as Record<string, unknown>)[column];
        if (!allowed.includes(value)) {
          data = null;
          break;
        }
      }
    }
    return Promise.resolve({ data, error: r.error ?? null });
  };
  return node;
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: (table: string) => queryMock(table),
  }),
}));

beforeEach(() => {
  for (const key of Object.keys(responses)) delete responses[key];
  // Default: a plain signed-in user who is not the owner, holds no admin row
  // and has no explicit grant.
  responses["auth.users"] = { data: { email: "someone@example.com" } };
  responses.board_admins = { data: null };
  responses.board_access_overrides = { data: null };
});

describe("isBoardRestricted", () => {
  it("reports true when the board is restricted", async () => {
    responses.boards = { data: { is_restricted: true } };
    const { isBoardRestricted } = await import("@/lib/board-access");
    expect(await isBoardRestricted("b1")).toBe(true);
  });

  it("reports false when the board is explicitly open", async () => {
    responses.boards = { data: { is_restricted: false } };
    const { isBoardRestricted } = await import("@/lib/board-access");
    expect(await isBoardRestricted("b1")).toBe(false);
  });

  it("reports null — not false — when the lookup fails", async () => {
    responses.boards = { data: null, error: { message: "boom" } };
    const { isBoardRestricted } = await import("@/lib/board-access");
    expect(await isBoardRestricted("b1")).toBeNull();
  });

  it("reports null when the board row is missing", async () => {
    responses.boards = { data: null };
    const { isBoardRestricted } = await import("@/lib/board-access");
    expect(await isBoardRestricted("nope")).toBeNull();
  });
});

describe("canUserAccessBoard", () => {
  it("allows a non-owner onto an explicitly unrestricted board", async () => {
    responses.boards = { data: { is_restricted: false } };
    const { canUserAccessBoard } = await import("@/lib/board-access");
    expect(await canUserAccessBoard(REGULAR, "b1", "w1")).toBe(true);
  });

  it("denies when the restriction flag cannot be read", async () => {
    responses.boards = { data: null, error: { message: "connection reset" } };
    const { canUserAccessBoard } = await import("@/lib/board-access");
    // The regression: this used to resolve to true, because a failed lookup was
    // reported as "not restricted" and the open-by-default branch granted it.
    expect(await canUserAccessBoard(REGULAR, "b1", "w1")).toBe(false);
  });

  it("denies a non-owner on a restricted board with no grant", async () => {
    responses.boards = { data: { is_restricted: true } };
    responses.board_admins = { data: { role: "member" } };
    const { canUserAccessBoard } = await import("@/lib/board-access");
    expect(await canUserAccessBoard(REGULAR, "b1", "w1")).toBe(false);
  });

  it("allows a workspace admin onto a restricted board without a grant", async () => {
    responses.boards = { data: { is_restricted: true } };
    responses.board_admins = { data: { role: "admin" } };
    const { canUserAccessBoard } = await import("@/lib/board-access");
    expect(await canUserAccessBoard(REGULAR, "b1", "w1")).toBe(true);
  });

  it("allows a non-owner on a restricted board once a grant exists", async () => {
    responses.boards = { data: { is_restricted: true } };
    responses.board_admins = { data: { role: "member" } };
    responses.board_access_overrides = { data: { access: "granted" } };
    const { canUserAccessBoard } = await import("@/lib/board-access");
    expect(await canUserAccessBoard(REGULAR, "b1", "w1")).toBe(true);
  });

  it("always allows the owner, even when the flag cannot be read", async () => {
    responses["auth.users"] = { data: { email: OWNER_EMAIL } };
    responses.boards = { data: null, error: { message: "boom" } };
    const { canUserAccessBoard } = await import("@/lib/board-access");
    expect(await canUserAccessBoard("owner-user-id", "b1", "w1")).toBe(true);
  });
});

describe("OWNER_EMAIL", () => {
  it("is a syntactically valid address, so the owner can actually match it", async () => {
    const { OWNER_EMAIL } = await import("@/lib/board-access");
    expect(OWNER_EMAIL).toBe(OWNER_EMAIL.trim().toLowerCase());
    expect(OWNER_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});