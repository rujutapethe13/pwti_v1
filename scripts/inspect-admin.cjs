// Inspect what methods are available on the admin API
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

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
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey = env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(url, svcKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// List all admin methods
console.log("Admin methods:", Object.getOwnPropertyNames(db.auth.admin));
console.log("Admin prototype methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(db.auth.admin)));

// Try listUsers
(async () => {
  const result = await db.auth.admin.listUsers();
  console.log("\nlistUsers result type:", typeof result);
  console.log("listUser keys:", Object.keys(result));
  if (result.users) {
    console.log("Users count:", result.users.length);
    for (const u of result.users) {
      console.log("  -", u.email, u.id);
    }
  }
  
  // Try createSession
  console.log("\nTrying createSession...");
  try {
    const testUser = result.users[0];
    const sessionResult = await db.auth.admin.createSession(testUser.id);
    console.log("createSession result:", JSON.stringify(sessionResult, null, 2).substring(0, 500));
  } catch(e) {
    console.log("createSession error:", e.message);
  }
})();