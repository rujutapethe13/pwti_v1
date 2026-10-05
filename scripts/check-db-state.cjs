const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

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
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const connectionAttempts = [
  // Pooler with project-ref in username
  { host: "aws-0-us-east-1.pooler.supabase.com", port: 6543, user: "postgres.axyguuhslxdbjhnkcnce", password: serviceRoleKey },
  { host: "aws-0-us-west-1.pooler.supabase.com", port: 6543, user: "postgres.axyguuhslxdbjhnkcnce", password: serviceRoleKey },
  // Direct connection
  { host: "axyguuhslxdbjhnkcnce.supabase.co", port: 5432, user: "postgres.axyguuhslxdbjhnkcnce", password: serviceRoleKey },
  { host: "axyguuhslxdbjhnkcnce.supabase.co", port: 5432, user: "supabase_admin", password: serviceRoleKey },
  // Try with pooler and different regions
  { host: "aws-0-eu-west-1.pooler.supabase.com", port: 6543, user: "postgres.axyguuhslxdbjhnkcnce", password: serviceRoleKey },
  { host: "aws-0-ap-southeast-1.pooler.supabase.com", port: 6543, user: "postgres.axyguuhslxdbjhnkcnce", password: serviceRoleKey },
];

async function main() {
  for (const attempt of connectionAttempts) {
    console.log(`Trying: ${attempt.host}:${attempt.port} as ${attempt.user}`);
    const client = new Client({
      host: attempt.host,
      port: attempt.port,
      database: "postgres",
      user: attempt.user,
      password: attempt.password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });

    try {
      await client.connect();
      console.log(`  SUCCESS: Connected to ${attempt.host}:${attempt.port}`);

      // Check the schema cache and policies
      console.log("\n=== SCHEMA CHECK ===");

      // 1. Check if created_by column exists
      const colRes = await client.query(`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'created_by'
      `);
      console.log("created_by column:", colRes.rows);

      // 2. Check is_workspace_member function
      const funcRes = await client.query(`
        SELECT proname, prosecdef, prosrc
        FROM pg_proc 
        WHERE proname = 'is_workspace_member'
      `);
      console.log("\nis_workspace_member function:", funcRes.rows.map(r => ({ name: r.proname, secdef: r.prosecdef })));

      // 3. Check workspace_members RLS status
      const rlsRes = await client.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class 
        WHERE relname = 'workspace_members'
      `);
      console.log("\nworkspace_members RLS:", rlsRes.rows);

      // 4. Check workspace_members policies
      const policyRes = await client.query(`
        SELECT polname, polcmd, pg_get_policy_qual(polrulas, polrelid, polid) as qual
        FROM pg_policy
        JOIN pg_class ON pg_policy.polrelid = pg_class.oid
        WHERE pg_class.relname = 'workspace_members'
      `);
      console.log("\nworkspace_members policies:", policyRes.rows);

      // 5. Check workspaces RLS and policies
      const wsRlsRes = await client.query(`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class 
        WHERE relname = 'workspaces'
      `);
      console.log("\nworkspaces RLS:", wsRlsRes.rows);

      const wsPolicyRes = await client.query(`
        SELECT polname, polcmd, pg_get_policy_qual(polrulas, polrelid, polid) as qual
        FROM pg_policy
        JOIN pg_class ON pg_policy.polrelid = pg_class.oid
        WHERE pg_class.relname = 'workspaces'
      `);
      console.log("\nworkspaces policies:", wsPolicyRes.rows);

      // 6. Check organizations RLS and policies
      const orgRlsRes = await client.query(`
        SELECT relname, relrowsecurity
        FROM pg_class 
        WHERE relname = 'organizations'
      `);
      console.log("\norganizations RLS:", orgRlsRes.rows);

      const orgPolicyRes = await client.query(`
        SELECT polname, polcmd, pg_get_policy_qual(polrulas, polrelid, polid) as qual
        FROM pg_policy
        JOIN pg_class ON pg_policy.polrelid = pg_class.oid
        WHERE pg_class.relname = 'organizations'
      `);
      console.log("\norganizations policies:", orgPolicyRes.rows);

      await client.end();
      return;
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      try { await client.end(); } catch(e) {}
    }
  }
  console.log("\nAll connection attempts failed");
}

main().catch(console.error);
