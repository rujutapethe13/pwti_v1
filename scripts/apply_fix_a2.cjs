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

async function main() {
  // STEP 1: Reset the corrupted titles back to "Untitled"
  console.log("=== STEP 1: Reset corrupted titles ===");
  const { error: resetErr } = await db.rpc("exec_sql", {
    sql: `
      UPDATE public.records
      SET title = 'Untitled'
      WHERE id IN (
        '4ea4fb70-0f05-4f7c-9f36-c642298b7621',
        '832a020b-8048-42aa-9e9b-681bbefd773b',
        '1dc1c97a-3193-42eb-a848-1aa9398b2503',
        '6cf12121-e327-47a1-9898-d194a6af22b5'
      );
    `
  });
  if (resetErr) { console.error("RESET ERROR:", resetErr.message); return; }
  console.log("  Reset OK");

  // STEP 2: Backfill titles from cell_values using a proper UPDATE ... FROM
  console.log("=== STEP 2: Backfill titles from cell_values ===");
  const { error: fixErr } = await db.rpc("exec_sql", {
    sql: `
      UPDATE public.records r
      SET title = cv.value
      FROM public.cell_values cv
      WHERE r.id = cv.record_id
        AND cv.column_id = '2a6e3033-95ee-4d61-bb42-fe952bfeae98'
        AND cv.value IS NOT NULL
        AND cv.value != ''
        AND r.id IN (
          '4ea4fb70-0f05-4f7c-9f36-c642298b7621',
          '832a020b-8048-42aa-9e9b-681bbefd773b',
          '1dc1c97a-3193-42eb-a848-1aa9398b2503',
          '6cf12121-e327-47a1-9898-d194a6af22b5'
        );
    `
  });
  if (fixErr) { console.error("FIX ERROR:", fixErr.message); return; }
  console.log("  Backfill OK");

  // STEP 3: Show result
  console.log("=== AFTER ===");
  const { data: after } = await db.from("records")
    .select("id,title")
    .in("id", [
      "4ea4fb70-0f05-4f7c-9f36-c642298b7621",
      "832a020b-8048-42aa-9e9b-681bbefd773b",
      "1dc1c97a-3193-42eb-a848-1aa9398b2503",
      "6cf12121-e327-47a1-9898-d194a6af22b5",
    ]);
  for (const r of after || []) console.log(`  ${r.id} title="${r.title}"`);
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });