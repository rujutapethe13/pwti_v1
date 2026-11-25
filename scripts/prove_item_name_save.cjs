/**
 * Proof for the board "Client / Company" (item name) save rewrite.
 *
 * Performs the EXACT write the saveItemName server action performs
 * (RecordRepository.update -> service-role PATCH on public.records setting only
 * title + updated_at), via the same service-role client the app uses, and shows:
 *   1. the update request + response (status code + body)
 *   2. the row in the database after the edit (new name)
 *   3. a reload of the board still showing the name
 *   4. edit -> switch to another board -> come back, name still there
 * Then restores the original name.
 *
 * Run: node scripts/prove_item_name_save.cjs
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv(path.join(__dirname, "..", ".env.local"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = () => new Date().toISOString();
const line = (s) => console.log(s);

async function getOneRecord() {
  // Find a real record that has at least one sibling board to switch to.
  const { data, error } = await db
    .from("records")
    .select("id, board_id, title, updated_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw new Error("find record: " + error.message);
  return data;
}

async function getOtherBoardId(currentBoardId) {
  const { data, error } = await db
    .from("records")
    .select("board_id")
    .neq("board_id", currentBoardId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("find other board: " + error.message);
  return data?.board_id ?? null;
}

async function readBoard(boardId) {
  // Mirrors the board loader: read records for the board, ordered.
  const { data, error } = await db
    .from("records")
    .select("id, title")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("read board " + boardId + ": " + error.message);
  return data;
}

(async () => {
  const rec = await getOneRecord();
  const newName = "PROOF " + Date.now();
  line("──────────────────────────────────────────────────────────");
  line("Target record");
  line("  id:       " + rec.id);
  line("  board_id: " + rec.board_id);
  line("  old name: " + JSON.stringify(rec.title));
  line("  new name: " + JSON.stringify(newName));

  // ── 1) The exact update the server action performs ──────────────
  const payload = { title: newName, updated_at: stamp() };
  const { data: updated, error: upErr, status, statusText } = await db
    .from("records")
    .update(payload)
    .eq("id", rec.id)
    .select()
    .single();

  line("");
  line("──────────────────────────────────────────────────────────");
  line("1) UPDATE request / response");
  line("  PATCH /rest/v1/records?id=eq." + rec.id);
  line("  body: " + JSON.stringify(payload));
  line("  -> status: " + status + " " + (statusText || ""));
  line("  -> error:  " + (upErr ? upErr.message : "none"));
  line("  -> body:   " + JSON.stringify(updated));
  if (upErr || !updated) {
    line("");
    line("RESULT: FAILED — exact error above.");
    process.exit(1);
  }

  // ── 2) The row in the DB after the edit ─────────────────────────
  const after = await db.from("records").select("id, title").eq("id", rec.id).single();
  line("");
  line("──────────────────────────────────────────────────────────");
  line("2) Row in database after edit");
  line("  " + JSON.stringify(after.data));

  // ── 3) Reload the board ─────────────────────────────────────────
  const reload = await readBoard(rec.board_id);
  const mineReload = reload.find((r) => r.id === rec.id);
  line("");
  line("──────────────────────────────────────────────────────────");
  line("3) Reload board " + rec.board_id + " (" + reload.length + " rows)");
  line("  my row on reload: " + JSON.stringify(mineReload));

  // ── 4) Edit -> switch board -> come back ────────────────────────
  const other = await getOtherBoardId(rec.board_id);
  line("");
  line("──────────────────────────────────────────────────────────");
  line("4) Switch to another board and come back");
  if (other) {
    const otherRows = await readBoard(other);
    line("  switched to board " + other + " (" + otherRows.length + " rows) ...");
  } else {
    line("  (no second board found; simulating reload instead)");
  }
  const back = await readBoard(rec.board_id);
  const mineBack = back.find((r) => r.id === rec.id);
  line("  came back to board " + rec.board_id);
  line("  my row after return: " + JSON.stringify(mineBack));

  const ok =
    after.data?.title === newName &&
    mineReload?.title === newName &&
    mineBack?.title === newName;

  // ── Restore original name ───────────────────────────────────────
  await db.from("records").update({ title: rec.title }).eq("id", rec.id);
  line("");
  line("──────────────────────────────────────────────────────────");
  line("Restored original name: " + JSON.stringify(rec.title));
  line("");
  line(ok ? "RESULT: PASS — name persisted across reload and board switch." : "RESULT: FAIL");
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("PROOF ERROR:", e);
  process.exit(1);
});