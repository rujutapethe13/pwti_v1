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
  // status column cell values
  const { data: statusCols } = await s.from("columns").select("id,label,type").eq("type", "status");
  const statusColIds = (statusCols || []).map(c => c.id);
  console.log("status columns:", JSON.stringify(statusCols));

  if (statusColIds.length > 0) {
    const { data: cv, error } = await s.from("cell_values").select("column_id,value").in("column_id", statusColIds);
    if (error) { console.log("cv err:", error.message); }
    else {
      const counts = {};
      for (const r of cv) {
        const v = typeof r.value === "object" && r.value !== null ? (r.value.label || r.value.value || JSON.stringify(r.value)) : r.value;
        counts[v] = (counts[v] || 0) + 1;
      }
      console.log("status value counts:", JSON.stringify(counts));
    }
  }

  // records by month (last 3 months)
  const { data: recs2 } = await s.from("records").select("created_at");
  const monthCounts = {};
  for (const r of recs2 || []) {
    const d = new Date(r.created_at);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
    monthCounts[k] = (monthCounts[k] || 0) + 1;
  }
  console.log("records by month:", JSON.stringify(monthCounts));

  // records last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000);
  const { data: recs7, error: e7 } = await s.from("records").select("created_at").gte("created_at", sevenDaysAgo.toISOString());
  console.log("records last 7 days:", e7 ? e7.message : (recs7 ? recs7.length : 0));

  // user metadata
  const { data: { users } } = await s.auth.admin.listUsers();
  for (const u of users) {
    console.log("user:", u.id, u.email, JSON.stringify(u.user_metadata));
  }

  // workspace members with roles for active workspace
  const { data: wm } = await s.from("workspace_members").select("user_id,workspace_id,roles(name)").eq("workspace_id", "ws-1790151850704-3153b7r");
  console.log("ws members:", JSON.stringify(wm));
})();