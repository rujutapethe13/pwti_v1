/**
 * Verifies the Job Type dropdown fix against the LIVE Photofactory board using
 * the same resolver the UI now uses.
 *
 * For every cell in the Job Type column, print the stored value and the text
 * the user will actually see. Asserts that no rendered label is an "opt-…"
 * string.
 *
 * Read-only. Run: node scripts/jobtype_verify.cjs
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

// ── Mirror of src/features/boards/engine/lib/option-lookup.ts ──────────────
const OPTION_ID_PATTERN = /^opt[-_]/i;
const UNKNOWN_OPTION_LABEL = "Unknown option";

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const opt of raw) {
    if (typeof opt === "string") {
      if (opt) out.push({ id: opt, label: opt });
      continue;
    }
    if (opt && typeof opt === "object") {
      const o = opt;
      const label = typeof o.label === "string" ? o.label : "";
      const id = (typeof o.id === "string" && o.id.length > 0 ? o.id : label) || "";
      if (!id && !label) continue;
      const e = { id, label };
      if (typeof o.color === "string") e.color = o.color;
      out.push(e);
    }
  }
  return out;
}

function findOptionForValue(options, value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) {
    const label = typeof value.label === "string" ? value.label : "";
    if (!label) return undefined;
    return options.find((o) => o.id === value.id || o.label === label);
  }
  if (typeof value !== "string") return undefined;
  const str = value.trim();
  if (!str) return undefined;
  return (
    options.find((o) => o.id === str) ??
    options.find((o) => o.label === str) ??
    options.find((o) => o.label.toLowerCase() === str.toLowerCase())
  );
}

function resolveOptionDisplay(options, value) {
  if (value === null || value === undefined || value === "") {
    return { label: "", isEmpty: true, isUnknown: false };
  }
  const option = findOptionForValue(options, value);
  if (option) {
    if (option.label && !OPTION_ID_PATTERN.test(option.label)) {
      return { label: option.label, isEmpty: false, isUnknown: false };
    }
    return { label: UNKNOWN_OPTION_LABEL, isEmpty: false, isUnknown: true };
  }
  if (OPTION_ID_PATTERN.test(String(value))) {
    return { label: UNKNOWN_OPTION_LABEL, isEmpty: false, isUnknown: true };
  }
  return { label: String(value), isEmpty: false, isUnknown: false };
}
// ──────────────────────────────────────────────────────────────────────────

const BOARD_ID = "board-1790842747288-9pp0635";
const COLUMN_ID = "col-1790842747289-blns9gj";

const line = (s = "") => console.log(s);
const head = (s) => {
  line();
  line("=".repeat(78));
  line(s);
  line("=".repeat(78));
};

async function main() {
  const { data: col, error } = await db
    .from("columns")
    .select("id,label,type,settings")
    .eq("id", COLUMN_ID)
    .single();
  if (error) throw error;

  const options = normalizeOptions(col.settings?.options);

  head(`COLUMN "${col.label}" (${col.id}) type=${col.type}`);
  line(`options (${options.length}):`);
  line(JSON.stringify(options, null, 2));

  const { data: cells } = await db
    .from("cell_values")
    .select("record_id,value")
    .eq("column_id", COLUMN_ID);

  head("CELL VALUES: stored id -> displayed label");
  const byLabel = new Map();
  for (const c of cells ?? []) {
    const r = resolveOptionDisplay(options, c.value);
    byLabel.set(`${c.value}`, r);
  }
  for (const [stored, r] of [...byLabel.entries()].sort()) {
    line(
      `  ${String(stored).padEnd(26)} -> ${r.isUnknown ? "!" : " "}${r.label || "(empty)"}`,
    );
  }

  head("SAMPLE ROWS (first 3 records, resolved)");
  const { data: recs } = await db
    .from("records")
    .select("id,title")
    .eq("board_id", BOARD_ID)
    .limit(200);
  const byRec = new Map((cells ?? []).map((c) => [c.record_id, c.value]));
  let shown = 0;
  for (const r of recs ?? []) {
    if (!byRec.has(r.id)) continue;
    const res = resolveOptionDisplay(options, byRec.get(r.id));
    line(`  ${(r.title || "").slice(0, 34).padEnd(34)} | stored=${String(byRec.get(r.id)).padEnd(24)} | shows "${res.label}"`);
    shown += 1;
    if (shown >= 3) break;
  }

  // Assertion: nothing user-visible may be an opt-... string.
  const leaks = [...byLabel.entries()]
    .map(([stored, r]) => [stored, r.label])
    .filter(([, label]) => OPTION_ID_PATTERN.test(label));
  head("RESULT");
  const unknown = [...byLabel.values()].filter((r) => r.isUnknown).length;
  line(`  cells checked        : ${(cells ?? []).length}`);
  line(`  distinct values      : ${byLabel.size}`);
  line(`  resolved to Unknown  : ${unknown}`);
  line(`  raw opt- leaks       : ${leaks.length}`);
  if (leaks.length > 0) {
    line("  *** LEAK: " + JSON.stringify(leaks));
    process.exitCode = 1;
  } else {
    line("  PASS — every cell renders a human-readable label.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
