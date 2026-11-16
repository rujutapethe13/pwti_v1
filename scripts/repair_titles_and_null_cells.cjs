/**
 * Repair record titles + "null" value_text placeholders.
 *
 * Background: the import pipeline wrote cell_values for the primary
 * (title) column but left records.title blank/"Untitled", so the Table view
 * rendered "Untitled" even though cell_values held the real client name.
 * Empty cells were also serialized as the literal string "null".
 *
 * Usage:
 *   node scripts/repair_titles_and_null_cells.cjs          # dry run
 *   node scripts/repair_titles_and_null_cells.cjs --apply  # write
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");

function loadEnvFile(p) {
  const e = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    e[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return e;
}
const env = loadEnvFile(path.join(__dirname, "..", ".env.local"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEXT_TYPES = new Set(["text", "long_text", "email", "phone", "url"]);
const PLACEHOLDER = new Set(["untitled", "untitled record", "null", "undefined"]);

function isPlaceholderTitle(title) {
  const t = String(title ?? "").trim();
  if (!t) return true;
  return PLACEHOLDER.has(t.toLowerCase()) || /^imported row \d+$/i.test(t);
}
function titleText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    const t = v.trim();
    return /^(null|undefined)$/i.test(t) ? "" : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(titleText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    for (const key of ["label", "name", "title", "text", "value"]) {
      const candidate = v[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

async function fetchAll(table, build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

(async () => {
  console.log(APPLY ? "=== APPLY MODE ===" : "=== DRY RUN (pass --apply to write) ===");

  const boards = await fetchAll("boards", () =>
    db.from("boards").select("id,name,status").eq("status", "active").order("created_at"),
  );
  console.log("active boards:", boards.length);

  let titleFixes = 0;
  let nullCellFixes = 0;
  const titleSamples = [];
  const nullSamples = [];

  for (const board of boards) {
    const columns = await fetchAll("columns", () =>
      db
        .from("columns")
        .select("id,label,type,group_id,sort_order,hidden")
        .eq("board_id", board.id)
        .is("deleted_at", null)
        .order("sort_order"),
    );
    if (!columns.length) continue;

    const records = await fetchAll("records", () =>
      db
        .from("records")
        .select("id,title,group_id")
        .eq("board_id", board.id)
        .eq("status", "active"),
    );
    if (!records.length) continue;

    const recordsNeedingTitle = records.filter((r) => isPlaceholderTitle(r.title));
    let fixedOnBoard = 0;

    if (recordsNeedingTitle.length) {
      // Resolve the primary column per group, mirroring getPrimaryColumn():
      // isPrimary -> first text-compatible -> first column, scoped to the group.
      const groupIds = [...new Set(recordsNeedingTitle.map((r) => r.group_id ?? null))];
      for (const groupId of groupIds) {
        const scoped = groupId
          ? columns.filter((c) => (c.group_id ?? null) === groupId)
          : columns.filter((c) => !c.group_id);
        const pool = scoped.length ? scoped : columns;
        const primary =
          pool.find((c) => c.is_primary) ??
          pool.find((c) => TEXT_TYPES.has(c.type)) ??
          pool[0];
        if (!primary) continue;

        const recs = recordsNeedingTitle.filter((r) => (r.group_id ?? null) === groupId);
        const recIds = recs.map((r) => r.id);
        const cellMap = new Map();
        for (const ids of chunk(recIds, 200)) {
          const { data, error } = await db
            .from("cell_values")
            .select("record_id,value,value_text")
            .in("record_id", ids)
            .eq("column_id", primary.id);
          if (error) throw new Error(`cell_values: ${error.message}`);
          for (const c of data ?? []) {
            const raw = c.value ?? c.value_text;
            cellMap.set(c.record_id, raw);
          }
        }

        for (const rec of recs) {
          const value = cellMap.get(rec.id);
          const next = titleText(value);
          if (!next) continue;
          if (APPLY) {
            const { error } = await db
              .from("records")
              .update({ title: next, updated_at: new Date().toISOString() })
              .eq("id", rec.id);
            if (error) throw new Error(`title update ${rec.id}: ${error.message}`);
          }
          titleFixes += 1;
          fixedOnBoard += 1;
          if (titleSamples.length < 15) {
            titleSamples.push({ board: board.name, record: rec.id, from: rec.title, to: next });
          }
        }
      }
    }

    // Normalize literal "null"/"undefined" value_text on text-like columns.
    const textCols = columns.filter((c) => TEXT_TYPES.has(c.type));
    let nullOnBoard = 0;
    for (const col of textCols) {
      const { data: bad, error } = await db
        .from("cell_values")
        .select("id,record_id,value,value_text")
        .eq("column_id", col.id)
        .filter("value_text", "in", "(null,undefined,NULL,Undefined)");
      if (error) throw new Error(`cell_values scan: ${error.message}`);
      for (const cell of bad ?? []) {
        // Only normalize rows whose typed value is actually empty.
        const markerString =
          typeof cell.value === "string" && /^(null|undefined)$/i.test(cell.value.trim());
        if (cell.value !== null && cell.value !== undefined && !markerString) continue;
        if (APPLY) {
          const { error: upErr } = await db
            .from("cell_values")
            .update({ value_text: "", ...(markerString ? { value: null } : {}) })
            .eq("id", cell.id);
          if (upErr) throw new Error(`cell_values update ${cell.id}: ${upErr.message}`);
        }
        nullCellFixes += 1;
        nullOnBoard += 1;
        if (nullSamples.length < 10) {
          nullSamples.push({ board: board.name, column: col.label, record: cell.record_id });
        }
      }
    }

    if (fixedOnBoard || nullOnBoard) {
      console.log(
        `  ${board.name}: titles=${fixedOnBoard} nullCells=${nullOnBoard} (records=${records.length})`,
      );
    }
  }

  console.log("\nTOTAL title fixes:", titleFixes);
  console.log("TOTAL null cell fixes:", nullCellFixes);
  console.log("title samples:", titleSamples);
  console.log("null samples:", nullSamples);
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");
})().catch((e) => {
  console.error("FAILED", e.message, e.stack);
  process.exit(1);
});