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

const NOV_BOARD = "4b0bd58f-ebeb-4f8d-92be-47be50033225";

async function main() {
  // STEP 1: Find all cells on Nov board where value IS NULL but value_text = 'null'
  console.log("=== STEP 1: Find affected cells ===");
  const { data: cells, error: findErr } = await db.from("cell_values")
    .select("record_id,column_id,value,value_text")
    .eq("board_id", NOV_BOARD)
    .is("value", null)
    .eq("value_text", "null");
  if (findErr) { console.error("Find error:", findErr.message); return; }

  console.log(`  Found ${cells?.length ?? 0} cells with value=NULL, value_text='null'`);
  for (const c of cells || []) {
    console.log(`    record=${c.record_id} col=${c.column_id}`);
  }

  // STEP 2: Set value_text to NULL for these cells
  console.log("=== STEP 2: Clear value_text to NULL ===");
  if (cells && cells.length > 0) {
    // Group by record_id for batched updates
    const uniqueRecords = [...new Set(cells.map(c => c.record_id))];
    for (const recordId of uniqueRecords) {
      const recordCells = cells.filter(c => c.record_id === recordId);
      const columnIds = recordCells.map(c => c.column_id);
      const { error } = await db.from("cell_values")
        .update({ value_text: null })
        .eq("board_id", NOV_BOARD)
        .is("value", null)
        .eq("value_text", "null")
        .in("record_id", [recordId])
        .in("column_id", columnIds);
      if (error) { console.error(`  Update error for record ${recordId}:`, error.message); continue; }
      console.log(`  Cleared ${columnIds.length} cells for record ${recordId}`);
    }
  }

  // STEP 3: Verify
  console.log("=== STEP 3: Verify ===");
  const { data: after } = await db.from("cell_values")
    .select("record_id,column_id,value,value_text")
    .eq("board_id", NOV_BOARD)
    .is("value", null)
    .eq("value_text", "null");
  console.log(`  Remaining cells with value=NULL, value_text='null': ${after?.length ?? 0}`);

  // Show Comment column values
  console.log("  Comment column (f9ffd521) values:");
  const { data: comments } = await db.from("cell_values")
    .select("record_id,value,value_text")
    .eq("board_id", NOV_BOARD)
    .eq("column_id", "f9ffd521-f449-40c4-afe1-715e96ae30d8");
  for (const c of comments || []) console.log(`    record=${c.record_id} value=${JSON.stringify(c.value)} value_text="${c.value_text}"`);
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });