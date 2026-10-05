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
const key = env.SUPABASE_SERVICE_ROLE_KEY;

async function fix() {
  const newUserId = "4a3dd327-ed2a-486f-ae36-3886cebe443c";
  const workspaces = [
    { id: "ws-main", created_by: newUserId },
    { id: "ws-1788763486807-g0w6xvg", created_by: newUserId },
    { id: "ws-1788773404872-q4dlmge", created_by: newUserId },
  ];

  for (const ws of workspaces) {
    const res = await fetch(
      url + "/rest/v1/workspaces?id=eq." + ws.id,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: "Bearer " + key,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ created_by: ws.created_by }),
      }
    );
    const text = await res.text();
    console.log("Workspace", ws.id, "status:", res.status, "response:", text.slice(0, 200));
  }
}

fix().catch(console.error);
