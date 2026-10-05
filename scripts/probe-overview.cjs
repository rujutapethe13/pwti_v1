const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(f) {
  const c = fs.readFileSync(f, "utf8");
  const e = {};
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    e[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return e;
}

const env = loadEnvFile(path.join(process.cwd(), ".env.local"));
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const q = async (t) => {
    const r = await s.from(t).select("*", { count: "exact", head: true });
    console.log(t, r.error ? "ERR:" + r.error.message : r.count);
  };
  await q("audit_log");
  await q("teams");
  await q("team_members");
  await q("departments");
  await q("activity_logs");
  await q("records");
  await q("cell_values");
  await q("columns");
  await q("boards");
  await q("views");

  const { data: recs, error: recErr } = await s.from("records").select("id,status,board_id,created_at,updated_at").order("created_at", { ascending: false }).limit(5);
  console.log("latest records:", recErr ? recErr.message : JSON.stringify(recs));

  const { data: al, error: alErr } = await s.from("audit_log").select("*").order("created_at", { ascending: false }).limit(5);
  console.log("latest audit_log:", alErr ? alErr.message : JSON.stringify(al));

  const { data: tm, error: tmErr } = await s.from("teams").select("*").limit(5);
  console.log("teams sample:", tmErr ? tmErr.message : JSON.stringify(tm));

  const { data: cols, error: colsErr } = await s.from("columns").select("id,label,type,key").limit(20);
  console.log("columns sample:", colsErr ? colsErr.message : JSON.stringify(cols));

  const { data: recStatus, error: rsErr } = await s.from("records").select("status");
  if (rsErr) { console.log("status err:", rsErr.message); }
  else {
    const counts = {};
    for (const r of recStatus) { counts[r.status] = (counts[r.status] || 0) + 1; }
    console.log("record statuses:", JSON.stringify(counts));
  }

  const { data: boards, error: boardsErr } = await s.from("boards").select("id,name,workspace_id,organization_id,status").limit(20);
  console.log("boards sample:", boardsErr ? boardsErr.message : JSON.stringify(boards));
})();