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

const PRIMARY_COL = "2a6e3033-95ee-4d61-bb42-fe952bfeae98";
const RECORD_IDS = [
  "4ea4fb70-0f05-4f7c-9f36-c642298b7621",
  "832a020b-8048-42aa-9e9b-681bbefd773b",
  "1dc1c97a-3193-42eb-a848-1aa9398b2503",
  "6cf12121-e327-47a1-9898-d194a6af22b5",
];

async function main() {
  // STEP 1: Reset corrupted titles back to "Untitled"
  console.log("=== STEP 1: Reset corrupted titles ===");
  for (const id of RECORD_IDS) {
    const { error } = await db.from("records").update({ title: "Untitled" }).eq("id", id);
    if (error) { console.error(`  Reset error for ${id}:`, error.message); return; }
  }
  console.log("  Reset OK");

  // STEP 2: Fetch cell values for primary column
  console.log("=== STEP 2: Fetch primary column cell values ===");
  const { data: cells, error: cellErr } = await db.from("cell_values")
    .select("record_id,value")
    .in("record_id", RECORD_IDS)
    .eq("column_id", PRIMARY_COL);
  if (cellErr) { console.error("Cell fetch error:", cellErr.message); return; }

  const cellMap = {};
  for (const c of cells || []) {
    cellMap[c.record_id] = c.value;
  }
  for (const id of RECORD_IDS) console.log(`  ${id} -> cell value = ${JSON.stringify(cellMap[id])}`);

  // STEP 3: Backfill titles from cell values (only where cell has a real value)
  console.log("=== STEP 3: Backfill titles ===");
  for (const id of RECORD_IDS) {
    const cellVal = cellMap[id];
    if (cellVal === null || cellVal === undefined || cellVal === "") {
      console.log(`  ${id}: no cell value, leaving title as "Untitled"`);
      continue;
    }
    const { error } = await db.from("records").update({ title: cellVal }).eq("id", id);
    if (error) { console.error(`  Update error for ${id}:`, error.message); continue; }
    console.log(`  ${id}: title set to "${cellVal}"`);
  }

  // STEP 4: Verify
  console.log("=== STEP 4: Verify ===");
  const { data: after } = await db.from("records")
    .select("id,title")
    .in("id", RECORD_IDS);
  for (const r of after || []) console.log(`  ${r.id} title="${r.title}"`);
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });