process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const ref = 'axyguuhslxdbjhnkcnce';
const pw = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configs = [
  { host: 'db.axyguuhslxdbjhnkcnce.supabase.co', port: 5432, ssl: true, family: 6 },
  { host: 'db.axyguuhslxdbjhnkcnce.supabase.co', port: 6543, ssl: true, family: 6 },
];

async function tryConfig(cfg) {
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    user: 'postgres.' + ref,
    password: pw,
    database: 'postgres',
    ssl: cfg.ssl ? { rejectUnauthorized: false, checkServerIdentity: () => null } : false,
    connectionTimeoutMillis: 8000,
    family: cfg.family
  });
  try {
    await client.connect();
    console.log('SUCCESS:', cfg.host + ':' + cfg.port);
    const r = await client.query('SELECT 1 as test');
    console.log('Result:', r.rows);
    await client.end();
    return true;
  } catch(e) {
    const msg = e.message.split('\n')[0];
    console.log('FAIL:', cfg.host + ':' + cfg.port, '-', msg);
    try { await client.end(); } catch(_) {}
    return false;
  }
}

(async () => {
  for (const cfg of configs) {
    if (await tryConfig(cfg)) break;
  }
})();
