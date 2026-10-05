/**
 * Read-only diagnostic for the Overview "No data in this period" / "0 received" bug.
 *
 * Answers item 1 of the bug report: the exact query behind the Overview stat
 * cards and the "Volume trend" chart, with
 *   - table/collection name
 *   - workspace_id
 *   - board_ids
 *   - date range
 *   - filters
 *   - number of rows returned
 *
 * Runs over the Supabase REST/RPC API (the same path the app uses) because the
 * direct Postgres port is not reachable from this machine. SQL that is not
 * expressible as a REST filter is issued through the app's own
 * `_client_360_*` / `overview_*` RPCs.
 *
 * Nothing here writes. Run: node scripts/overview_date_diag.cjs
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnvFile(path.join(__dirname, "..", ".env.local"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const line = (s = "") => console.log(s);
const head = (s) => {
  line();
  line("=".repeat(76));
  line(s);
  line("=".repeat(76));
};
const kv = (k, v) => line(`  ${String(k).padEnd(26)} ${v}`);

function toKey(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function resolve1y() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 12);
  const pt = new Date(from);
  pt.setDate(pt.getDate() - 1);
  const pf = new Date(pt);
  pf.setDate(pf.getDate() - 365);
  return { from: toKey(from), to: toKey(to), priorFrom: toKey(pf), priorTo: toKey(pt) };
}

async function main() {
  line(`Supabase project: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
  line("Role: service_role (RLS bypassed — same client the Overview API uses)");

  // ── Organizations / workspaces ───────────────────────────────────────────
  const { data: orgs } = await db.from("organizations").select("id,name,status");
  const { data: wss } = await db.from("workspaces").select("id,name,organization_id");

  head("1. ORGANIZATIONS / WORKSPACES");
  line(JSON.stringify(orgs, null, 2));
  line("workspaces:");
  line(JSON.stringify(wss, null, 2));
  // Do NOT take orgs[0]. Several organizations exist as seeded/demo shells with
  // no records, so the first one alphabetically reports "0 received" for a
  // perfectly healthy snapshot. Pick the org that actually holds active
  // records, falling back to the first org only when none do.
  const { count: activeRecords } = await db
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  let organizationId = orgs?.[0]?.id;
  const { data: orgCounts } = await db.from("records").select("organization_id,status");
  const byOrg = new Map();
  for (const r of orgCounts ?? []) {
    if (r.status !== "active") continue;
    byOrg.set(r.organization_id, (byOrg.get(r.organization_id) ?? 0) + 1);
  }
  const richest = [...byOrg.entries()].sort((a, b) => b[1] - a[1])[0];
  if (richest) organizationId = richest[0];
  line();
  line(`  active records total: ${activeRecords ?? "?"}`);
  line(`  chosen organization : ${organizationId} (records=${richest?.[1] ?? 0})`);
  if (orgs?.[0]?.id !== organizationId) {
    line(`  NOTE: orgs[0] would have been ${orgs?.[0]?.id}, which has no records.`);
  }

  // ── Boards = the board view's source of truth ───────────────────────────
  const { data: boards } = await db
    .from("boards")
    .select("id,name,slug,workspace_id,organization_id,status")
    .order("created_at");

  head("2. BOARDS (the board table view reads `records` + `cell_values` by board_id)");
  for (const b of boards ?? []) line(`  ${b.id}  "${b.name}"  ws=${b.workspace_id}  org=${b.organization_id}`);
  line(`  board_ids    = ${JSON.stringify((boards ?? []).map((b) => b.id))}`);
  const workspaceIds = [
    ...new Set((boards ?? []).map((b) => b.workspace_id).filter(Boolean)),
  ];
  line(`  workspace_ids= ${JSON.stringify(workspaceIds)}`);

  // ── Column definitions: which one is "Receive Date"? ─────────────────────
  const { data: cols } = await db
    .from("columns")
    .select("id,board_id,label,key,type,sort_order")
    .order("board_id")
    .order("sort_order");

  head("3. COLUMNS — is 'Receive Date' typed as `date`?");
  line("  (client_360 field detection REQUIRES type in ('date','timeline');");
  line("   a text column labelled 'Receive Date' is never mapped as job_date)");
  const receiveCols = (cols ?? []).filter((c) => /receive|received|inward|job\s*date/i.test(c.label));
  if (receiveCols.length === 0) {
    line("  !! NO column whose label matches received/inward/job date");
  }
  for (const c of cols ?? []) {
    const mark = /receive|received|inward|job\s*date/i.test(c.label) ? " <== candidate" : "";
    line(`  board=${c.board_id}  "${c.label}"  type=${c.type}  key=${c.key}${mark}`);
  }

  // ── Field mappings actually in effect ───────────────────────────────────
  const { data: maps } = await db
    .from("client_360_field_mappings")
    .select("board_id,field_type,resolved_column_ref,source,confidence");

  head("4. client_360_field_mappings (what refresh_client_360_snapshot reads)");
  if (!maps || maps.length === 0) line("  !! EMPTY — no job_date mapping, so every snapshot row has job_date = NULL");
  for (const m of maps ?? []) {
    const c = (cols ?? []).find((x) => x.id === m.resolved_column_ref);
    line(`  board=${m.board_id}  field=${m.field_type.padEnd(15)} -> column "${c?.label ?? m.resolved_column_ref}" (type=${c?.type})  ${m.source}/${m.confidence}`);
  }

  // ── Raw Receive Date cell values: what format is actually stored? ───────
  for (const c of receiveCols) {
    const { data: cells } = await db
      .from("cell_values")
      .select("value,value_text")
      .eq("column_id", c.id)
      .limit(20000);

    const parse = async (texts) => {
      const { data, error } = await db.rpc("_client_360_parse_date_batch", { p_texts: texts });
      return error ? { error: error.message } : data;
    };

    const raws = (cells ?? []).map((cv) =>
      cv.value === null ? String(cv.value_text ?? "") : String(cv.value),
    );
    const nonEmpty = raws.filter((s) => s.trim() !== "");
    const parsed = await parse(nonEmpty);

    head(`5. "Receive Date" CELLS — board ${c.board_id}, column "${c.label}" (type=${c.type})`);
    kv("cells total", (cells ?? []).length);
    kv("cells non-empty", nonEmpty.length);
    kv("distinct raw formats", JSON.stringify([...new Set(nonEmpty.map((s) => s.replace(/\d/g, "N")))].slice(0, 8)));
    line("  first 8 raw values:");
    for (const v of [...new Set(nonEmpty)].slice(0, 8)) line(`    "${v}"`);
    if (parsed?.error) {
      kv("parse probe", `RPC _client_360_parse_date_batch unavailable: ${parsed.error}`);
    } else {
      const ok = (parsed ?? []).filter((p) => p !== null);
      kv("parsed to a DATE", `${ok.length} / ${nonEmpty.length}`);
      kv("parsed to NULL", `${nonEmpty.length - ok.length}`);
      line("  first 8 parsed:");
      for (const [i, v] of [...new Set(nonEmpty)].slice(0, 8).entries()) {
        line(`    "${v}" -> ${JSON.stringify(parsed[i])}`);
      }
    }
  }

  // ── THE table the Overview reads ────────────────────────────────────────
  const { count: snapCount } = await db
    .from("client_360_daily_snapshot")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  const { count: snapWithDate } = await db
    .from("client_360_daily_snapshot")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .not("job_date", "is", null);
  const { data: snapBounds } = await db
    .from("client_360_daily_snapshot")
    .select("job_date")
    .eq("organization_id", organizationId)
    .not("job_date", "is", null)
    .order("job_date", { ascending: true })
    .limit(1);
  const { data: snapBoundsMax } = await db
    .from("client_360_daily_snapshot")
    .select("job_date")
    .eq("organization_id", organizationId)
    .not("job_date", "is", null)
    .order("job_date", { ascending: false })
    .limit(1);

  head("6. client_360_daily_snapshot — THE collection the Overview queries");
  kv("table/collection", "public.client_360_daily_snapshot");
  kv("rows total", snapCount);
  kv("rows with job_date", snapWithDate);
  kv("rows with job_date NULL", (snapCount ?? 0) - (snapWithDate ?? 0));
  kv("min job_date", snapBounds?.[0]?.job_date ?? "n/a");
  kv("max job_date", snapBoundsMax?.[0]?.job_date ?? "n/a");

  // ── Snapshot freshness vs live records ──────────────────────────────────
  const { count: recTotal } = await db.from("records").select("*", { count: "exact", head: true });
  const { count: recActive } = await db
    .from("records").select("*", { count: "exact", head: true }).eq("status", "active");
  const { data: recStatuses } = await db.from("records").select("status");
  const statusCounts = {};
  for (const r of recStatuses ?? []) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  head("7. SNAPSHOT FRESHNESS (refresh only ingests records WHERE status = 'active')");
  kv("records total", recTotal);
  kv("records active", recActive);
  kv("records by status", JSON.stringify(statusCounts));
  kv("snapshot rows", snapCount);
  const { data: refreshState } = await db.from("client_360_refresh_state").select("*");
  kv("refresh_state", JSON.stringify(refreshState ?? "table unreadable"));

  // ── THE EXACT OVERVIEW QUERY, Last 1 year ───────────────────────────────
  const r1 = resolve1y();

  head("8. THE EXACT OVERVIEW QUERY — preset 'Last 1 year'");
  line();
  line("  A) Stat cards  ->  supabase.rpc('overview_period_stats', ...)");
  line("     underlying  ->  public._client_360_window_stats(org, from, to)");
  line("                   public.client_360_daily_snapshot");
  line("                   WHERE organization_id = p_organization_id");
  line("                     AND job_date BETWEEN p_from AND p_to");
  line("     NOTE: no workspace_id filter, no board_id filter, no client_id filter.");
  kv("organization_id", organizationId);
  kv("workspace_id", "(NOT filtered — all workspaces in the org)");
  kv("board_ids", "(NOT filtered — all boards in the org)");
  kv("current range", `${r1.from} .. ${r1.to}`);
  kv("prior range", `${r1.priorFrom} .. ${r1.priorTo}`);
  kv("filters", "organization_id = $org AND job_date BETWEEN from AND to");

  const { data: windowRows } = await db
    .from("client_360_daily_snapshot")
    .select("record_id,board_id,workspace_id,job_date,volume")
    .eq("organization_id", organizationId)
    .gte("job_date", r1.from)
    .lte("job_date", r1.to);
  kv("ROWS RETURNED (current window)", (windowRows ?? []).length);

  const { data: priorRows } = await db
    .from("client_360_daily_snapshot")
    .select("record_id")
    .eq("organization_id", organizationId)
    .gte("job_date", r1.priorFrom)
    .lte("job_date", r1.priorTo);
  kv("ROWS RETURNED (prior window)", (priorRows ?? []).length);

  const { data: rpcStats, error: rpcErr } = await db.rpc("overview_period_stats", {
    p_organization_id: organizationId,
    // Required since the 20261001000000 repair; Postgres cannot give this a
    // default because non-defaulted parameters follow it (42P13).
    p_workspace_ids: workspaceIds.length ? workspaceIds : null,
    p_from: r1.from,
    p_to: r1.to,
    p_prior_from: r1.priorFrom,
    p_prior_to: r1.priorTo,
  });
  line();
  line("  rpc('overview_period_stats') result:");
  if (rpcErr) {
    kv("ERROR", rpcErr.message);
  } else {
    line(JSON.stringify(rpcStats, null, 4).split("\n").map((l) => "    " + l).join("\n"));
  }

  line();
  line("  B) Volume trend ->  supabase.from('client_360_daily_snapshot')");
  line("     .select('job_date, completed_date, volume')");
  line("     .eq('organization_id', $org).gte('job_date', from).lte('job_date', to)");
  kv("organization_id", organizationId);
  kv("workspace_id", "(NOT filtered)");
  kv("board_ids", "(NOT filtered)");
  kv("range", `${r1.from} .. ${r1.to}`);
  kv("filters", "organization_id = $org AND job_date >= from AND job_date <= to");
  kv("ROWS RETURNED", (windowRows ?? []).length);
  kv("monthly grouping", "done CLIENT-SIDE in accumulateVolume() (granularity='month' for 366 days)");

  // ── Where the data actually sits relative to the range ─────────────────
  const { count: neverDated } = await db
    .from("client_360_daily_snapshot")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("job_date", null);
  const { count: beforeRange } = await db
    .from("client_360_daily_snapshot")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .lt("job_date", r1.from);
  const { count: afterRange } = await db
    .from("client_360_daily_snapshot")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gt("job_date", r1.to);

  head("9. ROW DISPOSITION vs the selected range (drives 'N items exist outside this range')");
  kv("inside range", (windowRows ?? []).length);
  kv("before range", beforeRange);
  kv("after range", afterRange);
  kv("never dated (job_date IS NULL)", neverDated);
  kv("TOTAL", (snapCount ?? 0));

  // ── item 5: workspace_id / board_id integrity ───────────────────────────
  head("10. RECORDS INTEGRITY — workspace_id / board_id / organization_id");
  const { data: recordsSample } = await db
    .from("records")
    .select("id,board_id,workspace_id,organization_id,status")
    .limit(5000);
  const boardById = new Map((boards ?? []).map((b) => [b.id, b]));
  let wsMismatch = 0, orgMismatch = 0, nullWs = 0, nullBoard = 0;
  for (const r of recordsSample ?? []) {
    const b = boardById.get(r.board_id);
    if (!r.workspace_id) nullWs++;
    if (!r.board_id) nullBoard++;
    if (b && r.workspace_id && r.workspace_id !== b.workspace_id) wsMismatch++;
    if (b && r.organization_id && r.organization_id !== b.organization_id) orgMismatch++;
  }
  kv("records sampled", (recordsSample ?? []).length);
  kv("records.workspace_id NULL", nullWs);
  kv("records.board_id NULL", nullBoard);
  kv("workspace_id != board.workspace_id", wsMismatch);
  kv("organization_id != board.org_id", orgMismatch);

  const { data: cvSample } = await db
    .from("cell_values")
    .select("board_id,workspace_id,organization_id")
    .limit(5000);
  let cvWsMismatch = 0, cvOrgMismatch = 0, cvNullWs = 0;
  for (const c of cvSample ?? []) {
    const b = boardById.get(c.board_id);
    if (!c.workspace_id) cvNullWs++;
    if (b && c.workspace_id !== b.workspace_id) cvWsMismatch++;
    if (b && c.organization_id !== b.organization_id) cvOrgMismatch++;
  }
  kv("cell_values sampled", (cvSample ?? []).length);
  kv("cell_values.workspace_id NULL", cvNullWs);
  kv("cell_values ws != board ws", cvWsMismatch);
  kv("cell_values org != board org", cvOrgMismatch);

  line();
  line("Diagnostic complete (read-only).");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
