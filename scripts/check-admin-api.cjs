// Try to find the correct admin session creation endpoint for GoTrue v2.197.0
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
  // Try various admin endpoints for session creation
  const attempts = [
    { method: "POST", path: "/auth/v1/admin/createSession", body: { user_id: "test" } },
    { method: "POST", path: "/auth/v1/admin/session", body: { user_id: "test" } },
    { method: "POST", path: "/auth/v1/admin/tokens", body: { user_id: "test" } },
    { method: "POST", path: "/auth/v1/admin/generateJWT", body: { uid: "test" } },
    { method: "POST", path: "/auth/v1/token", body: { grant_type: "password", email: "test", password: "test" } },
    { method: "GET", path: "/auth/v1/admin/users", body: {} },
  ];

  for (const { method, path: endpointPath, body } of attempts) {
    const options = {
      method,
      headers: {
        "apikey": svcKey,
        "Authorization": `Bearer ${svcKey}`,
        "Content-Type": "application/json",
      },
    };
    if (method === "POST") options.body = JSON.stringify(body);
    
    const res = await fetch(`${url}${endpointPath}`, options);
    const text = await res.text();
    console.log(`${method} ${endpointPath}: ${res.status} - ${text.substring(0, 150)}`);
  }
})();