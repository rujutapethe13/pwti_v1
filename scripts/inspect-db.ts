import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
}

inspectDb().catch(console.error);
