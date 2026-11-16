const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnvFile(path.join(__dirname, "..", ".env.local"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const line = (s = "") => console.log(s);
const head = (s) => { line(); line("=".repeat(76)); line(s); line("=".repeat(76)); };
const kv = (k, v) => line(`  ${String(k).padEnd(30)} ${v}`);

async function main() {
  // Find the Nov board
  const { data: boards, error: bErr } = await db.from("boards").select("*").ilike("name", "%nov%").eq("status", "active");
  if (bErr) { console.error("board query error:", bErr.message); return; }
  if (!boards || boards.length === 0) {
    console.log("No board matching %nov% found. Listing all boards:");
    const { data: all } = await db.from("boards").select("id,name,slug,organization_id,workspace_id,status,created_at").order("created_at");
    for (const b of all || []) console.log(JSON.stringify(b));
    return;
  }

  for (const board of boards) {
    head(`BOARD: ${board.name} (${board.id}) slug=${board.slug}`);
    kv("organization_id", board.organization_id);
    kv("workspace_id", board.workspace_id);
    kv("title_column_label", board.title_column_label);
    kv("primary_column_label", board.primary_column_label);

    // Columns
    const { data: cols } = await db.from("columns").select("*").eq("board_id", board.id).is("deleted_at", null).order("sort_order");
    line("\n  COLUMNS:");
    for (const c of cols || []) {
      line(`    id=${c.id} key="${c.key}" label="${c.label}" type=${c.type} is_primary=${c.is_primary} pinned=${c.pinned} group_id=${c.group_id} default_value=${JSON.stringify(c.default_value)}`);
    }

    // Records
    const { data: recs, count: recCount } = await db.from("records").select("*", { count: "exact" }).eq("board_id", board.id).eq("status", "active").order("created_at").limit(1000);
    kv("active records", recCount);

    // Show first 5 records fully
    for (const r of (recs || []).slice(0, 5)) {
      line(`\n  RECORD id=${r.id} group_id=${r.group_id}`);
      line(`    title="${r.title}" name="${r.name}"`);
      // all keys
      line(`    all keys: ${Object.keys(r).join(", ")}`);
    }

    // Cell values for first 3 records - full raw
    const sampleIds = (recs || []).slice(0, 3).map(r => r.id);
    if (sampleIds.length) {
      const { data: cells } = await db.from("cell_values").select("*").in("record_id", sampleIds).order("created_at");
      line("\n  CELL VALUES (raw):");
      for (const c of cells || []) {
        line(`    record_id=${c.record_id} column_id=${c.column_id}`);
        line(`      value (jsonb) = ${JSON.stringify(c.value)}`);
        line(`      value_text = "${c.value_text}"`);
        line(`      value_json = ${JSON.stringify(c.value_json)}`);
      }
    }

    // Groups
    const { data: groups } = await db.from("groups").select("*").eq("board_id", board.id).eq("status", "active").order("sort_order");
    line("\n  GROUPS:");
    for (const g of groups || []) {
      line(`    id=${g.id} name="${g.name}" title_column_label="${g.title_column_label}" column_mode=${g.column_mode}`);
    }
  }
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });