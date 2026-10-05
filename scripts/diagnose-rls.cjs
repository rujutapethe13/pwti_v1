const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function test() {
  // Sign in as user
  const { data: signIn } = await userClient.auth.signInWithPassword({
    email: "email-rujutapethe@gmail.com",
    password: "TestPass2026!!",
  });
  console.log("User signed in:", signIn.user?.email);
  console.log("User ID:", signIn.user?.id);

  // Test 1: Query workspaces as user
  console.log("\n--- Test 1: Workspaces query as user ---");
  const { data: ws, error: wsErr } = await userClient.from("workspaces").select("id, name");
  console.log("Workspaces:", ws?.length || 0, "Error:", wsErr?.message || "none");

  // Test 2: Query workspace_members as user
  console.log("\n--- Test 2: workspace_members query as user ---");
  const { data: wm, error: wmErr } = await userClient.from("workspace_members").select("*");
  console.log("Members:", wm?.length || 0, "Error:", wmErr?.message || "none");

  // Test 3: Call is_workspace_member as user
  console.log("\n--- Test 3: is_workspace_member as user ---");
  const { data: func, error: funcErr } = await userClient.rpc("is_workspace_member", {
    p_workspace_id: "ws-main",
  });
  console.log("Result:", func, "Error:", funcErr?.message || "none");

  // Test 4: Call is_workspace_member as service role
  console.log("\n--- Test 4: is_workspace_member as service role ---");
  const { data: func2, error: funcErr2 } = await adminClient.rpc("is_workspace_member", {
    p_workspace_id: "ws-main",
  });
  console.log("Result:", func2, "Error:", funcErr2?.message || "none");

  // Test 5: Query workspace_members as service role
  console.log("\n--- Test 5: workspace_members query as service role ---");
  const { data: wm2, error: wmErr2 } = await adminClient.from("workspace_members").select("*");
  console.log("Members:", wm2?.length || 0, "Error:", wmErr2?.message || "none");

  // Test 6: Query workspaces as service role
  console.log("\n--- Test 6: workspaces query as service role ---");
  const { data: ws2, error: wsErr2 } = await adminClient.from("workspaces").select("id, name");
  console.log("Workspaces:", ws2?.length || 0, "Error:", wsErr2?.message || "none");

  // Test 7: Query boards as user
  console.log("\n--- Test 7: boards query as user ---");
  const { data: boards, error: boardErr } = await userClient.from("boards").select("id, name, workspace_id");
  console.log("Boards:", boards?.length || 0, "Error:", boardErr?.message || "none");
}

test();
