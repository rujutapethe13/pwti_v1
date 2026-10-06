import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    getAll: () => [],
    setAll: () => {},
  }),
}));

type AnyRow = Record<string, unknown>;

interface Chainable {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => void;
}

function makeChain(rows: AnyRow[]): Chainable {
  let data = rows;

  const apply = (col: string, val: unknown) => {
    if (data.length === 0 || data[0].hasOwnProperty(col)) {
      data = data.filter((r) => r[col] === val);
    }
    return data;
  };

  const chain: AnyRow & Chainable = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      data = apply(col, val);
      return chain;
    }),
    neq: vi.fn(() => {
      data = [];
      return chain;
    }),
    gte: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: data[0] ?? null, error: null })),
    order: vi.fn(() => chain),
    upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolveFn: (value: unknown) => void) => {
      resolveFn({ data, error: null });
    },
  };

  return chain;
}

const {
  mockServiceClient,
} = vi.hoisted(() => {
  const profiles: AnyRow[] = [
    {
      id: "user-1",
      full_name: "Ada Lovelace",
      avatar_url: "https://example.com/avatar.png",
      created_at: "2024-01-01T00:00:00Z",
    },
  ];

  const members: AnyRow[] = [
    { id: "member-1", user_id: "user-1", email: "ada@example.com", workspace_id: "ws-1", board_id: null, role: "owner", status: "active", invited_by: null, created_at: "2024-01-01T00:00:00Z" },
  ];

  const organizations: AnyRow[] = [
    { id: "org-1", name: "Acme" },
  ];

  const userSettings: AnyRow[] = [
    {
      user_id: "user-1",
      job_title: "Engineer",
      timezone: "UTC",
      language: "en",
      profile_visibility: "everyone",
      show_online_status: true,
      show_last_active: true,
      mentions_email: true,
      mentions_in_app: true,
      assigned_email: true,
      assigned_in_app: true,
      board_activity_email: false,
      board_activity_in_app: true,
      invites_email: true,
      invites_in_app: true,
    },
  ];

  const sessions: AnyRow[] = [];

  const data: Record<string, AnyRow[]> = {
    profiles,
    members,
    organizations,
    user_settings: userSettings,
    user_sessions: sessions,
  };

  const chainByTable = new Map<string, Chainable>();

  const serviceFrom = vi.fn((table: string) => {
    let chain = chainByTable.get(table);
    if (!chain) {
      chain = makeChain(data[table] ?? []);
      chainByTable.set(table, chain);
    }
    return chain;
  });

  return { mockServiceClient: { from: serviceFrom } };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: {
            user: {
              id: "user-1",
              email: "ada@example.com",
              user_metadata: { full_name: "Ada Lovelace" },
              email_confirmed_at: "2024-01-01T00:00:00Z",
            },
          },
          error: null,
        }),
    },
  }),
  createServiceClient: () => mockServiceClient,
}));

vi.mock("@/lib/board-access", () => ({
  isOwner: () => Promise.resolve(false),
}));

vi.mock("@/lib/rbac", () => ({
  getAccessSnapshot: () => ({
    identity: {
      userId: "user-1",
      email: "ada@example.com",
      role: "admin",
      organizationId: "org-1",
      emailVerified: true,
    },
    workspaces: [{ id: "ws-1", name: "Acme", type: "team" }],
  }),
}));

describe("GET /api/me", () => {
  let GET: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/me/route");
    GET = mod.GET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the signed-in user, their settings and sessions", async () => {
    const request = new Request("http://localhost/api/me", { method: "GET" });
    const response = await GET(request);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const user = body.user as Record<string, unknown>;
    expect(user.email).toBe("ada@example.com");
    expect(user.fullName).toBe("Ada Lovelace");
    expect(user.initials).toBe("AL");
    expect(user.avatarUrl).toBe("https://example.com/avatar.png");
    expect(user.accessRole).toBe("owner");

    const settings = body.settings as Record<string, unknown>;
    expect(settings.jobTitle).toBe("Engineer");
    expect(settings.timezone).toBe("UTC");

    expect(body.settingsPersisted).toBe(true);
    expect((body.permissions as Record<string, boolean>).canManageMembers).toBe(true);
  });
});