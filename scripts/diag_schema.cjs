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
  // Full Nov board row
  head("NOV BOARD FULL ROW");
  const { data: board } = await db.from("boards").select("*").eq("id", "4b0bd58f-ebeb-4f8d-92be-47be50033225").maybeSingle();
  for (const [k, v] of Object.entries(board || {})) line(`  ${k} = ${JSON.stringify(v)}`);

  // Columns with all fields
  head("NOV COLUMNS (full)");
  const { data: columns } = await db.from("columns").select("*").eq("board_id", "4b0bd58f-ebeb-4f8d-92be-47be50033225").is("deleted_at", null).order("sort_order");
  for (const c of columns || []) {
    line(`  id=${c.id} sort=${c.sort_order} key="${c.key}" label="${c.label}" type=${c.type} is_primary=${c.is_primary} pinned=${c.pinned} group_id=${c.group_id} scope=${c.scope} source_column_id=${c.source_column_id} hidden=${c.hidden}`);
  }

  // Data board columns
  head("DATA BOARD (298f1675) - columns");
  const { data: dcols } = await db.from("columns").select("id,sort_order,key,label,type,is_primary").eq("board_id", "298f1675-f254-49de-8b6c-e6e22c83a0b2").is("deleted_at", null).order("sort_order").limit(15);
  for (const c of dcols || []) line(`  sort=${c.sort_order} key="${c.key}" label="${c.label}" type=${c.type} is_primary=${c.is_primary}`);

  // 60370ba1 board columns
  head("60370ba1 BOARD - columns");
  const { data: b2cols } = await db.from("columns").select("id,sort_order,key,label,type,is_primary").eq("board_id", "60370ba1-f6e6-4a3c-acb4-d9158e32b6e1").is("deleted_at", null).order("sort_order").limit(15);
  for (const c of b2cols || []) line(`  sort=${c.sort_order} key="${c.key}" label="${c.label}" type=${c.type} is_primary=${c.is_primary}`);

  // board_column_layouts
  head("NOV board_column_layouts");
  const { data: bl } = await db.from("board_column_layouts").select("*").eq("board_id", "4b0bd58f-ebeb-4f8d-92be-47be50033225").maybeSingle();
  line(`  ${JSON.stringify(bl)}`);

  // group_column_layouts
  head("NOV group_column_layouts");
  const { data: gl } = await db.from("group_column_layouts").select("*").in("group_id", ["1b0b5fd9-ed00-4380-bc7f-93d327ed605c","a5a71787-fb51-4ca0-abc1-6d6be4300d8f","720817a3-82b4-496b-a237-4a44d7e67cba"]);
  for (const g of gl || []) line(`  group=${g.group_id} mode=${g.mode} column_ids=${JSON.stringify(g.column_ids)}`);

  // Data board groups
  head("DATA BOARD groups");
  const { data: dgs } = await db.from("groups").select("*").eq("board_id", "298f1675-f254-49de-8b6c-e6e22c83a0b2").eq("status","active").order("sort_order").limit(10);
  for (const g of dgs || []) line(`  id=${g.id} name="${g.name}" title_column_label="${g.title_column_label}" column_mode=${g.column_mode}`);

  // Data board: check if Imported row records have client names in cell_values
  head("DATA BOARD: Imported row records - check primary column cell values");
  const { data: drecs } = await db.from("records").select("id,title").ilike("title","Imported row %").eq("board_id","298f1675-f254-49de-8b6c-e6e22c83a0b2").limit(5);
  for (const r of drecs || []) {
    const { data: cells } = await db.from("cell_values").select("column_id,value,value_text").eq("record_id", r.id);
    line(`  record ${r.id} title="${r.title}"`);
    for (const c of cells || []) line(`    col=${c.column_id} value=${JSON.stringify(c.value)} value_text="${c.value_text}"`);
  }
}

main().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });