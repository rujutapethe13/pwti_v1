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

async function main() {
  // Find boards with "Imported row" titles
  const { data: imported } = await db.from("records")
    .select("id,board_id,title")
    .ilike("title", "Imported row %")
    .eq("status", "active")
    .limit(200);
  line("Records with 'Imported row' title:", imported?.length);
  const byBoard = {};
  for (const r of imported || []) {
    (byBoard[r.board_id] = byBoard[r.board_id] || []).push(r);
  }
  for (const [bid, rows] of Object.entries(byBoard)) {
    const { data: b } = await db.from("boards").select("id,name").eq("id", bid).maybeSingle();
    line(`  board ${b?.name ?? bid} (${bid}): ${rows.length} records`);
  }

  // Also check the "Untitled" records across all boards
  const { data: untitled } = await db.from("records")
    .select("id,board_id,title")
    .eq("title", "Untitled")
    .eq("status", "active")
    .limit(200);
  head("Records with title='Untitled' across all boards");
  line("count:", untitled?.length);
  const byBoard2 = {};
  for (const r of untitled || []) {
    (byBoard2[r.board_id] = byBoard2[r.board_id] || []).push(r);
  }
  for (const [bid, rows] of Object.entries(byBoard2)) {
    const { data: b } = await db.from("boards").select("id,name").eq("id", bid).maybeSingle();
    line(`  board ${b?.name ?? bid} (${bid}): ${rows.length} records`);
    // show their cell_values for the primary column
    const { data: cols } = await db.from("columns").select("id,key,label,type").eq("board_id", bid).is("deleted_at", null).order("sort_order");
    const textCol = (cols || []).find(c => ["text","long_text","email","phone","url"].includes(c.type));
    if (textCol) {
      const ids = rows.map(r => r.id);
      const { data: cells } = await db.from("cell_values").select("record_id,value,value_text").in("record_id", ids).eq("column_id", textCol.id);
      for (const c of cells || []) line(`    record ${c.record_id} col ${textCol.key} value=${JSON.stringify(c.value)} value_text="${c.value_text}"`);
    }
  }

  // Check the buggy toCellEntry path vs cell-repository path
  head("cell_values where value IS NULL but value_text = 'null'");
  const { data: nullCells } = await db.from("cell_values")
    .select("id,record_id,column_id,value,value_text,value_json")
    .is("value", null)
    .eq("value_text", "null")
    .limit(20);
  line("count:", nullCells?.length);
  for (const c of nullCells || []) {
    const { data: b } = await db.from("boards").select("name").eq("id", c.board_id).maybeSingle();
    const { data: col } = await db.from("columns").select("key,label,type").eq("id", c.column_id).maybeSingle();
    line(`  board=${b?.name} col=${col?.label}(${col?.type}) record=${c.record_id}`);
  }
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });