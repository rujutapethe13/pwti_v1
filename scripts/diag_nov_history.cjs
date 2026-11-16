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
  const boardId = "4b0bd58f-ebeb-4f8d-92be-47be50033225";
  const nameColId = "2a6e3033-95ee-4d61-bb42-fe952bfeae98";
  const commentColId = "f9ffd521-f449-40c4-afe1-715e96ae30d8";

  // 1. cell_changes history for these records
  head("CELL CHANGES HISTORY");
  const { data: changes } = await db.from("cell_changes")
    .select("*")
    .in("item_id", [
      "4ea4fb70-0f05-4f7c-9f36-c642298b7621",
      "832a020b-8048-42aa-9e9b-681bbefd773b",
      "1dc1c97a-3193-42eb-a848-1aa9398b2503",
      "6cf12121-e327-47a1-9898-d194a6af22b5",
    ])
    .order("changed_at", { ascending: true });
  for (const c of changes || []) {
    line(`  item=${c.item_id} col=${c.column_id} at=${c.changed_at} by=${c.changed_by} src=${c.source}`);
    line(`    old=${JSON.stringify(c.old_value)} -> new=${JSON.stringify(c.new_value)}`);
  }

  // 2. activity_logs for this board
  head("ACTIVITY LOGS");
  const { data: logs } = await db.from("activity_logs")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true })
    .limit(100);
  for (const l of logs || []) {
    line(`  ${l.created_at} type=${l.event_type} user=${l.user_id} entity=${l.entity_type}:${l.entity_id}`);
    line(`    payload=${JSON.stringify(l.payload)}`);
  }

  // 3. audit_log for records
  head("AUDIT LOG (records)");
  const { data: audit } = await db.from("audit_log")
    .select("*")
    .eq("entity_type", "records")
    .order("created_at", { ascending: true })
    .limit(100);
  for (const a of audit || []) {
    line(`  ${a.created_at} ${a.action} entity=${a.entity_id} by=${a.user_id}`);
    line(`    payload=${JSON.stringify(a.payload)}`);
  }

  // 4. Check if there's a 4th record's name cell
  head("4TH RECORD NAME CELL");
  const { data: cell4 } = await db.from("cell_values")
    .select("*")
    .eq("record_id", "6cf12121-e327-47a1-9898-d194a6af22b5")
    .eq("column_id", nameColId);
  line(`  ${JSON.stringify(cell4)}`);

  // 5. Full raw record for all 4
  head("FULL RAW RECORDS");
  const { data: recs } = await db.from("records")
    .select("*")
    .in("id", [
      "4ea4fb70-0f05-4f7c-9f36-c642298b7621",
      "832a020b-8048-42aa-9e9b-681bbefd773b",
      "1dc1c97a-3193-42eb-a848-1aa9398b2503",
      "6cf12121-e327-47a1-9898-d194a6af22b5",
    ]);
  for (const r of recs || []) {
    line(`  id=${r.id}`);
    line(`    title="${r.title}"`);
    line(`    name="${r.name}"`);
    line(`    created_at=${r.created_at} updated_at=${r.updated_at}`);
    line(`    last_edited_at=${r.last_edited_at} last_edited_by=${r.last_edited_by}`);
    line(`    assignee_id=${r.assignee_id} due_date=${r.due_date}`);
  }
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });