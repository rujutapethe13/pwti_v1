/**
 * DRY-RUN BY DEFAULT. Repairs cells orphaned by a re-import that regenerated
 * option ids.
 *
 * Background: importing the same file twice used to mint fresh
 * `opt-<Date.now()>-<n>` ids. The column's options array was replaced with the
 * new ids while pre-existing cells kept the old ones, so those cells became
 * orphans and rendered as raw ids / "Unknown option".
 *
 * Because the options array was overwritten, the old id -> label mapping is
 * gone from the database. The numeric suffix, however, is stable across the
 * two generations (the generator emitted 0,2,4,... in label order), so a
 * suffix-keyed remap reconstructs the link. Every remap is verified against
 * the ORIGINAL labels captured before the re-import (see OLD_LABELS) so a
 * silent mislabel is impossible.
 *
 * Usage:
 *   node scripts/repair_orphan_options.cjs            # dry run, prints plan
 *   node scripts/repair_orphan_options.cjs --apply    # performs the writes
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

const BOARD_ID = "board-1790842747288-9pp0635";
const COLUMN_ID = "col-1790842747289-blns9gj";
const APPLY = process.argv.includes("--apply");

// Labels of the PREVIOUS option generation, read from the live board before
// the re-import. Used only to verify a suffix remap lands on the right label.
const OLD_LABELS = {
  "0": "Apperals",
  "2": "Laptop Bag Selling Bag",
  "4": "Light",
  "6": "Flatlay",
  "8": "Trolley",
  "10": "Chair",
  "12": "Gifting",
  "14": "Towell",
  "16": "Bottle",
  "18": "Bag",
  "20": "Quailt/Blanket",
  "22": "Product",
  "24": "Resize",
  "26": "Trolley Bag",
  "28": "Socks",
  "30": "Duffle bag",
  "32": "Globle Resize",
  "34": "Lipstick",
  "36": "Jwellery",
  "38": "Curtain",
  "40": "Footwear",
  "42": "Backpack",
};

const suffixOf = (id) => {
  const m = String(id).match(/-(\d+)$/);
  return m ? m[1] : null;
};

const line = (s = "") => console.log(s);

async function main() {
  const { data: col } = await db
    .from("columns")
    .select("id,label,settings")
    .eq("id", COLUMN_ID)
    .single();

  const options = (col.settings?.options ?? []).map((o) => ({
    id: String(o.id),
    label: String(o.label ?? ""),
  }));
  const byId = new Map(options.map((o) => [o.id, o]));
  const bySuffix = new Map(options.map((o) => [suffixOf(o.id), o]));

  const { data: cells } = await db
    .from("cell_values")
    .select("id,record_id,value,value_text,version")
    .eq("column_id", COLUMN_ID);

  const plan = [];
  const skipped = [];
  for (const c of cells ?? []) {
    const v = typeof c.value === "string" ? c.value : null;
    if (!v || !/^opt[-_]/i.test(v)) continue;
    if (byId.has(v)) continue;

    const sfx = suffixOf(v);
    const target = sfx ? bySuffix.get(sfx) : undefined;
    if (!target) {
      skipped.push({ cell: c, reason: `no option with suffix "${sfx}"` });
      continue;
    }
    const expected = OLD_LABELS[sfx];
    if (expected && target.label !== expected) {
      skipped.push({
        cell: c,
        reason: `label mismatch: suffix ${sfx} is now "${target.label}", expected "${expected}"`,
      });
      continue;
    }
    plan.push({ cell: c, from: v, to: target.id, label: target.label });
  }

  line(`Column      : "${col.label}" (${COLUMN_ID})`);
  line(`options     : ${options.length}`);
  line(`cells       : ${(cells ?? []).length}`);
  line(`orphans     : ${plan.length + skipped.length}`);
  line(`remappable  : ${plan.length}`);
  line(`skipped     : ${skipped.length}`);
  line(`mode        : ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);

  line();
  line("Remap plan (suffix-keyed, label-verified):");
  const agg = new Map();
  for (const p of plan) {
    const k = `${p.from} -> ${p.to}`;
    agg.set(k, (agg.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...agg.entries()].sort()) {
    const sample = plan.find((p) => `${p.from} -> ${p.to}` === k);
    line(`  ${String(n).padStart(3)}x  ${k.padEnd(46)} = "${sample.label}"`);
  }

  if (skipped.length) {
    line();
    line("SKIPPED (not touched):");
    for (const s of skipped) line(`  ${s.cell.id}: ${s.reason}`);
  }

  if (!APPLY) {
    line();
    line("Dry run complete. Re-run with --apply to perform these updates.");
    return;
  }

  if (plan.length === 0) {
    line();
    line("Nothing to do.");
    return;
  }

  line();
  line(`Applying ${plan.length} updates...`);
  let ok = 0;
  const failures = [];
  for (const p of plan) {
    const { error } = await db
      .from("cell_values")
      .update({ value: p.to, value_text: p.to, updated_at: new Date().toISOString() })
      .eq("id", p.cell.id);
    if (error) failures.push({ id: p.cell.id, error: error.message });
    else ok += 1;
  }
  line(`  updated : ${ok}`);
  line(`  failed  : ${failures.length}`);
  for (const f of failures) line(`    ${f.id}: ${f.error}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
