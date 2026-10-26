/**
 * Per-board date column diagnostic for the Overview "Received" date selection.
 * Run: node scripts/per_board_date_diag.cjs
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
const head = (s) => { line(); line("=".repeat(76)); line(s); line("=".repeat(76)); };
const kv = (k, v) => line(`  ${String(k).padEnd(30)} ${v}`);

async function main() {
  // Find the org with records
  const { data: boards } = await db.from("boards").select("id,name,organization_id,workspace_id").eq("status", "active").order("created_at");
  const orgId = boards?.[0]?.organization_id;
  line("Organization:", orgId);

  // Per board: columns, records count, cell_values count, date column populated counts
  for (const b of boards ?? []) {
    head(`BOARD: ${b.name} (${b.id})`);

    const { data: cols } = await db.from("columns").select("id,label,type,key,sort_order").eq("board_id", b.id).is("deleted_at", null).order("sort_order");
    const { count: recCount } = await db.from("records").select("*", { count: "exact", head: true }).eq("board_id", b.id).eq("status", "active");
    const { count: cvCount } = await db.from("cell_values").select("*", { count: "exact", head: true }).eq("board_id", b.id);

    kv("active records", recCount);
    kv("cell_values rows", cvCount);

    // Field mappings for this board
    const { data: maps } = await db.from("client_360_field_mappings").select("field_type,resolved_column_ref,source").eq("board_id", b.id);
    const mapByField = new Map();
    for (const m of maps ?? []) mapByField.set(m.field_type, m.resolved_column_ref);

    for (const c of cols ?? []) {
      // Count populated cells for date/timeline columns
      let populated = "n/a";
      if (c.type === "date" || c.type === "timeline") {
        const { count } = await db.from("cell_values").select("*", { count: "exact", head: true })
          .eq("board_id", b.id).eq("column_id", c.id);
        populated = count;
      }
      const mapped = mapByField.get("job_date") === c.id ? "  <== CHOSEN AS job_date (Received)" :
                     mapByField.get("completed_date") === c.id ? "  <== completed_date" :
                     mapByField.get("due_date") === c.id ? "  <== due_date" : "";
      line(`  col ${c.id}  "${c.label}"  type=${c.type}  sort=${c.sort_order}  populated=${populated}${mapped}`);
    }

    // Snapshot rows for this board
    const { count: snapCount } = await db.from("client_360_daily_snapshot").select("*", { count: "exact", head: true }).eq("board_id", b.id);
    const { count: snapWithDate } = await db.from("client_360_daily_snapshot").select("*", { count: "exact", head: true }).eq("board_id", b.id).not("job_date", "is", null);
    kv("snapshot rows", snapCount);
    kv("snapshot rows w/ job_date", snapWithDate);
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });