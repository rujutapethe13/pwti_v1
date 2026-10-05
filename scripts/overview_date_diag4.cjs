/**
 * Stage 4: prove the exact "ON CONFLICT DO UPDATE command cannot affect row a
 * second time" source, and check which column the job_date mapping resolves to.
 *
 * Two candidate fan-outs in refresh_client_360_snapshot():
 *   (1) the client_360_status_mappings INSERT ... ON CONFLICT, whose SELECT emits
 *       one row PER CELL — so two records sharing a status label on the same board
 *       propose the same (organization_id, board_id, raw_status_value) twice.
 *   (2) the snapshot INSERT, whose ON CONFLICT key is record_id.
 *
 * Read-only. Run: node scripts/overview_date_diag4.cjs
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

const line = (s = "") => console.log(s);
const head = (s) => { line(); line("=".repeat(76)); line(s); line("=".repeat(76)); };
const kv = (k, v) => line(`  ${String(k).padEnd(38)} ${v}`);

async function main() {
  const { data: boards } = await db
    .from("boards").select("id,name,organization_id,workspace_id").order("created_at");
  const mainBoard = boards.find((b) => b.name === "Main") ?? boards[0];

  head(`A. COLUMN DETECTION ON BOARD "${mainBoard.name}" (${mainBoard.id})`);
  const { data: cols } = await db
    .from("columns").select("id,label,type,sort_order,key")
    .eq("board_id", mainBoard.id).order("sort_order");

  const JOB_DATE_EXCLUDES = ["due","delivery","delivered","deadline","upload","estimated","completed","complete date","completion","finished","closure","closed"];
  const JOB_DATE_HINTS = ["received","inward","job date","created","date"];
  const jobDateCands = cols
    .filter((c) => ["date","timeline"].includes(c.type))
    .filter((c) => !JOB_DATE_EXCLUDES.some((x) => c.label.toLowerCase().includes(x)))
    .filter((c) => JOB_DATE_HINTS.some((x) => c.label.toLowerCase().includes(x)))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const chosen = jobDateCands[0];
  line("  job_date candidates (detection order = sort_order, id):");
  for (const c of jobDateCands) {
    line(`    sort_order=${c.sort_order}  "${c.label}" (${c.type})${c.id === chosen.id ? "   <== MAPPED as job_date" : ""}`);
  }

  const statusCands = cols.filter(
    (c) => c.type === "status" || c.label.toLowerCase().includes("status"),
  );
  line();
  line("  status candidates:");
  for (const c of statusCands) line(`    sort_order=${c.sort_order}  "${c.label}" (${c.type})`);

  // ── THE FAN-OUT PROOF ───────────────────────────────────────────────────
  head("B. PROOF: the status INSERT emits duplicate ON CONFLICT keys");
  const statusCol = statusCands.sort((a, b) => a.sort_order - b.sort_order)[0];
  kv("status column used", `"${statusCol.label}"`);

  const seen = new Map();
  let scanned = 0;
  for (let page = 0; page < 40; page++) {
    const { data: batch } = await db
      .from("cell_values")
      .select("record_id,value,value_text")
      .eq("column_id", statusCol.id)
      .range(page * 1000, page * 1000 + 999);
    if (!batch || batch.length === 0) break;
    for (const cv of batch) {
      scanned++;
      if (cv.value === null) continue;
      // _client_360_cell_to_text resolves dropdown option ids to labels
      seen.set(cv.value, (seen.get(cv.value) ?? 0) + 1);
    }
    if (batch.length < 1000) break;
  }
  kv("status cells with a value", scanned);
  kv("DISTINCT raw status values", seen.size);
  const dupGroups = [...seen.entries()].filter(([, n]) => n > 1);
  line();
  line("  raw value -> cell count (each >1 is a duplicate conflict key):");
  for (const [v, n] of [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    line(`    ${String(v).padEnd(26)} x${n}${n > 1 ? "   <== DUPLICATE" : ""}`);
  }
  line();
  kv("duplicate (org,board,raw_value) groups", dupGroups.length);
  kv("total rows the INSERT proposes", scanned);
  kv("rows the unique constraint allows", seen.size);
  line();
  line("  => ON CONFLICT (organization_id, board_id, raw_status_value) DO UPDATE");
  line(`     is handed ${scanned} rows for ${seen.size} distinct keys.`);
  line(`     Postgres aborts the whole statement: "ON CONFLICT DO UPDATE command`);
  line(`     cannot affect row a second time".`);

  // ── Is the mapped job_date column actually populated? ───────────────────
  head("C. IS THE MAPPED job_date COLUMN POPULATED?");
  for (const c of jobDateCands) {
    let total = 0, nonEmpty = 0;
    const samples = new Set();
    for (let page = 0; page < 40; page++) {
      const { data: batch } = await db
        .from("cell_values").select("value,value_text")
        .eq("column_id", c.id).range(page * 1000, page * 1000 + 999);
      if (!batch || batch.length === 0) break;
      for (const cv of batch) {
        total++;
        const v = cv.value === null ? String(cv.value_text ?? "") : String(cv.value);
        if (v.trim() !== "" && v.trim() !== "null") {
          nonEmpty++;
          if (samples.size < 5) samples.add(v);
        }
      }
      if (batch.length < 1000) break;
    }
    const pct = total ? Math.round((nonEmpty / total) * 100) : 0;
    line(`  "${c.label}" (${c.type}) cells=${total} non-empty=${nonEmpty} (${pct}%)${c.id === chosen.id ? "  <== mapped" : ""}`);
    line(`      e.g. ${JSON.stringify([...samples])}`);
  }

  // ── Records present on the board vs snapshot ────────────────────────────
  head("D. IMPACT");
  const { count: recCount } = await db
    .from("records").select("*", { count: "exact", head: true }).eq("board_id", mainBoard.id);
  const { count: snapForBoard } = await db
    .from("client_360_daily_snapshot").select("*", { count: "exact", head: true })
    .eq("board_id", mainBoard.id);
  kv("records on this board", recCount);
  kv("snapshot rows for this board", snapForBoard);
  line("  => the Overview reads client_360_daily_snapshot, so it shows 0 for this");
  line("     board even though the board table itself is full.");

  line();
  line("Stage 4 complete.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
