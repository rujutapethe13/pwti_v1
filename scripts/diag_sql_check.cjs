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
  // Check the actual jsonb value of the Comment cell - is it SQL null or jsonb 'null'?
  head("Raw Comment cell value inspection");
  const { data: cells } = await db.from("cell_values")
    .select("record_id,column_id,value,value_text,value_json")
    .eq("column_id", "f9ffd521-f449-40c4-afe1-715e96ae30d8");
  for (const c of cells || []) {
    line(`  record=${c.record_id}`);
    line(`    value (raw) = ${JSON.stringify(c.value)}  (type: ${typeof c.value})`);
    line(`    value_text = "${c.value_text}"`);
    line(`    value_json = ${JSON.stringify(c.value_json)}`);
  }

  // SQL-level check: is value jsonb 'null' or SQL NULL?
  head("SQL-level value distinction (via RPC-style query)");
  const { data: sqlCheck } = await db.rpc("exec_sql", {
    sql: `
      SELECT record_id,
             value IS NULL AS sql_null,
             value = 'null'::jsonb AS jsonb_null,
             value::text AS value_as_text,
             value_text
      FROM public.cell_values
      WHERE column_id = 'f9ffd521-f449-40c4-afe1-715e96ae30d8'
      LIMIT 10
    `
  }).maybeSingle();
  line("RPC result:", JSON.stringify(sqlCheck));

  // Try a direct query with explicit casting
  const { data: rows, error } = await db.from("cell_values")
    .select("record_id,value,value_text")
    .eq("column_id", "f9ffd521-f449-40c4-afe1-715e96ae30d8");
  if (error) line("query error:", error.message);
  for (const r of rows || []) {
    line(`  record=${r.record_id} value=${JSON.stringify(r.value)} value_text="${r.value_text}"`);
  }

  // Check if there's a trigger or function syncing title from primary cell
  head("Triggers on cell_values");
  const { data: triggers } = await db.rpc("exec_sql", {
    sql: `
      SELECT tgname, tgtype, tgenabled
      FROM pg_trigger
      WHERE tgrelid = 'public.cell_values'::regclass
        AND NOT tgisinternal
    `
  });
  line("triggers:", JSON.stringify(triggers));

  // Check triggers on records
  head("Triggers on records");
  const { data: rtrig } = await db.rpc("exec_sql", {
    sql: `
      SELECT tgname, tgtype, tgenabled
      FROM pg_trigger
      WHERE tgrelid = 'public.records'::regclass
        AND NOT tgisinternal
    `
  });
  line("triggers:", JSON.stringify(rtrig));
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });