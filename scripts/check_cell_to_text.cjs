/**
 * Check what _client_360_cell_to_text looks like in the live DB.
 * Run: node scripts/check_cell_to_text.cjs
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

async function main() {
  // Try calling refresh and capture the actual error
  try {
    const { data, error } = await db.rpc("refresh_client_360_snapshot");
    console.log("Refresh result:", JSON.stringify(data));
    console.log("Refresh error:", error?.message);
  } catch (e) {
    console.log("Refresh threw:", e.message);
  }

  // Check snapshot state
  const { count } = await db.from("client_360_daily_snapshot").select("*", { count: "exact", head: true });
  console.log("Snapshot rows:", count);

  // Check field mappings
  const { data: maps } = await db.from("client_360_field_mappings").select("board_id,field_type,resolved_column_ref,source").eq("field_type", "job_date");
  console.log("job_date mappings:", JSON.stringify(maps, null, 2));

  // Check refresh state
  const { data: state } = await db.from("client_360_refresh_state").select("*");
  console.log("Refresh state:", JSON.stringify(state));
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });