/**
 * Trigger a snapshot refresh and print what happens.
 * Run: node scripts/trigger_refresh.cjs
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
  const { data, error } = await db.rpc("refresh_client_360_snapshot");
  if (error) {
    console.error("REFRESH ERROR:", error.message);
    process.exit(1);
  }
  console.log("Refresh result:", JSON.stringify(data));

  // Check snapshot now
  const { count } = await db
    .from("client_360_daily_snapshot")
    .select("*", { count: "exact", head: true });
  console.log("Snapshot rows after refresh:", count);

  const { data: sample } = await db
    .from("client_360_daily_snapshot")
    .select("board_id, job_date, completed_date, volume, status")
    .limit(5);
  console.log("Sample rows:", JSON.stringify(sample, null, 2));
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });