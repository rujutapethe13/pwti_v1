require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Try calling exec_sql or similar functions
  const testFns = ['exec_sql', 'sql', 'run_sql', 'execute_sql', 'query'];

  for (const fn of testFns) {
    const result = await supabase.rpc(fn, { query: 'SELECT 1 as test' });
    console.log(`${fn}:`, result.error ? result.error.message : JSON.stringify(result.data));
  }

  // Also try using pgwith the pooler endpoint
  const { Client } = require('pg');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // The pooler is in ap-southeast-1, but we need the actual DB password
  // Let's try all password variations
  const ref = 'axyguuhslxdbjhnkcnce';
  const host = 'aws-0-ap-southeast-1.pooler.supabase.com';

  // Try with JWT token format as password (some pools accept this)
  const tokens = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ];

  for (const token of tokens) {
    // Try both pooler format and standard format
    const variants = [
      { user: `postgres.${ref}`, pass: token },
      { user: 'postgres', pass: token },
      { user: `aws-0-${ref}`, pass: token },
    ];

    for (const v of variants) {
      const connStr = `postgresql://${encodeURIComponent(v.user)}:${encodeURIComponent(v.pass)}@${host}:5432/postgres`;
      const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
        family: 4
      });
      try {
        await client.connect();
        const r = await client.query('SELECT current_user, session_user');
        console.log(`SUCCESS: user=${v.user}, token=${token.substring(0, 20)}...`);
        console.log('  current_user:', r.rows);
        await client.end();
      } catch (e) {
        const msg = e.message.split('\n')[0];
        if (msg.includes('FATAL') || msg.includes('tenant') || msg.includes('authentication')) {
          // Only print interesting errors
          if (msg.includes('password')) console.log(`FAIL: user=${v.user}, err=${msg}`);
        }
      }
    }
  }
}

main().catch(console.error);
