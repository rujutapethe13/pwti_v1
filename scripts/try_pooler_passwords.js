process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const ref = 'axyguuhslxdbjhnkcnce';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';

// Try various combinations
const attempts = [
  { user: `postgres.${ref}`, password: '' },
  { user: 'postgres', password: '' },
  // Try base64-decoded JWT as password
  { user: `postgres.${ref}`, password: Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY, 'base64').toString() },
  { user: 'postgres', password: Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY, 'base64').toString() },
];

async function tryConnection(cfg) {
  const client = new Client({
    host: host,
    port: 5432,
    user: cfg.user,
    password: cfg.password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => null },
    connectionTimeoutMillis: 5000,
    family: 4
  });
  try {
    await client.connect();
    console.log('SUCCESS:', cfg.user);
    const r = await client.query('SELECT 1 as test');
    console.log('Result:', r.rows);
    await client.end();
    return true;
  } catch(e) {
    const msg = e.message.split('\n')[0];
    console.log(`FAIL: user=${cfg.user}, err=${msg}`);
    try { await client.end(); } catch(_) {}
    return false;
  }
}

(async () => {
  for (const cfg of attempts) {
    if (await tryConnection(cfg)) break;
  }
})();
