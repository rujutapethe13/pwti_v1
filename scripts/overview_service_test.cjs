/**
 * Call Overview RPCs directly with service_role key, mimicking the app.
 * Run: node scripts\overview_service_test.cjs
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
const head = (s) => { line(); line("=".repeat(70)); line(s); line("=".repeat(70)); };
const kv = (k, v) => line(`  ${String(k).padEnd(30)} ${v}`);

function toKey(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function allTimeRange() {
  // "All time" resolves to sentinel 1900-01-01 .. today, then narrowed by data bounds
  const to = new Date();
  return { id: "all", label: "All time", from: "1900-01-01", to: toKey(to), days: 36500 };
}

function narrowAllTime(bounds) {
  if (!bounds.earliest) return allTimeRange();
  const to = bounds.latest || allTimeRange().to;
  return { id: "all", label: "All time", from: bounds.earliest, to, days: Math.round((new Date(to + "T00:00:00") - new Date(bounds.earliest + "T00:00:00")) / 86400000) + 1 };
}

async function main() {
  // Find the org with records
  const { data: boards } = await db.from("boards").select("id,name,organization_id,workspace_id").eq("status", "active").order("created_at");
  const orgId = boards?.[0]?.organization_id;
  head("ORGANIZATION: " + orgId);
  for (const b of boards ?? []) line(`  board: ${b.id} "${b.name}" ws=${b.workspace_id}`);

  // Data bounds
  const { data: boundsData } = await db.rpc("overview_data_bounds", {
    p_organization_id: orgId,
    p_workspace_ids: null,
  });
  console.log("Data bounds:", JSON.stringify(boundsData));
  const bounds = { earliest: boundsData?.earliest ?? null, latest: boundsData?.latest ?? null };
  const window = narrowAllTime(bounds);
  console.log("Narrowed window:", JSON.stringify(window));

  // ── overview_period_stats ──
  head("overview_period_stats (stat cards)");
  const prior = {
    from: toKey(new Date(new Date(window.from + "T00:00:00").getDate() - window.days)),
    to: toKey(new Date(new Date(window.to + "T00:00:00").getDate() - 1)),
  };
  console.log("Prior window:", JSON.stringify(prior));
  const { data: statsData, error: statsError } = await db.rpc("overview_period_stats", {
    p_organization_id: orgId,
    p_workspace_ids: null,
    p_from: window.from,
    p_to: window.to,
    p_prior_from: prior.from,
    p_prior_to: prior.to,
  });
  if (statsError) {
    line("  ERROR:", statsError.message);
  } else {
    line(JSON.stringify(statsData, null, 2));
  }

  // ── overview_volume_trend ──
  head("overview_volume_trend (volume chart)");
  const granularity = window.days <= 31 ? "day" : window.days <= 120 ? "week" : "month";
  console.log("granularity:", granularity);
  const { data: trendData, error: trendError } = await db.rpc("overview_volume_trend", {
    p_organization_id: orgId,
    p_workspace_ids: null,
    p_from: window.from,
    p_to: window.to,
    p_granularity: granularity,
  });
  if (trendError) {
    line("  ERROR:", trendError.message);
  } else {
    line(JSON.stringify(trendData, null, 2));
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });