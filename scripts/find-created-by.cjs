const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnvFile(path.join(__dirname, '.env.local'));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function inspect() {
  const sql = "SELECT table_name, column_name FROM information_schema.columns WHERE column_name = 'created_by' AND table_schema = 'public' ORDER BY table_name;";
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error('RPC error:', error);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

inspect().catch(e => console.error('Error:', e.message));
