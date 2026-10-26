/**
 * Sign in via Supabase auth, then call Overview API endpoints with the session.
 * Run: node scripts\overview_api_test.cjs
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

async function main() {
  // Sign in to get a session
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: env.DEV_AUTO_LOGIN_EMAIL,
    password: env.DEV_AUTO_LOGIN_PASSWORD,
  });

  if (authError) {
    console.error("Sign-in failed:", authError.message);
    process.exit(1);
  }
  console.log("Signed in as:", authData.user?.email);

  const session = authData.session;
  const accessToken = session?.access_token;
  if (!accessToken) {
    console.error("No access token");
    process.exit(1);
  }

  // Call all three Overview endpoints for each range
  const endpoints = [
    { name: "overview (main)", url: "/api/overview" },
    { name: "overview/stats", url: "/api/overview/stats" },
    { name: "overview/volume-trend", url: "/api/overview/volume-trend" },
  ];

  for (const range of ["all", "1y", "7d", "30d", "today"]) {
    console.log(`\n${"#".repeat(70)}`);
    console.log(`# RANGE = ${range}`);
    console.log(`${"#".repeat(70)}`);

    for (const ep of endpoints) {
      console.log(`\n--- ${ep.name} ---`);
      try {
        const res = await fetch(`http://localhost:3000${ep.url}?range=${range}&from=2026-01-01&to=2026-12-31`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        const text = await res.text();
        console.log(`Status: ${res.status}`);
        try {
          console.log(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          console.log(text);
        }
      } catch (e) {
        console.error("Request failed:", e.message);
      }
    }
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });