// Debug: inspect the actual API response shape
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

(async () => {
  const usersRes = await fetch(`${url}/auth/v1/admin/users`, {
    headers: {
      "apikey": svcKey,
      "Authorization": `Bearer ${svcKey}`,
    },
  });
  
  const raw = await usersRes.text();
  console.log("Status:", usersRes.status);
  console.log("Raw response:", raw.substring(0, 500));
  
  try {
    const parsed = JSON.parse(raw);
    console.log("\nParsed type:", typeof parsed);
    console.log("Parsed keys:", Object.keys(parsed));
    if (Array.isArray(parsed)) {
      console.log("Is array, length:", parsed.length);
    } else if (parsed.users) {
      console.log("Has .users, type:", typeof parsed.users, Array.isArray(parsed.users));
    }
  } catch(e) {
    console.log("JSON parse error:", e.message);
  }
})();