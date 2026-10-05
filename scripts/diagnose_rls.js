require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Test is_workspace_member with service role
  const srResult = await supabase.rpc('is_workspace_member', { p_workspace_id: 'ws-main' });
  console.log('Service role is_workspace_member(ws-main):', JSON.stringify(srResult.data), srResult.error?.message || '');

  // Test with anon key
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const anonResult = await anonSupabase.rpc('is_workspace_member', { p_workspace_id: 'ws-main' });
  console.log('Anon is_workspace_member(ws-main):', JSON.stringify(anonResult.data), anonResult.error?.message || '');

  // Test workspace_members query with anon key
  const anonMembers = await anonSupabase.from('workspace_members').select('*');
  console.log('Anon workspace_members:', anonMembers.error?.message || JSON.stringify(anonMembers.data));

  // Test workspaces query with anon key
  const anonWorkspaces = await anonSupabase.from('workspaces').select('id,name');
  console.log('Anon workspaces:', anonWorkspaces.error?.message || JSON.stringify(anonWorkspaces.data));
}

main().catch(console.error);
