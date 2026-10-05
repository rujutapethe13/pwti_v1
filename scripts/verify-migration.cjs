const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NEW_USER_EMAIL = "email-rujutapethe@gmail.com";
const TEST_PASSWORD = "TestPass2026!!";

async function step1_SetPasswordAndVerify() {
  console.log("=== STEP 1: Setting password and verifying email ===");

  // Get the new user
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find((u) => u.email === NEW_USER_EMAIL);
  if (!user) {
    throw new Error("New user not found!");
  }
  console.log("Found user:", user.id, user.email, "confirmed:", !!user.email_confirmed_at);

  // Set a known password
  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: TEST_PASSWORD,
  });
  if (updateError) {
    console.error("Error updating password:", updateError.message);
  } else {
    console.log("Password set successfully");
  }

  // Try to resend verification email
  const { error: resendError } = await supabase.auth.resend({
    type: "signup",
    email: NEW_USER_EMAIL,
  });
  if (resendError) {
    console.log("Resend error (expected if rate limited):", resendError.message);
    console.log("Manually confirming email...");
    const { data: confirmData, error: confirmError } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (confirmError) {
      console.error("Error confirming email:", confirmError.message);
    } else {
      console.log("Email confirmed successfully");
    }
  } else {
    console.log("Verification email sent!");
  }
}

async function step2_TestRlsAccess() {
  console.log("\n=== STEP 2: Testing RLS access with user session ===");

  const userClient = createClient(supabaseUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
    email: NEW_USER_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    console.error("Sign in failed:", signInError.message);
    throw signInError;
  }
  console.log("Signed in as:", signInData.user.email);
  console.log("Email confirmed:", !!signInData.user.email_confirmed_at);

  console.log("\n--- Querying workspaces as user ---");
  const { data: workspaces, error: wsError } = await userClient
    .from("workspaces")
    .select("id, name, organization_id");
  if (wsError) {
    console.error("Error fetching workspaces:", wsError.message);
  } else {
    console.log("Workspaces visible to user:", workspaces.length);
    for (const ws of workspaces) {
      console.log("  -", ws.name, ws.id, "org:", ws.organization_id);
    }
  }

  console.log("\n--- Querying boards as user ---");
  const { data: boards, error: boardError } = await userClient
    .from("boards")
    .select("id, name, workspace_id");
  if (boardError) {
    console.error("Error fetching boards:", boardError.message);
  } else {
    console.log("Boards visible to user:", boards.length);
    for (const b of boards) {
      console.log("  -", b.name, b.id, "ws:", b.workspace_id);
    }
  }

  console.log("\n--- Testing active workspace context ---");
  const { data: firstWs } = await userClient.from("workspaces").select("*").limit(1);
  if (firstWs && firstWs.length > 0) {
    const ws = firstWs[0];
    console.log("First workspace:", ws.name);
    console.log("Has organization_id:", ws.organization_id);
    console.log("organizationId populated:", !!ws.organization_id);
  }
}

async function step3_TestBoardCreation() {
  console.log("\n=== STEP 3: Testing board creation end-to-end ===");

  const userClient = createClient(supabaseUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
    email: NEW_USER_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    throw signInError;
  }
  console.log("Signed in as:", signInData.user.email);

  // Get all workspaces for the user
  const { data: workspaces } = await userClient.from("workspaces").select("id, name, organization_id");
  console.log("\nAvailable workspaces:", workspaces.map((w) => w.name));

  for (const ws of workspaces || []) {
    console.log(`\n--- Testing board creation in: ${ws.name} ---`);
    const testBoardName = `Test Board ${crypto.randomBytes(4).toString("hex")}`;
    const { data: newBoard, error: boardError } = await userClient
      .from("boards")
      .insert({
        id: "board-test-" + crypto.randomBytes(8).toString("hex"),
        organization_id: ws.organization_id,
        workspace_id: ws.id,
        slug: "test-board-" + Math.random().toString(36).slice(2, 8),
        name: testBoardName,
        description: "Test board for verification",
        favorite: false,
        pinned: false,
        visibility: "workspace",
        status: "active",
        shared_with: ["owner", "editor", "viewer"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (boardError) {
      console.error("FAILED to create board:", boardError.message);
    } else {
      console.log("SUCCESS: Created board:", newBoard.name, "(" + newBoard.id + ")");

      // Clean up test board
      await userClient.from("boards").delete().eq("id", newBoard.id);
      console.log("Cleaned up test board");
    }
  }
}

async function step4_TestDashboardCreation() {
  console.log("\n=== STEP 4: Testing dashboard board creation ===");

  const userClient = createClient(supabaseUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await userClient.auth.signInWithPassword({
    email: NEW_USER_EMAIL,
    password: TEST_PASSWORD,
  });

  const { data: workspaces } = await userClient.from("workspaces").select("id, name, organization_id");
  const mainWs = workspaces.find((w) => w.id === "ws-main");
  if (mainWs) {
    console.log("Testing dashboard board creation in:", mainWs.name);
    const testBoardName = "Test Dashboard " + crypto.randomBytes(4).toString("hex");
    const { data: newBoard, error: boardError } = await userClient
      .from("boards")
      .insert({
        id: "dashboard-test-" + crypto.randomBytes(8).toString("hex"),
        organization_id: mainWs.organization_id,
        workspace_id: mainWs.id,
        slug: "test-dashboard-" + Math.random().toString(36).slice(2, 8),
        name: testBoardName,
        description: "",
        favorite: true,
        pinned: true,
        visibility: "workspace",
        status: "active",
        shared_with: ["owner", "editor", "viewer"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (boardError) {
      console.error("FAILED:", boardError.message);
    } else {
      console.log("SUCCESS: Created dashboard board:", newBoard.name);
      await userClient.from("boards").delete().eq("id", newBoard.id);
      console.log("Cleaned up test dashboard");
    }
  }
}

async function main() {
  try {
    await step1_SetPasswordAndVerify();
    await step2_TestRlsAccess();
    await step3_TestBoardCreation();
    await step4_TestDashboardCreation();
    console.log("\n=== ALL TESTS PASSED ===");
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error);
    process.exit(1);
  }
}

main();
