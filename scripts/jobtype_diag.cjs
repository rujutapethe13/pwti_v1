/**
 * Read-only diagnostic for the "Job Type" dropdown showing raw option ids
 * (e.g. "opt-1790843037295-0") on the Photofactory board.
 *
 * Reports, for the target board:
 *   - every column with its type and settings.options
 *   - distinct cell values for option-style columns
 *   - which cell values are orphaned (not a valid option id)
 *   - the original "Type of Job" source column and its distinct values
 *
 * Nothing here writes. Run: node scripts/jobtype_diag.cjs
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

const OPTION_TYPES = new Set(["status", "priority", "dropdown", "multi_select"]);

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const o of raw) {
    if (typeof o === "string") out.push({ id: o, label: o });
    else if (o && typeof o === "object") {
      const label = typeof o.label === "string" ? o.label : "";
      const id = (typeof o.id === "string" && o.id ? o.id : label) || "";
      const e = { id, label };
      if (typeof o.color === "string") e.color = o.color;
      out.push(e);
    }
  }
  return out;
}

const line = (s = "") => console.log(s);
const head = (s) => {
  line();
  line("=".repeat(78));
  line(s);
  line("=".repeat(78));
};

async function main() {
  line(`Supabase project: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
  line("Role: service_role (bypasses RLS)");

  const { data: wss } = await db.from("workspaces").select("id,name,organization_id");
  const wsById = new Map((wss ?? []).map((w) => [w.id, w.name]));

  const { data: boards, error: bErr } = await db
    .from("boards")
    .select("id,name,slug,workspace_id,status")
    .order("name");
  if (bErr) throw bErr;
  head("1. BOARDS");
  for (const b of boards ?? []) {
    line(
      `  ${b.id}  ${b.name}  (${b.slug})  workspace=${wsById.get(b.workspace_id) ?? b.workspace_id} status=${b.status}`,
    );
  }

  const wanted = (process.argv[2] ?? "").toLowerCase();
  const target = wanted
    ? (boards ?? []).find(
        (b) =>
          b.id === wanted ||
          (b.name ?? "").toLowerCase() === wanted ||
          (b.slug ?? "").toLowerCase() === wanted ||
          (wsById.get(b.workspace_id) ?? "").toLowerCase().includes(wanted),
      )
    : undefined;
  if (!target) {
    line(`\nNo board matched ${JSON.stringify(wanted)}.`);
    return;
  }
  head(`2. TARGET BOARD: ${target.name} (${target.id})  workspace=${wsById.get(target.workspace_id)}`);

  const { data: columns, error: cErr } = await db
    .from("columns")
    .select("*")
    .eq("board_id", target.id)
    .order("sort_order");
  if (cErr) throw cErr;

  head("3. COLUMNS (type + settings.options)");
  for (const c of columns ?? []) {
    const opts = normalizeOptions(c.settings?.options);
    line(`\n  [${c.id}]  "${c.label}"  key=${c.key}  type=${c.type}  hidden=${c.hidden}`);
    if (OPTION_TYPES.has(c.type)) {
      line(`    options (${opts.length}): ${JSON.stringify(opts)}`);
      if (opts.length === 0) {
        line("    *** NO OPTIONS — every cell will render as a raw id ***");
      }
    }
  }

  head("4. CELL VALUES for option-style columns");
  const { data: cells, error: cvErr } = await db
    .from("cell_values")
    .select("record_id,column_id,value,value_text")
    .eq("board_id", target.id);
  if (cvErr) throw cvErr;

  const byColumn = new Map();
  for (const c of columns ?? []) byColumn.set(c.id, c);

  for (const c of columns ?? []) {
    if (!OPTION_TYPES.has(c.type)) continue;
    const opts = normalizeOptions(c.settings?.options);
    const ids = new Set(opts.map((o) => o.id));
    const labels = new Set(opts.map((o) => o.label).filter(Boolean));
    const rows = (cells ?? []).filter((cv) => cv.column_id === c.id);
    const counts = new Map();
    for (const r of rows) {
      const v = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    line(`\n  "${c.label}" (${c.id}) — ${rows.length} cells, ${counts.size} distinct`);
    for (const [v, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const isId = ids.has(v);
      const isLabel = labels.has(v);
      const looksLikeId = /^opt[-_]/i.test(v);
      const status = isId ? "OK(id)" : isLabel ? "label-not-id" : looksLikeId ? "ORPHAN opt-id" : "raw text";
      line(`    ${String(n).padStart(5)}  ${JSON.stringify(v).padEnd(34)} ${status}`);
    }
    const sample = rows.slice(0, 3);
    line(`    sample cell values: ${JSON.stringify(sample.map((s) => ({ record: s.record_id, value: s.value })))}`);
  }

  // Source column for the rebuild path
  const source = (columns ?? []).filter((c) =>
    /type\s*of\s*job|job\s*type/i.test(c.label),
  );
  head("5. POSSIBLE SOURCE COLUMNS ('Type of Job' / 'Job Type')");
  for (const c of source) {
    line(`  [${c.id}] "${c.label}" type=${c.type}`);
    const rows = (cells ?? []).filter((cv) => cv.column_id === c.id);
    const counts = new Map();
    for (const r of rows) {
      const v = typeof r.value === "string" ? r.value : JSON.stringify(r.value);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const [v, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      line(`    ${String(n).padStart(5)}  ${JSON.stringify(v)}`);
    }
  }
  // ── Scan EVERY board for option columns with empty options or orphan cells ──
  head("6. CROSS-BOARD SCAN: option columns with missing options / orphan cells");
  const { data: allCols } = await db.from("columns").select("id,board_id,label,type,settings");
  const { data: allCells } = await db
    .from("cell_values")
    .select("board_id,column_id,value")
    .limit(5000);
  const cellCountsByCol = new Map();
  for (const cv of allCells ?? []) {
    const k = cv.column_id;
    const arr = cellCountsByCol.get(k) ?? [];
    arr.push(typeof cv.value === "string" ? cv.value : JSON.stringify(cv.value));
    cellCountsByCol.set(k, arr);
  }
  const boardNameById = new Map((boards ?? []).map((b) => [b.id, b.name]));
  for (const c of allCols ?? []) {
    if (!OPTION_TYPES.has(c.type)) continue;
    const opts = normalizeOptions(c.settings?.options);
    const vals = cellCountsByCol.get(c.id) ?? [];
    const ids = new Set(opts.map((o) => o.id));
    const orphans = new Set(
      vals.filter((v) => v && /^opt[-_]/i.test(v) && !ids.has(v)),
    );
    const emptyLabelOpts = opts.filter((o) => !o.label);
    if (opts.length === 0 || orphans.size > 0 || emptyLabelOpts.length > 0) {
      line(
        `\n  board=${boardNameById.get(c.board_id) ?? c.board_id}  col="${c.label}" (${c.id}) type=${c.type}`,
      );
      line(`    options=${opts.length}  cells=${vals.length}  orphanOptIds=${orphans.size}  emptyLabels=${emptyLabelOpts.length}`);
      if (opts.length) line(`    options JSON: ${JSON.stringify(opts.slice(0, 30))}`);
      if (orphans.size) line(`    ORPHANS: ${JSON.stringify([...orphans].slice(0, 10))}`);
      if (emptyLabelOpts.length) line(`    EMPTY-LABEL OPTS: ${JSON.stringify(emptyLabelOpts.slice(0, 10))}`);
    }
  }
  line("\n  (columns not listed above have a complete options list and no orphan ids)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
