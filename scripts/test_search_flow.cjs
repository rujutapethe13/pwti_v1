const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function normalizeText(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/['’`"“”\s_\-\/\\()]/g, "");
}

function isTextMatch(target, query) {
  if (!target || !query) return false;
  const tStr = String(target).toLowerCase();
  const qStr = query.toLowerCase().trim();
  if (tStr.includes(qStr)) return true;
  const tNorm = normalizeText(tStr);
  const qNorm = normalizeText(qStr);
  if (qNorm.length > 0 && tNorm.includes(qNorm)) return true;
  return false;
}

async function run() {
  const query = "levis";
  const qClean = query.trim().toLowerCase();
  const variations = [
    qClean,
    qClean.replace(/s$/, "'s"),
    qClean.replace(/'s$/, "s"),
    qClean.replace(/['’]/g, ""),
  ];
  const uniqueVars = [...new Set(variations)];

  // 1. Matched cells
  const orConditions = uniqueVars.map(v => `value_text.ilike.%${v}%`).join(",");
  const { data: matchedCells } = await supabase
    .from("cell_values")
    .select("record_id, board_id, column_id, value, value_text")
    .or(orConditions)
    .limit(5000);

  // 2. Matched records by title
  const titleOr = uniqueVars.map(v => `title.ilike.%${v}%`).join(",");
  const { data: matchedRecs } = await supabase
    .from("records")
    .select("id, board_id, title, status, group_id, created_at, updated_at")
    .or(titleOr)
    .neq("status", "archived")
    .limit(1000);

  const matchedRecordIds = new Set();
  (matchedCells || []).forEach(c => matchedRecordIds.add(c.record_id));
  (matchedRecs || []).forEach(r => matchedRecordIds.add(r.id));

  console.log("Matched record IDs count:", matchedRecordIds.size);

  // 3. Fetch records
  const recIdArr = Array.from(matchedRecordIds);
  const { data: records } = await supabase
    .from("records")
    .select("*")
    .in("id", recIdArr)
    .neq("status", "archived");

  console.log("Records found:", records?.length);

  // 4. Fetch boards
  const boardIds = [...new Set(records.map(r => r.board_id))];
  const { data: boards } = await supabase
    .from("boards")
    .select("id, name, slug, workspace_id, status")
    .in("id", boardIds);

  console.log("Boards count:", boards?.length);

  // 5. Fetch workspaces
  const wsIds = [...new Set(boards.map(b => b.workspace_id))];
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .in("id", wsIds);

  console.log("Workspaces count:", workspaces?.length, workspaces?.map(w => w.name));

  // 6. Fetch columns for these boards
  const { data: columns } = await supabase
    .from("columns")
    .select("*")
    .in("board_id", boardIds)
    .is("group_id", null);

  console.log("Columns count:", columns?.length);
}

run();
