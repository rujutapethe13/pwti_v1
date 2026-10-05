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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars", { url: !!supabaseUrl, key: !!serviceRoleKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function inspectDb() {
  console.log("=== AUTH USERS ===");
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error("Error fetching users:", usersError);
  } else {
    for (const user of users.users) {
      console.log(
        JSON.stringify({
          id: user.id,
          email: user.email,
          email_confirmed_at: user.email_confirmed_at,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
        })
      );
    }
  }

  console.log("\n=== WORKSPACES ===");
  const { data: workspaces, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });
  if (wsError) {
    console.error("Error fetching workspaces:", wsError);
  } else {
    for (const ws of workspaces) {
      console.log(JSON.stringify(ws));
    }
  }

  console.log("\n=== WORKSPACE MEMBERS ===");
  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("*")
    .order("created_at", { ascending: true });
  if (membersError) {
    console.error("Error fetching members:", membersError);
  } else {
    for (const member of members) {
      console.log(JSON.stringify(member));
    }
  }

  console.log("\n=== ORGANIZATIONS ===");
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("*");
  if (orgsError) {
    console.error("Error fetching orgs:", orgsError);
  } else {
    for (const org of orgs) {
      console.log(JSON.stringify(org));
    }
  }

  console.log("\n=== BOARDS COUNT ===");
  const { count: boardCount, error: bcError } = await supabase
    .from("boards")
    .select("*", { count: "exact", head: true });
  if (bcError) {
    console.error("Error counting boards:", bcError);
  } else {
    console.log("Total boards:", boardCount);
  }

  console.log("\n=== BOARDS ===");
  const { data: boards, error: bError } = await supabase
    .from("boards")
    .select("id, name, workspace_id, organization_id, created_by, status")
    .order("created_at", { ascending: true });
  if (bError) {
    console.error("Error fetching boards:", bError);
  } else {
    for (const board of boards) {
      console.log(JSON.stringify(board));
    }
  }

  console.log("\n=== ROLES ===");
  const { data: roles, error: rError } = await supabase
    .from("roles")
    .select("*");
  if (rError) {
    console.error("Error fetching roles:", rError);
  } else {
    for (const role of roles) {
      console.log(JSON.stringify(role));
    }
  }

  console.log("\n=== RECORDS COUNT ===");
  const { count: recordsCount, error: rcError } = await supabase
    .from("records")
    .select("*", { count: "exact", head: true });
  if (rcError) {
    console.error("Error counting records:", rcError);
  } else {
    console.log("Total records:", recordsCount);
  }

  console.log("\n=== GROUPS COUNT ===");
  const { count: groupsCount, error: gcError } = await supabase
    .from("groups")
    .select("*", { count: "exact", head: true });
  if (gcError) {
    console.error("Error counting groups:", gcError);
  } else {
    console.log("Total groups:", groupsCount);
  }

  console.log("\n=== VIEWS COUNT ===");
  const { count: viewsCount, error: vcError } = await supabase
    .from("views")
    .select("*", { count: "exact", head: true });
  if (vcError) {
    console.error("Error counting views:", vcError);
  } else {
    console.log("Total views:", viewsCount);
  }

  console.log("\n=== FOLDERS COUNT ===");
  const { count: foldersCount, error: fcError } = await supabase
    .from("folders")
    .select("*", { count: "exact", head: true });
  if (fcError) {
    console.error("Error counting folders:", fcError);
  } else {
    console.log("Total folders:", foldersCount);
  }
}

inspectDb().catch(console.error);
