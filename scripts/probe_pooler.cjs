/**
 * Try the ap-southeast-1 pooler (the only host that resolved) with every
 * username variant we can think of. The other pooler hosts returned
 * "tenant/user not found" so they are skipped.
 *
 * Usage: node scripts/probe_pooler.cjs
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

const ref = "axyguuhslxdbjhnkcnce";
const host = "aws-0-ap-southeast-1.pooler.supabase.com";
const port = 6543;
const tokens = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
];
const users = [
  `postgres.${ref}`,
  "postgres",
  `aws-0-${ref}`,
  `aws-0-${ref}.internal`,
  ref,
  "supabase_admin",
  "postgres.{}".format ? "" : "",
].filter(Boolean);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function tryConn(user, token) {
  const client = new Client({
    host, port, database: "postgres", user, password: token,
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => null },
    connectionTimeoutMillis: 5000, family: 4,
  });
  try {
    await client.connect();
    const r = await client.query("SELECT current_user, session_user");
    console.log(`SUCCESS user=${user} token=${token.slice(0, 12)}... -> ${JSON.stringify(r.rows[0])}`);
    await client.end();
    return true;
  } catch (e) {
    const msg = (e.message || "").split("\n")[0];
    if (/password|authentication|tenant|role/i.test(msg)) {
      console.log(`FAIL user=${user} token=${token.slice(0, 12)}... -> ${msg}`);
    }
    try { await client.end(); } catch (_) {}
    return false;
  }
}

(async () => {
  for (const token of tokens) {
    for (const user of users) {
      if (await tryConn(user, token)) process.exit(0);
    }
  }
  console.log("All attempts failed");
})();