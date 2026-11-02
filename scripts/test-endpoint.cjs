// Test the upload endpoint via HTTP with the running dev server
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
const appUrl = "http://localhost:3001";

(async () => {
  // Test 1: No auth - should get 401
  console.log("=== Test 1: No auth ===");
  const pngData = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  
  const noAuthRes = await fetch(`${appUrl}/api/attachments/upload`, {
    method: "POST",
    body: (() => {
      const fd = new FormData();
      fd.append("file", new Blob([pngData], { type: "image/png" }), "test.png");
      return fd;
    })(),
  });
  console.log("Status:", noAuthRes.status);
  console.log("Body:", await noAuthRes.text());

  // Test 2: Invalid file type - should get 400
  console.log("\n=== Test 2: Invalid file type ===");
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  
  const { data: usersData } = await db.auth.admin.listUsers();
  const userList = usersData.users || usersData;
  const testUser = userList[0];

  // Create a session cookie using service role JWT
  const sessionJson = JSON.stringify({
    access_token: "invalid-token",
    refresh_token: "invalid",
    provider: "email",
    user: { id: testUser.id, email: testUser.email },
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    token_type: "bearer",
  });
  const cookieValue = "base64-" + Buffer.from(sessionJson).toString("base64url");
  const projectRef = env.NEXT_PUBLIC_SUPABASE_URL.match(/https?:\/\/([^.]+)/)?.[1] || "unknown";
  const cookieName = `sb-${projectRef}-auth-token`;

  const badFileRes = await fetch(`${appUrl}/api/attachments/upload`, {
    method: "POST",
    headers: { "Cookie": `${cookieName}=${cookieValue}` },
    body: (() => {
      const fd = new FormData();
      fd.append("file", new Blob(["hello"], { type: "text/html" }), "test.html");
      return fd;
    })(),
  });
  console.log("Status:", badFileRes.status);
  console.log("Body:", await badFileRes.text());

  console.log("\n=== All endpoint tests complete ===");
})();