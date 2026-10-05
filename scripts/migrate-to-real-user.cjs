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

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars", { url: !!supabaseUrl, key: !!serviceRoleKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NEW_USER_EMAIL = "email-rujutapethe@gmail.com";
const NEW_USER_PASSWORD = crypto.randomBytes(16).toString("hex") + "A1!";
const DUMMY_USER_EMAIL = "email-rujutapeteh@gmail.com";

const KEPT_WORKSPACE_IDS = new Set([
  "ws-main",
  "ws-1788763486807-g0w6xvg", // Department (latest)
  "ws-1788773404872-q4dlmge", // Photofactory (latest)
]);

const KEPT_ORG_IDS = new Set([
  "org-main",
  "org-1788763486691-fyw4po5", // Department org
  "org-1788773404872-q4dlmge", // Photofactory org
]);

const BACKUP_DIR = path.join(
  __dirname,
  "..",
  "backups",
  new Date().toISOString().replace(/[:.]/g, "-")
);

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function backupTable(tableName) {
  const { data, error } = await supabase.from(tableName).select("*");
  if (error) {
    console.error(`  Error fetching ${tableName}:`, error.message);
    return;
  }
  const filePath = path.join(BACKUP_DIR, `${tableName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data || [], null, 2));
  console.log(`  Backed up ${tableName}: ${(data || []).length} rows`);
}

async function backupDatabase() {
  console.log("\n=== BACKING UP DATABASE ===");
  await ensureDir(BACKUP_DIR);
  const tables = [
    "organizations",
    "workspaces",
    "workspace_members",
    "boards",
    "groups",
    "columns",
    "records",
    "cell_values",
    "views",
    "column_dependencies",
    "permission_grants",
    "search_index",
    "relationships",
    "derived_values",
    "teams",
    "departments",
    "team_members",
    "roles",
    "dashboard_widgets",
    "invitations",
    "audit_log",
    "column_visibility_rules",
  ];
  for (const table of tables) {
    await backupTable(table);
  }
  console.log(`\nBackup saved to: ${BACKUP_DIR}`);
}

async function createRealUser() {
  console.log("\n=== CREATING REAL USER ===");
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: NEW_USER_EMAIL,
      password: NEW_USER_PASSWORD,
      email_confirm: false,
    });
    if (error) {
      if (
        error.message?.toLowerCase().includes("already") ||
        error.code === "email_exists"
      ) {
        console.log("User already exists, fetching existing user...");
        const { data: existing } = await supabase.auth.admin.listUsers();
        const user = existing.users.find((u) => u.email === NEW_USER_EMAIL);
        if (user) {
          console.log(`Found existing user: ${user.id}`);
          return user;
        }
        throw error;
      }
      throw error;
    }
    console.log(`Created user: ${data.user.id}`);
    return data.user;
  } catch (err) {
    console.error("Failed to create user:", err.message);
    throw err;
  }
}

async function sendVerificationEmail() {
  console.log("\n=== SENDING VERIFICATION EMAIL ===");
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: NEW_USER_EMAIL,
    });
    if (error) {
      console.error("Error sending verification email:", error.message);
      console.log("You can resend the verification email from the signup page later.");
      return;
    }
    console.log(`Verification email sent to ${NEW_USER_EMAIL}`);
  } catch (err) {
    console.error("Failed to send verification email:", err.message);
    console.log("You can resend the verification email from the signup page later.");
  }
}

async function getDummyUser() {
  const { data } = await supabase.auth.admin.listUsers();
  const user = data.users.find((u) => u.email === DUMMY_USER_EMAIL);
  if (!user) throw new Error(`Dummy user ${DUMMY_USER_EMAIL} not found`);
  return user;
}

async function transferWorkspaceOwnership(newUserId) {
  console.log("\n=== TRANSFERRING WORKSPACE OWNERSHIP ===");
  const dummyUser = await getDummyUser();

  // 1. Update workspaces.created_by for kept workspaces
  console.log("Updating workspaces.created_by...");
  for (const wsId of KEPT_WORKSPACE_IDS) {
    const { error } = await supabase
      .from("workspaces")
      .update({ created_by: newUserId })
      .eq("id", wsId);
    if (error) {
      console.error(`  Error updating workspace ${wsId}:`, error.message);
    } else {
      console.log(`  Updated created_by for workspace ${wsId}`);
    }
  }

  // 2. Add new user as Owner in workspace_members for kept workspaces
  console.log("Adding new user as Owner...");
  const { data: roles } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Owner")
    .eq("is_system_role", true)
    .single();
  const ownerRoleId = roles.id;

  for (const wsId of KEPT_WORKSPACE_IDS) {
    const { error } = await supabase.from("workspace_members").upsert(
      {
        user_id: newUserId,
        workspace_id: wsId,
        role_id: ownerRoleId,
      },
      { onConflict: ["user_id", "workspace_id"] }
    );
    if (error) {
      console.error(`  Error adding member to ${wsId}:`, error.message);
    } else {
      console.log(`  Added Owner to workspace ${wsId}`);
    }
  }

  // 3. Delete dummy user from workspace_members for kept workspaces
  console.log("Removing dummy user from workspace_members...");
  for (const wsId of KEPT_WORKSPACE_IDS) {
    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("user_id", dummyUser.id)
      .eq("workspace_id", wsId);
    if (error) {
      console.error(`  Error removing dummy user from ${wsId}:`, error.message);
    } else {
      console.log(`  Removed dummy user from workspace ${wsId}`);
    }
  }
}

async function cleanupDummyData() {
  console.log("\n=== CLEANING UP DUMMY DATA ===");

  // 1. Delete all workspaces except the 3 kept ones
  console.log("Deleting non-essential workspaces...");
  const { data: allWorkspaces } = await supabase.from("workspaces").select("id, name");
  for (const ws of allWorkspaces || []) {
    if (KEPT_WORKSPACE_IDS.has(ws.id)) {
      console.log(`  Keeping workspace: ${ws.name} (${ws.id})`);
      continue;
    }
    const { error } = await supabase.from("workspaces").delete().eq("id", ws.id);
    if (error) {
      console.error(`  Error deleting workspace ${ws.id}:`, error.message);
    } else {
      console.log(`  Deleted workspace: ${ws.name} (${ws.id})`);
    }
  }

  // 2. Delete all organizations except the 3 kept ones
  console.log("Deleting non-essential organizations...");
  const { data: allOrgs } = await supabase.from("organizations").select("id, name");
  for (const org of allOrgs || []) {
    if (KEPT_ORG_IDS.has(org.id)) {
      console.log(`  Keeping organization: ${org.name} (${org.id})`);
      continue;
    }
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) {
      console.error(`  Error deleting organization ${org.id}:`, error.message);
    } else {
      console.log(`  Deleted organization: ${org.name} (${org.id})`);
    }
  }
}

async function deleteDummyUser() {
  console.log("\n=== DELETING DUMMY USER ===");
  const dummyUser = await getDummyUser();
  const { error } = await supabase.auth.admin.deleteUser(dummyUser.id);
  if (error) {
    console.error("Error deleting dummy user:", error);
    throw error;
  }
  console.log(`Deleted dummy user: ${DUMMY_USER_EMAIL}`);
}

async function verifyResult() {
  console.log("\n=== VERIFYING RESULT ===");
  const { data: users } = await supabase.auth.admin.listUsers();
  console.log(`Remaining auth users: ${users.users.length}`);
  for (const u of users.users) {
    console.log(`  - ${u.email} (confirmed: ${!!u.email_confirmed_at})`);
  }

  const { data: workspaces } = await supabase.from("workspaces").select("id, name, organization_id, created_by");
  console.log(`\nRemaining workspaces: ${workspaces.length}`);
  for (const ws of workspaces) {
    console.log(`  - ${ws.name} (${ws.id}) org=${ws.organization_id} created_by=${ws.created_by}`);
  }

  const { data: members } = await supabase.from("workspace_members").select("*");
  console.log(`\nWorkspace members: ${members.length}`);
  for (const m of members) {
    console.log(`  - user=${m.user_id} workspace=${m.workspace_id} role=${m.role_id}`);
  }

  const { count: boardCount } = await supabase.from("boards").select("*", { count: "exact", head: true });
  console.log(`\nTotal boards: ${boardCount}`);

  const { count: recordCount } = await supabase.from("records").select("*", { count: "exact", head: true });
  console.log(`Total records: ${recordCount}`);
}

async function main() {
  try {
    await backupDatabase();
    const newUser = await createRealUser();
    await sendVerificationEmail();
    await transferWorkspaceOwnership(newUser.id);
    await cleanupDummyData();
    await deleteDummyUser();
    await verifyResult();
    console.log("\n=== MIGRATION COMPLETE ===");
    console.log(`\nNew user email: ${NEW_USER_EMAIL}`);
    console.log(`Temporary password: ${NEW_USER_PASSWORD}`);
    console.log("Please verify your email before signing in.");
    console.log("You can change your password after logging in.");
  } catch (error) {
    console.error("\n=== MIGRATION FAILED ===");
    console.error(error);
    process.exit(1);
  }
}

main();
