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
  // Check automations table
  head("AUTOMATIONS");
  const { data: autos } = await db.from("automations").select("*");
  for (const a of autos || []) {
    line(`  id=${a.id} name="${a.name}" trigger=${a.trigger_type} enabled=${a.enabled}`);
  }

  head("AUTOMATION_ACTIONS");
  const { data: actions } = await db.from("automation_actions").select("*");
  for (const a of actions || []) {
    line(`  id=${a.id} automation=${a.automation_id} type=${a.action_type} config=${JSON.stringify(a.configuration)}`);
  }

  // Check automation_runs for the Nov board
  head("AUTOMATION RUNS (Nov board)");
  const { data: runs } = await db.from("automation_runs")
    .select("*")
    .eq("board_id", "4b0bd58f-ebeb-4f8d-92be-47be50033225")
    .order("created_at", { ascending: true })
    .limit(50);
  for (const r of runs || []) {
    line(`  ${r.created_at} automation=${r.automation_id} record=${r.record_id} status=${r.status}`);
    line(`    details=${JSON.stringify(r.details)}`);
  }

  // Check if there's a create-record automation action
  head("AUTOMATION_ACTIONS with create_record");
  const { data: crActions } = await db.from("automation_actions")
    .select("*")
    .like("action_type", "%create%");
  for (const a of crActions || []) {
    line(`  id=${a.id} automation=${a.automation_id} type=${a.action_type} config=${JSON.stringify(a.configuration)}`);
  }

  // Check triggers table
  head("TRIGGERS");
  const { data: triggers } = await db.from("triggers").select("*").limit(20);
  for (const t of triggers || []) {
    line(`  id=${t.id} name="${t.name}" type=${t.trigger_type} board_id=${t.board_id}`);
  }

  // Check trigger_logs
  head("TRIGGER LOGS (Nov board)");
  const { data: tlogs } = await db.from("trigger_logs")
    .select("*")
    .eq("board_id", "4b0bd58f-ebeb-4f8d-92be-47be50033225")
    .order("created_at", { ascending: true })
    .limit(30);
  for (const l of tlogs || []) {
    line(`  ${l.created_at} trigger=${l.trigger_id} record=${l.record_id} status=${l.status}`);
    line(`    details=${JSON.stringify(l.details)}`);
  }
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });