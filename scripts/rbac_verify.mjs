/**
 * RBAC verification harness.
 *
 * Proves the access-control claims against the live database, using the anon
 * key and real signed-in sessions — not the service-role key. Everything here
 * goes through the same path an attacker or a client would, because a rule that
 * only holds under service_role is not a rule.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node scripts/rbac_verify.mjs
 *   node scripts/rbac_verify.mjs --url=... --anon=... --service=...
 *
 * Reads from the environment when flags are absent (see .env.local.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY        (setup and teardown only)
 *
 * ── What it creates and destroys ───────────────────────────────────────────
 * It builds a throwaway organization with four workspaces (standard, client,
 * personal-A, personal-B) and seven users, runs every assertion, then deletes
 * everything it made. The organization id is prefixed `rbac-verify-` and the
 * script refuses to run if a previous run left one behind, rather than silently
 * accumulating them.
 *
 * ── Reading the output ─────────────────────────────────────────────────────
 *   PASS  name
 *   FAIL  name
 *          expected: ...
 *          actual:   ...
 * Exit code is 1 if anything failed, so it can gate a deploy.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const RUN_PREFIX = "rbac-verify-";
const SUPER_ADMIN_EMAIL = "rujutapethe@gmail.com";

// ── config ───────────────────────────────────────────────────────────────────

function loadDotEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const rawLine of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function flag(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

loadDotEnv();

const URL_BASE = flag("url") ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = flag("anon") ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = flag("service") ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

// The super admin account already exists and must not be recreated — attempting
// to would abort the whole run. Its password is therefore optional: supply it to
// exercise the super-admin assertions, and without it those assertions are
// reported as SKIPPED rather than quietly passing.
const SUPER_ADMIN_PASSWORD =
  flag("super-password") ?? process.env.RBAC_SUPER_ADMIN_PASSWORD ?? null;
const SUPER_ADMIN_ID = flag("super-id") ?? process.env.RBAC_SUPER_ADMIN_ID ?? null;

if (!URL_BASE || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    "Missing configuration. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and\n" +
      "SUPABASE_SERVICE_ROLE_KEY (or pass --url= --anon= --service=).",
  );
  process.exit(2);
}

// ── tiny Supabase REST/RPC client ────────────────────────────────────────────
// Written against fetch directly so the script has no dependency to install and
// so there is no client library quietly attaching a session you did not intend.

async function call(pathname, { method = "GET", body, token, extraHeaders = {} } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? SERVICE_KEY}`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}

const service = {
  from: (table) => call(`${table}?select=*`, { extraHeaders: { Prefer: "count=exact" } }),
  rpc: (fn, args) => call(`rpc/${fn}`, { method: "POST", body: args ?? {} }),
};

/** An anon-key client carrying one test user's access token. */
function asUser(accessToken) {
  return {
    rpc: (fn, args) => call(`rpc/${fn}`, { method: "POST", body: args ?? {}, token: accessToken }),
    from: (table) => call(`${table}?select=*`, { extraHeaders: { Prefer: "count=exact" }, token: accessToken }),
  };
}

// ── assertions ──────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
    return true;
  }
  failures.push({ name, detail });
  console.log(`  FAIL  ${name}`);
  if (detail) console.log(`        ${detail}`);
  return false;
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return check(
    name,
    ok,
    ok ? null : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function section(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(Math.max(title.length, 3)));
}

let skipped = 0;

/**
 * Report an assertion as not run, with the reason.
 *
 * Skips are counted and printed in the summary. The point is that a skipped
 * assertion must never look like a passing one — "12 passed, 5 skipped" and
 * "17 passed" are very different reports about the same system.
 */
function skip(name, reason) {
  skipped += 1;
  console.log(`  SKIP  ${name}`);
  console.log(`        ${reason}`);
  return null;
}

// ── fixture ──────────────────────────────────────────────────────────────────

const stamp = Date.now().toString(36);
const ORG = `${RUN_PREFIX}${stamp}`;
const WS_STANDARD = `${ORG}-std`;
const WS_CLIENT_LEVIS = `${ORG}-levis`;
const WS_CLIENT_NIKE = `${ORG}-nike`;
const WS_PERSONAL_A = `${ORG}-pers-a`;
const WS_PERSONAL_B = `${ORG}-pers-b`;

const BOARD_SHARED = `${ORG}-b-shared`;
const BOARD_LEVIS_1 = `${ORG}-b-levis-1`;
const BOARD_LEVIS_2 = `${ORG}-b-levis-2`;
const BOARD_INTERNAL = `${ORG}-b-internal`;
const BOARD_PERSONAL_A = `${ORG}-b-pers-a`;
const BOARD_PERSONAL_B = `${ORG}-b-pers-b`;

const COL_PUBLIC = `${ORG}-c-public`;
const COL_PRIVATE = `${ORG}-c-private`;
const COL_SECRET = `${ORG}-c-secret`;
const COL_PERSONAL = `${ORG}-c-personal`;
const COL_PERSONAL_B = `${ORG}-c-personal-b`;

const SECRET_VALUE = "salary-90000-do-not-leak";
const PERSONAL_SECRET = "personal-diary-77777-do-not-leak";

const USERS = {
  admin: { email: `${RUN_PREFIX}admin-${stamp}@example.com`, password: `Verify-${stamp}-admin` },
  staffAssigned: { email: `${RUN_PREFIX}staff-a-${stamp}@example.com`, password: `Verify-${stamp}-staffa` },
  staffUnassigned: { email: `${RUN_PREFIX}staff-b-${stamp}@example.com`, password: `Verify-${stamp}-staffb` },
  levisAlice: { email: `${RUN_PREFIX}alice-${stamp}@example.com`, password: `Verify-${stamp}-alice` },
  levisBob: { email: `${RUN_PREFIX}bob-${stamp}@example.com`, password: `Verify-${stamp}-bob` },
  nikeCarol: { email: `${RUN_PREFIX}carol-${stamp}@example.com`, password: `Verify-${stamp}-carol` },
};

/** Sign in as the existing super admin. Null when no password was supplied. */
async function signInSuperAdmin() {
  if (!SUPER_ADMIN_PASSWORD) return null;

  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD }),
  });

  const body = await res.json().catch(() => null);
  if (!body?.access_token) {
    console.warn(
      `\n  ! Could not sign in as ${SUPER_ADMIN_EMAIL}. Super-admin assertions will be skipped.\n` +
        "    (If the account uses Google sign-in, a password will not work; create a temporary\n" +
        "     password for it or accept the skip.)\n",
    );
    return null;
  }

  sessions.superadmin = body.access_token;
  return body.access_token;
}

const sessions = {};

async function createUser(key, spec, { confirm = true } = {}) {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: spec.email,
      password: spec.password,
      email_confirm: confirm,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`could not create ${spec.email}: ${JSON.stringify(body)}`);
  }

  const signIn = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: spec.email, password: spec.password }),
  });

  const session = await signIn.json().catch(() => null);
  if (!session?.access_token) {
    throw new Error(`could not sign in ${spec.email}: ${JSON.stringify(session)}`);
  }

  sessions[key] = session.access_token;
  return body.id;
}

async function createUnconfirmedUser(spec) {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: spec.email,
      password: spec.password,
      email_confirm: false,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`could not create unconfirmed ${spec.email}: ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function deleteAuthUser(id) {
  await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

/** Resolve the existing super admin's auth id without needing their password. */
async function lookupSuperAdminId() {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const body = await res.json().catch(() => null);
  const hit = (body?.users ?? []).find(
    (u) => String(u.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL,
  );
  return hit?.id ?? null;
}

async function seed() {
  const { data: leftovers } = await call(
    `organizations?select=id&id=like.${RUN_PREFIX}*`,
  );
  if (Array.isArray(leftovers) && leftovers.length > 0) {
    console.error(
      `Refusing to run: found ${leftovers.length} organization(s) from a previous run ` +
        `(${leftovers.map((o) => o.id).join(", ")}).\n` +
        "Delete them before re-running, or the results will be confusing.",
    );
    process.exit(2);
  }

  console.log(`Seeding ${ORG} …`);

  await call("organizations", {
    method: "POST",
    body: { id: ORG, name: "RBAC Verify", status: "active", plan: "business" },
  });

  await call("workspaces", {
    method: "POST",
    body: [
      { id: WS_STANDARD, organization_id: ORG, name: "Standard", slug: "std", type: "standard" },
      { id: WS_CLIENT_LEVIS, organization_id: ORG, name: "Levis", slug: "levis", type: "client" },
      { id: WS_CLIENT_NIKE, organization_id: ORG, name: "Nike", slug: "nike", type: "client" },
      { id: WS_PERSONAL_A, organization_id: ORG, name: "Personal A", slug: "pa", type: "personal" },
      { id: WS_PERSONAL_B, organization_id: ORG, name: "Personal B", slug: "pb", type: "personal" },
    ],
  });

  await call("boards", {
    method: "POST",
    body: [
      { id: BOARD_SHARED, organization_id: ORG, workspace_id: WS_STANDARD, slug: "shared", name: "Shared Board" },
      { id: BOARD_INTERNAL, organization_id: ORG, workspace_id: WS_STANDARD, slug: "internal", name: "Internal Board" },
      { id: BOARD_LEVIS_1, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, slug: "levis-1", name: "Levis Board 1" },
      { id: BOARD_LEVIS_2, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, slug: "levis-2", name: "Levis Board 2" },
      { id: BOARD_PERSONAL_A, organization_id: ORG, workspace_id: WS_PERSONAL_A, slug: "pa-1", name: "Personal A Board" },
      { id: BOARD_PERSONAL_B, organization_id: ORG, workspace_id: WS_PERSONAL_B, slug: "pb-1", name: "Personal B Board" },
    ],
  });

  await call("columns", {
    method: "POST",
    body: [
      { id: COL_PUBLIC, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, key: "pub", label: "Job Title", type: "text" },
      { id: COL_PRIVATE, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, key: "priv", label: "Cost", type: "number" },
      { id: COL_SECRET, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, key: "sec", label: "Internal Notes", type: "text" },
      { id: COL_PERSONAL, organization_id: ORG, workspace_id: WS_PERSONAL_A, board_id: BOARD_PERSONAL_A, key: "p", label: "Personal", type: "text" },
      { id: COL_PERSONAL_B, organization_id: ORG, workspace_id: WS_PERSONAL_B, board_id: BOARD_PERSONAL_B, key: "p", label: "Private", type: "text" },
    ],
  });

  const recordId = `${ORG}-r-1`;
  await call("records", {
    method: "POST",
    body: {
      id: recordId,
      organization_id: ORG,
      workspace_id: WS_CLIENT_LEVIS,
      board_id: BOARD_LEVIS_1,
      title: "Levis Summer Campaign",
    },
  });

  await call("cell_values", {
    method: "POST",
    body: [
      { id: `${ORG}-cv-1`, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, record_id: recordId, column_id: COL_PUBLIC, value: "Summer", value_text: "Summer" },
      { id: `${ORG}-cv-2`, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, record_id: recordId, column_id: COL_PRIVATE, value: 4200, value_text: "4200" },
      { id: `${ORG}-cv-3`, organization_id: ORG, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, record_id: recordId, column_id: COL_SECRET, value: SECRET_VALUE, value_text: SECRET_VALUE },
    ],
  });

  // A record inside the personal workspace of staffAssigned. It exists to prove
  // that personal-workspace content stays out of search and analytics for
  // everyone else — including the super admin, who can *open* the workspace but
  // whose org-wide surfaces must still skip it. Its board and column were
  // created above, in FK-safe order.
  const personalRecordId = `${ORG}-r-personal`;
  await call("records", {
    method: "POST",
    body: {
      id: personalRecordId,
      organization_id: ORG,
      workspace_id: WS_PERSONAL_B,
      board_id: BOARD_PERSONAL_B,
      title: "Private planning notes",
    },
  });

  await call("cell_values", {
    method: "POST",
    body: {
      id: `${ORG}-cv-personal`,
      organization_id: ORG,
      workspace_id: WS_PERSONAL_B,
      board_id: BOARD_PERSONAL_B,
      record_id: personalRecordId,
      column_id: COL_PERSONAL_B,
      value: PERSONAL_SECRET,
      value_text: PERSONAL_SECRET,
    },
  });

  return recordId;
}

async function link(usersByKey) {
  await call("organization_members", {
    method: "POST",
    body: Object.entries(usersByKey).map(([key, id]) => ({
      organization_id: ORG,
      user_id: id,
      role: key === "admin" ? "admin" : "staff",
    })),
  });

  // Staff: assigned to the standard workspace with edit, and to Levis view-only.
  await call("workspace_members", {
    method: "POST",
    body: [
      { user_id: usersByKey.admin, workspace_id: WS_STANDARD, role: "admin", can_view: true, can_edit: true },
      { user_id: usersByKey.admin, workspace_id: WS_CLIENT_LEVIS, role: "admin", can_view: true, can_edit: true },
      { user_id: usersByKey.admin, workspace_id: WS_CLIENT_NIKE, role: "admin", can_view: true, can_edit: true },
      { user_id: usersByKey.staffAssigned, workspace_id: WS_STANDARD, role: "staff", can_view: true, can_edit: true },
      { user_id: usersByKey.staffAssigned, workspace_id: WS_CLIENT_LEVIS, role: "staff", can_view: true, can_edit: false },
      { user_id: usersByKey.levisAlice, workspace_id: WS_CLIENT_LEVIS, role: "client", can_view: true, can_edit: false },
      { user_id: usersByKey.levisBob, workspace_id: WS_CLIENT_LEVIS, role: "client", can_view: true, can_edit: false },
      { user_id: usersByKey.nikeCarol, workspace_id: WS_CLIENT_NIKE, role: "client", can_view: true, can_edit: false },
    ],
  });

  // Alice gets board 1 and two columns; Bob gets board 1 and one column.
  // Same workspace, different views — that is the point of the test.
  await call("client_board_access", {
    method: "POST",
    body: [
      { user_id: usersByKey.levisAlice, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, can_view: true, can_create: false, can_delete: false },
      { user_id: usersByKey.levisBob, workspace_id: WS_CLIENT_LEVIS, board_id: BOARD_LEVIS_1, can_view: true, can_create: false, can_delete: false },
    ],
  });

  await call("client_column_permissions", {
    method: "POST",
    body: [
      { user_id: usersByKey.levisAlice, board_id: BOARD_LEVIS_1, column_id: COL_PUBLIC, can_view: true, can_edit: false },
      { user_id: usersByKey.levisAlice, board_id: BOARD_LEVIS_1, column_id: COL_PRIVATE, can_view: true, can_edit: true },
      { user_id: usersByKey.levisBob, board_id: BOARD_LEVIS_1, column_id: COL_PUBLIC, can_view: true, can_edit: false },
    ],
  });
}

async function teardown(userIds) {
  console.log(`\nTearing down ${ORG} …`);
  const problems = [];

  // Child-first, and report anything that did not come back 2xx. A silent
  // teardown failure is how test organizations accumulate in a real database.
  const steps = [
    `cell_values?organization_id=eq.${ORG}`,
    `records?organization_id=eq.${ORG}`,
    `columns?organization_id=eq.${ORG}`,
    `boards?organization_id=eq.${ORG}`,
    `workspaces?organization_id=eq.${ORG}`,
    `organization_members?organization_id=eq.${ORG}`,
    `organizations?id=eq.${ORG}`,
  ];

  for (const step of steps) {
    const res = await call(step, { method: "DELETE" });
    if (!res.ok) problems.push(`${step} -> ${res.status} ${JSON.stringify(res.data)}`);
  }

  for (const id of Object.values(userIds ?? {})) {
    if (!id) continue;
    const res = await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) problems.push(`auth user ${id} -> ${res.status}`);
  }

  const verifyRes = await call(`organizations?select=id&id=eq.${ORG}`);
  const stillThere = Array.isArray(verifyRes.data) ? verifyRes.data.length : -1;
  if (stillThere !== 0) problems.push(`${ORG} still exists after teardown`);

  if (problems.length > 0) {
    console.error("\nTeardown problems — clean these up by hand:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`  removed ${ORG} and ${Object.keys(userIds ?? {}).length} test users`);
  }
}

// ── the checks ───────────────────────────────────────────────────────────────

async function verify(recordId, ids) {
  const hasSuper = Boolean(sessions.superadmin);
  const superadmin = hasSuper ? asUser(sessions.superadmin) : null;

  /** Run a super-admin assertion, or record that it was skipped. */
  const sup = (name, fn) =>
    hasSuper ? fn() : skip(name, "no super-admin password supplied (--super-password / RBAC_SUPER_ADMIN_PASSWORD)");

  const admin = asUser(sessions.admin);
  const staffA = asUser(sessions.staffAssigned);
  const staffB = asUser(sessions.staffUnassigned);
  const alice = asUser(sessions.levisAlice);
  const bob = asUser(sessions.levisBob);
  const carol = asUser(sessions.nikeCarol);

  // ── 1. Roles ──────────────────────────────────────────────────────────────
  section("1. Role resolution");
  eq("admin resolves as admin", (await admin.rpc("current_role")).data, "admin");
  eq("assigned staff resolves as staff", (await staffA.rpc("current_role")).data, "staff");
  eq("client resolves as client", (await alice.rpc("current_role")).data, "client");

  await sup("super admin resolves as admin", async () =>
    eq("super admin resolves as admin", (await superadmin.rpc("current_role")).data, "admin"),
  );
  await sup("super admin is recognised", async () =>
    eq("super admin is recognised", (await superadmin.rpc("is_super_admin")).data, true),
  );

  // Email confirmation is required before a session exists at all, which is
  // what makes the "verified" half of is_super_admin() meaningful: an
  // unconfirmed account cannot reach any helper, so it cannot be mistaken for
  // the super admin on the strength of its address alone.
  const unverifiedId = await createUnconfirmedUser({
    email: `${RUN_PREFIX}unverified-${stamp}@example.com`,
    password: `Verify-${stamp}-unv`,
  });

  const unverifiedSignIn = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      email: `${RUN_PREFIX}unverified-${stamp}@example.com`,
      password: `Verify-${stamp}-unv`,
    }),
  });
  check(
    "an unconfirmed account cannot obtain a session",
    !unverifiedSignIn.ok,
    `expected a rejection, got ${unverifiedSignIn.status}`,
  );

  const confirmedButOther = (await asUser(sessions.admin).rpc("is_super_admin")).data;
  check(
    "a confirmed non-super-admin is not a super admin",
    confirmedButOther !== true,
    "is_super_admin() must match on the exact address, not merely on being verified",
  );

  await deleteAuthUser(unverifiedId);

  // ── 2. Client board visibility ────────────────────────────────────────────
  section("2. Client board visibility (default deny)");

  const aliceBoards = (await alice.rpc("get_my_boards")).data ?? [];
  eq(
    "alice sees exactly the one board granted to her",
    aliceBoards.map((b) => b.id),
    [BOARD_LEVIS_1],
  );

  const ungranted = (await alice.rpc("get_board_items", { p_board_id: BOARD_LEVIS_2 })).data;
  check(
    "an ungranted board returns no items at all",
    Array.isArray(ungranted) && ungranted.length === 0,
    `get_board_items on an ungranted board returned ${JSON.stringify(ungranted)}`,
  );

  const madeUp = (await alice.rpc("get_board_items", { p_board_id: `${ORG}-does-not-exist` })).data;
  check(
    "a nonexistent board looks identical to an ungranted one",
    Array.isArray(madeUp) && madeUp.length === 0,
    "ungranted and nonexistent must be indistinguishable",
  );

  const directBoards = await alice.from("boards");
  check(
    "no direct SELECT on boards for a client",
    directBoards.status === 403 || directBoards.data?.length === 0,
    `expected 403 or 0 rows, got ${directBoards.status} / ${JSON.stringify(directBoards.data)}`,
  );

  const directRecords = await alice.from("records");
  check(
    "no direct SELECT on records for a client",
    directRecords.status === 403 || directRecords.data?.length === 0,
    `expected 403 or 0 rows, got ${directRecords.status}`,
  );

  const directColumns = await alice.from("columns");
  check(
    "no direct SELECT on columns for a client",
    directColumns.status === 403 || directColumns.data?.length === 0,
    `expected 403 or 0 rows, got ${directColumns.status}`,
  );

  // ── 3. Cross-workspace isolation ──────────────────────────────────────────
  section("3. Cross-workspace and cross-client isolation");

  const aliceWorkspaces = (await alice.rpc("get_my_workspaces")).data ?? [];
  eq(
    "alice sees only the Levis workspace",
    aliceWorkspaces.map((w) => w.id),
    [WS_CLIENT_LEVIS],
  );

  const carolBoards = (await carol.rpc("get_my_boards")).data ?? [];
  eq(
    "carol sees only Nike, never Levis",
    carolBoards.map((b) => b.id),
    [],
    "carol is a client of Nike and holds no board grants",
  );

  const carolWorkspaces = (await carol.rpc("get_my_workspaces")).data ?? [];
  check(
    "carol cannot see the Levis workspace",
    !carolWorkspaces.some((w) => w.id === WS_CLIENT_LEVIS),
    `carol saw ${JSON.stringify(carolWorkspaces.map((w) => w.id))}`,
  );

  const aliceItems = (await alice.rpc("get_board_items", { p_board_id: BOARD_LEVIS_1 })).data ?? [];
  eq("alice can read items on her granted board", aliceItems.length, 1);
  check(
    "alice cannot read a standard-workspace board",
    ((await alice.rpc("get_board_items", { p_board_id: BOARD_SHARED })).data ?? []).length === 0,
    "a client must not reach a non-client workspace board",
  );

  // ── 4. Column permissions ─────────────────────────────────────────────────
  section("4. Column permissions");

  const aliceCols = (await alice.rpc("get_board_columns", { p_board_id: BOARD_LEVIS_1 })).data ?? [];
  eq(
    "alice sees only her two granted columns",
    aliceCols.map((c) => c.id).sort(),
    [COL_PRIVATE, COL_PUBLIC].sort(),
  );
  check(
    "the ungranted column is absent, not blank",
    !aliceCols.some((c) => c.id === COL_SECRET),
    "a hidden column must not appear in the payload at all",
  );

  const bobCols = (await bob.rpc("get_board_columns", { p_board_id: BOARD_LEVIS_1 })).data ?? [];
  eq(
    "bob sees only his one granted column, in the same workspace",
    bobCols.map((c) => c.id),
    [COL_PUBLIC],
  );
  check(
    "two users in one client workspace get different views",
    aliceCols.length !== bobCols.length,
    `alice saw ${aliceCols.length} columns, bob saw ${bobCols.length}`,
  );

  const aliceCells = (await alice.rpc("get_board_cell_values", { p_board_id: BOARD_LEVIS_1 })).data ?? [];
  const leaked = aliceCells.find((c) => JSON.stringify(c).includes(SECRET_VALUE));
  check(
    "no hidden value leaks through cell_values",
    !leaked,
    leaked ? `secret value appeared in ${JSON.stringify(leaked)}` : null,
  );
  check(
    "hidden column has no cell rows at all",
    !aliceCells.some((c) => c.column_id === COL_SECRET),
    `cell rows returned: ${JSON.stringify(aliceCells.map((c) => c.column_id))}`,
  );

  const editFlag = aliceCols.find((c) => c.id === COL_PRIVATE);
  eq("alice may edit the column she was granted edit on", editFlag?.can_edit, true);
  const readonlyFlag = aliceCols.find((c) => c.id === COL_PUBLIC);
  eq("alice sees her other column as read-only", readonlyFlag?.can_edit, false);

  // ── 5. Search and analytics scoping ───────────────────────────────────────
  section("5. Search, analytics and activity scoping");

  const secretHits = (await alice.rpc("get_search_results", { p_query: SECRET_VALUE })).data ?? [];
  check(
    "searching for a hidden value returns nothing",
    secretHits.length === 0,
    `search leaked ${JSON.stringify(secretHits)}`,
  );

  const visibleHits = (await alice.rpc("get_search_results", { p_query: "Summer" })).data ?? [];
  check(
    "searching for a visible value finds it",
    visibleHits.length > 0,
    "expected at least one hit for a granted column value",
  );

  const analyticsIds = (await alice.rpc("accessible_workspace_ids", { p_include_personal: false })).data;
  check(
    "a client gets no analytics workspace scope",
    !Array.isArray(analyticsIds) || analyticsIds.length === 0,
    `expected an empty scope for a client, got ${JSON.stringify(analyticsIds)}`,
  );

  const staffAnalytics = (await staffA.rpc("accessible_workspace_ids", { p_include_personal: false })).data;
  check(
    "staff analytics exclude personal workspaces",
    Array.isArray(staffAnalytics) && !staffAnalytics.includes(WS_PERSONAL_A),
    `staff scope was ${JSON.stringify(staffAnalytics)}`,
  );
  check(
    "staff analytics are limited to assigned workspaces",
    Array.isArray(staffAnalytics) &&
      staffAnalytics.includes(WS_STANDARD) &&
      staffAnalytics.includes(WS_CLIENT_LEVIS) &&
      !staffAnalytics.includes(WS_CLIENT_NIKE),
    `staff scope was ${JSON.stringify(staffAnalytics)}`,
  );

  const snapshotRows = await alice.from("client_360_daily_snapshot");
  check(
    "no analytics snapshot rows for a client",
    snapshotRows.status === 403 || snapshotRows.data?.length === 0,
    `expected 403 or 0 rows, got ${snapshotRows.status}`,
  );

  const activityRows = await staffB.from("activity_logs");
  check(
    "unassigned staff read no activity",
    activityRows.status === 403 || activityRows.data?.length === 0,
    `expected 403 or 0 rows, got ${activityRows.status}`,
  );

  // ── 6. Staff scoping ──────────────────────────────────────────────────────
  section("6. Staff scoping");

  eq(
    "assigned staff sees the workspace they were given",
    (await staffA.rpc("can_view_workspace", { p_workspace_id: WS_STANDARD })).data,
    true,
  );
  eq(
    "assigned staff cannot see a workspace they were not given",
    (await staffA.rpc("can_view_workspace", { p_workspace_id: WS_CLIENT_NIKE })).data,
    false,
  );
  eq(
    "unassigned staff sees nothing",
    (await staffB.rpc("can_view_workspace", { p_workspace_id: WS_STANDARD })).data,
    false,
  );

  const staffWrite = await staffB.rpc("can_edit_workspace", { p_workspace_id: WS_STANDARD });
  eq("unassigned staff cannot edit", staffWrite.data, false);

  // ── 7. Personal workspaces ────────────────────────────────────────────────
  section("7. Personal workspaces");

  // Personal workspaces are claimed by their owners. owner_id is per-workspace,
  // so each update is filtered — never a blanket PATCH across the table.
  await call(`workspaces?id=eq.${WS_PERSONAL_A}`, { method: "PATCH", body: { owner_id: ids.admin } });
  await call(`workspaces?id=eq.${WS_PERSONAL_B}`, { method: "PATCH", body: { owner_id: ids.staffAssigned } });

  eq(
    "the owner sees their personal workspace",
    (await admin.rpc("can_view_workspace", { p_workspace_id: WS_PERSONAL_A })).data,
    true,
  );

  // A second admin, to prove that being an admin is not enough on its own.
  const secondAdminId = await createUser("admin2", {
    email: `${RUN_PREFIX}admin2-${stamp}@example.com`,
    password: `Verify-${stamp}-admin2`,
  });
  await call("organization_members", {
    method: "POST",
    body: { organization_id: ORG, user_id: secondAdminId, role: "admin" },
  });

  const secondAdmin = asUser(sessions.admin2);
  eq(
    "a second admin really is an admin",
    (await secondAdmin.rpc("current_role")).data,
    "admin",
  );
  eq(
    "a different admin cannot see someone else's personal workspace",
    (await secondAdmin.rpc("can_view_workspace", { p_workspace_id: WS_PERSONAL_A })).data,
    false,
  );
  eq(
    "nor its boards",
    (await secondAdmin.rpc("can_view_board", { p_board_id: BOARD_PERSONAL_A })).data,
    false,
  );
  await sup("the super admin can reach a personal workspace", async () =>
    eq(
      "the super admin can reach a personal workspace",
      (await superadmin.rpc("can_view_workspace", { p_workspace_id: WS_PERSONAL_A })).data,
      true,
    ),
  );

  // Grant, confirm, revoke, confirm.
  await call("workspace_personal_access", {
    method: "POST",
    body: { workspace_id: WS_PERSONAL_A, user_id: secondAdminId, can_edit: false },
  });
  eq(
    "a personal-access grant opens it immediately",
    (await secondAdmin.rpc("can_view_workspace", { p_workspace_id: WS_PERSONAL_A })).data,
    true,
  );

  await call(`workspace_personal_access?workspace_id=eq.${WS_PERSONAL_A}&user_id=eq.${secondAdminId}`, {
    method: "DELETE",
  });
  eq(
    "revoking that grant closes it immediately",
    (await secondAdmin.rpc("can_view_workspace", { p_workspace_id: WS_PERSONAL_A })).data,
    false,
    "no cached permission may survive a revoke",
  );

  const adminBoardsAfter = (await secondAdmin.rpc("get_my_boards")).data ?? [];
  check(
    "a personal workspace's boards never reach the board list of a non-owner",
    !adminBoardsAfter.some((b) => b.id === BOARD_PERSONAL_A),
    `saw ${JSON.stringify(adminBoardsAfter.map((b) => b.id))}`,
  );

  const analyticsAfter = (await secondAdmin.rpc("accessible_workspace_ids", { p_include_personal: false })).data ?? [];
  check(
    "personal workspaces are excluded from analytics",
    !analyticsAfter.includes(WS_PERSONAL_A),
    `scope was ${JSON.stringify(analyticsAfter)}`,
  );

  // Personal-workspace content must stay out of org-wide search for everyone,
  // including the super admin and including the workspace's own owner. Search
  // is an organization surface, not a personal one.
  const searchers = [
    ["a different admin", secondAdmin],
    ["the workspace's own owner", staffA],
  ];
  if (hasSuper) searchers.push(["the super admin", superadmin]);

  for (const [label, client] of searchers) {
    const hits = (await client.rpc("get_search_results", { p_query: PERSONAL_SECRET })).data ?? [];
    check(
      `personal-workspace content is invisible to ${label} in search`,
      hits.length === 0,
      `${label} found ${JSON.stringify(hits)}`,
    );
  }

  const ownerDirect = (await staffA.rpc("get_board_items", { p_board_id: BOARD_PERSONAL_B })).data ?? [];
  check(
    "but the owner can still open their own personal board directly",
    ownerDirect.length === 1,
    `owner saw ${JSON.stringify(ownerDirect.map((r) => r.id))}`,
  );

  const nonOwnerItems = (await secondAdmin.rpc("get_board_items", { p_board_id: BOARD_PERSONAL_B })).data ?? [];
  check(
    "a non-owner cannot read a personal board even by id",
    nonOwnerItems.length === 0,
    `non-owner saw ${JSON.stringify(nonOwnerItems)}`,
  );

  // ── 8. Client write guards ────────────────────────────────────────────────
  section("8. Client write guards");

  const editAllowed = await alice.rpc("get_board_columns", { p_board_id: BOARD_LEVIS_1 });
  check("alice still holds her grants before the write tests", (editAllowed.data ?? []).length === 2);

  const writeReadonly = await call("cell_values?record_id=eq.${recordId}&column_id=eq.${COL_PUBLIC}", {
    method: "PATCH",
    body: { value: "hijacked", value_text: "hijacked" },
    token: sessions.levisAlice,
  });
  check(
    "a client cannot write a read-only column",
    !writeReadonly.ok,
    `expected a rejection, got ${writeReadonly.status} ${JSON.stringify(writeReadonly.data)}`,
  );

  const writeHidden = await call("cell_values?record_id=eq.${recordId}&column_id=eq.${COL_SECRET}", {
    method: "PATCH",
    body: { value: "hijacked", value_text: "hijacked" },
    token: sessions.levisAlice,
  });
  check(
    "a client cannot write a hidden column",
    !writeHidden.ok,
    `expected a rejection, got ${writeHidden.status}`,
  );

  const writeEditable = await call("cell_values?record_id=eq.${recordId}&column_id=eq.${COL_PRIVATE}", {
    method: "PATCH",
    body: { value: 5000, value_text: "5000" },
    token: sessions.levisAlice,
  });
  check(
    "a client CAN write a column granted edit",
    writeEditable.ok,
    `expected success, got ${writeEditable.status} ${JSON.stringify(writeEditable.data)}`,
  );

  const insertNoCreate = await call("records", {
    method: "POST",
    body: {
      id: `${ORG}-r-alice`,
      organization_id: ORG,
      workspace_id: WS_CLIENT_LEVIS,
      board_id: BOARD_LEVIS_1,
      title: "Alice should not create this",
    },
    token: sessions.levisAlice,
  });
  check(
    "a client cannot insert without can_create",
    !insertNoCreate.ok,
    `expected a rejection, got ${insertNoCreate.status}`,
  );

  const deleteNoDelete = await call(`records?id=eq.${recordId}`, {
    method: "DELETE",
    token: sessions.levisAlice,
  });
  check(
    "a client cannot delete without can_delete",
    !deleteNoDelete.ok,
    `expected a rejection, got ${deleteNoDelete.status}`,
  );

  const moveRecord = await call(`records?id=eq.${recordId}`, {
    method: "PATCH",
    body: { board_id: BOARD_LEVIS_2 },
    token: sessions.levisAlice,
  });
  check(
    "a client cannot move a record to another board",
    !moveRecord.ok,
    `expected a rejection, got ${moveRecord.status}`,
  );

  // Flip can_create on and confirm the write now succeeds, so the test above is
  // proving the permission check and not merely a broken fixture.
  await call(`client_board_access?user_id=eq.${ids.levisAlice}&board_id=eq.${BOARD_LEVIS_1}`, {
    method: "PATCH",
    body: { can_create: true },
  });
  const insertWithCreate = await call("records", {
    method: "POST",
    body: {
      id: `${ORG}-r-alice-2`,
      organization_id: ORG,
      workspace_id: WS_CLIENT_LEVIS,
      board_id: BOARD_LEVIS_1,
      title: "Alice may create this",
    },
    token: sessions.levisAlice,
  });
  check(
    "granting can_create opens insertion immediately",
    insertWithCreate.ok,
    `expected success, got ${insertWithCreate.status} ${JSON.stringify(insertWithCreate.data)}`,
  );

  // ── 9. Immediate revocation ───────────────────────────────────────────────
  section("9. Revocation takes effect immediately");

  await call(`client_board_access?user_id=eq.${ids.levisAlice}&board_id=eq.${BOARD_LEVIS_1}`, {
    method: "DELETE",
  });
  eq(
    "revoking a board grant closes it on the next call",
    (await alice.rpc("can_view_board", { p_board_id: BOARD_LEVIS_1 })).data,
    false,
  );
  eq(
    "and the board disappears from their list",
    ((await alice.rpc("get_my_boards")).data ?? []).length,
    0,
  );

  // Give it back, then revoke just the column.
  await call("client_board_access", {
    method: "POST",
    body: {
      user_id: ids.levisAlice,
      workspace_id: WS_CLIENT_LEVIS,
      board_id: BOARD_LEVIS_1,
      can_view: true,
      can_create: true,
      can_delete: false,
    },
  });
  eq(
    "re-granting restores it",
    (await alice.rpc("can_view_board", { p_board_id: BOARD_LEVIS_1 })).data,
    true,
  );

  await call(`client_column_permissions?user_id=eq.${ids.levisAlice}&column_id=eq.${COL_PRIVATE}`, {
    method: "DELETE",
  });
  const colsAfterRevoke = (await alice.rpc("get_board_columns", { p_board_id: BOARD_LEVIS_1 })).data ?? [];
  check(
    "revoking a column hides it immediately",
    !colsAfterRevoke.some((c) => c.id === COL_PRIVATE),
    `still visible: ${JSON.stringify(colsAfterRevoke.map((c) => c.id))}`,
  );

  const writeAfterRevoke = await call("cell_values?record_id=eq.${recordId}&column_id=eq.${COL_PRIVATE}", {
    method: "PATCH",
    body: { value: 9999, value_text: "9999" },
    token: sessions.levisAlice,
  });
  check(
    "and it can no longer be written",
    !writeAfterRevoke.ok,
    `expected a rejection, got ${writeAfterRevoke.status}`,
  );

  // ── 10. No self-promotion ─────────────────────────────────────────────────
  section("10. No self-promotion");

  const selfPromote = await call(`workspace_members?user_id=eq.${ids.levisAlice}&workspace_id=eq.${WS_CLIENT_LEVIS}`, {
    method: "PATCH",
    body: { role: "admin" },
    token: sessions.levisAlice,
  });
  check(
    "a client cannot promote themselves",
    !selfPromote.ok,
    `expected a rejection, got ${selfPromote.status} ${JSON.stringify(selfPromote.data)}`,
  );

  const adminSelfPromote = await call(`workspace_members?user_id=eq.${ids.admin}&workspace_id=eq.${WS_STANDARD}`, {
    method: "PATCH",
    body: { role: "admin" },
    token: sessions.admin,
  });
  check(
    "an admin cannot change their own role row",
    !adminSelfPromote.ok,
    `expected a rejection, got ${adminSelfPromote.status}`,
  );

  const adminMakesAdmin = await call("workspace_members", {
    method: "POST",
    body: {
      user_id: ids.levisAlice,
      workspace_id: WS_STANDARD,
      role: "admin",
      can_view: true,
      can_edit: true,
    },
    token: sessions.admin,
  });
  check(
    "an admin cannot create another admin",
    !adminMakesAdmin.ok,
    `expected a rejection, got ${adminMakesAdmin.status} ${JSON.stringify(adminMakesAdmin.data)}`,
  );

  const staffGrantsSelf = await call("workspace_members", {
    method: "POST",
    body: {
      user_id: ids.staffUnassigned,
      workspace_id: WS_CLIENT_NIKE,
      role: "staff",
      can_view: true,
      can_edit: true,
    },
    token: sessions.staffAssigned,
  });
  check(
    "staff cannot grant themselves a workspace",
    !staffGrantsSelf.ok,
    `expected a rejection, got ${staffGrantsSelf.status}`,
  );

  const clientGrantsBoard = await call("client_board_access", {
    method: "POST",
    body: {
      user_id: ids.levisBob,
      workspace_id: WS_CLIENT_LEVIS,
      board_id: BOARD_LEVIS_2,
      can_view: true,
    },
    token: sessions.levisBob,
  });
  check(
    "a client cannot grant themselves a board",
    !clientGrantsBoard.ok,
    `expected a rejection, got ${clientGrantsBoard.status}`,
  );

  const clientReadsPeers = await alice.from("client_board_access");
  const peerRows = clientReadsPeers.data ?? [];
  check(
    "a client cannot read a co-worker's permissions",
    !peerRows.some((r) => r.user_id !== ids.levisAlice),
    `alice saw ${JSON.stringify(peerRows.map((r) => r.user_id))}`,
  );

  const clientReadsColumnPerms = await alice.from("client_column_permissions");
  const colPermRows = clientReadsColumnPerms.data ?? [];
  check(
    "a client cannot read a co-worker's column permissions",
    !colPermRows.some((r) => r.user_id !== ids.levisAlice),
    `alice saw ${JSON.stringify(colPermRows.map((r) => r.user_id))}`,
  );

  // ── 11. Super admin protection ────────────────────────────────────────────
  section("11. Super admin cannot be demoted or deleted");

  const superId = SUPER_ADMIN_ID ?? (await lookupSuperAdminId());

  await sup("the super admin cannot demote themselves", async () => {
    const demoteSelf = await call(`profiles?id=eq.${superId}`, {
      method: "PATCH",
      body: { role: "client" },
      token: sessions.superadmin,
    });
    check(
      "the super admin cannot demote themselves",
      !demoteSelf.ok,
      `expected a rejection, got ${demoteSelf.status} ${JSON.stringify(demoteSelf.data)}`,
    );
  });

  await sup("an admin cannot demote the super admin", async () => {
    const adminDemotesSuper = await call(`profiles?id=eq.${superId}`, {
      method: "PATCH",
      body: { role: "client" },
      token: sessions.admin,
    });
    check(
      "an admin cannot demote the super admin",
      !adminDemotesSuper.ok,
      `expected a rejection, got ${adminDemotesSuper.status}`,
    );
  });

  // Deletion is attempted the way it would actually be attempted in anger: with
  // the service-role key, which is the only credential that can reach the auth
  // admin API at all. A user JWT cannot call that endpoint in the first place,
  // so testing with one would pass for the wrong reason and prove nothing about
  // guard_super_admin_deletion().
  if (superId) {
    const deleteSuper = await fetch(`${URL_BASE}/auth/v1/admin/users/${superId}`, {
      method: "DELETE",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ should_soft_delete: false }),
    });
    const detail = await deleteSuper.text();

    check(
      "the super admin account cannot be deleted even by service_role",
      !deleteSuper.ok,
      `expected a rejection, got ${deleteSuper.status} ${detail}`,
    );
  } else {
    skip(
      "the super admin account cannot be deleted even by service_role",
      "could not resolve the super admin's auth id",
    );
  }

  await sup("the super admin still works after those attempts", async () =>
    eq(
      "the super admin still works after those attempts",
      (await asUser(sessions.superadmin).rpc("is_super_admin")).data,
      true,
    ),
  );

  // ── 12. Service role is not a person ─────────────────────────────────────
  section("12. Service role is a bypass, not an identity");

  const serviceRole = (await service.rpc("is_super_admin")).data;
  check(
    "is_super_admin() is false under service_role",
    serviceRole !== true,
    "service_role has no user identity and must not satisfy is_super_admin()",
  );

  // ── 13. Audit trail ───────────────────────────────────────────────────────
  section("13. Audit trail");

  const auditRows = (await service.from("audit_log")).data ?? [];
  const relevant = auditRows.filter((r) => r.workspace_id === WS_CLIENT_LEVIS);
  check(
    "grant changes are recorded in audit_log",
    relevant.length > 0,
    "expected at least one audit entry for the Levis workspace",
  );

  const clientAudit = await alice.from("audit_log");
  check(
    "a client cannot read the audit log",
    clientAudit.status === 403 || clientAudit.data?.length === 0,
    `expected 403 or 0 rows, got ${clientAudit.status}`,
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  let ids = null;
  let recordId = null;

  try {
    recordId = await seed();

    await signInSuperAdmin();
    if (!sessions.superadmin) {
      console.log(
        "\nNote: running without a super-admin session. Super-admin assertions are skipped,\n" +
          "not passed. Set RBAC_SUPER_ADMIN_PASSWORD to cover them.",
      );
    }

    for (const [key, spec] of Object.entries(USERS)) {
      ids = ids ?? {};
      ids[key] = await createUser(key, spec);
      console.log(`  user ${key}: ${spec.email}`);
    }

    await link(ids);

    console.log("\nRunning assertions …\n");
    await verify(recordId, ids);
  } catch (error) {
    console.error("\nHarness error:", error);
    failures.push({ name: "harness", detail: String(error) });
  } finally {
    if (ids || recordId) {
      await teardown(ids).catch((error) =>
        console.error("Teardown failed — clean this up by hand:", error),
      );
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failures.length} failed, ${skipped} skipped`);

  if (skipped > 0) {
    console.log(
      "\nSkipped assertions are NOT passes. Re-run with RBAC_SUPER_ADMIN_PASSWORD set to\n" +
        "cover the super-admin behaviours.",
    );
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f.name}${f.detail ? `\n      ${f.detail}` : ""}`);
    }
    process.exit(1);
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});