const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
if (!m) { console.log("MISSING"); process.exit(); }
const key = m[1].trim().replace(/^["']|["']$/g, "");
const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
console.log("role in key:", payload.role);