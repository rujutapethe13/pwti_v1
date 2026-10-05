require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Check function definition
  const fnCheck = await supabase.rpc('is_workspace_member', { p_workspace_id: 'ws-main' });
  console.log('RPC is_workspace_member result:', fnCheck.data, fnCheck.error?.message || '');

  // Check function security level via system tables using service role
  // We can't use rpc() to run arbitrary SQL, but we can query the pg_proc table
  // via the supabase admin API

  // Actually, let's check if we can create a function via the supabase RPC
  // that returns information about the function

  // Let's try to query the pg_proc table using a custom function call
  // We can't do this via REST API...

  // Instead, let's try to query the workspaces table as anon user
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // First, let's get the user ID from the anon key JWT
  const jwtPayload = JSON.parse(Buffer.from(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.split('.')[1], 'base64').toString());
  console.log('\nAnon JWT payload:', JSON.stringify(jwtPayload));

  // Check workspaces table schema
  const wsResult = await anonSupabase.from('workspaces').select('id,name');
  console.log('\nAnon workspaces query:', wsResult.error ? wsResult.error.message : JSON.stringify(wsResult.data));

  // Check workspace_members as service role (bypasses RLS)
  const srMembers = await supabase.from('workspace_members').select('*');
  console.log('\nService role workspace_members:', JSON.stringify(srMembers.data));

  // Check workspace members with a specific user_id
  const user_id = jwtPayload.sub;
  console.log('\nUser ID from anon JWT:', user_id);

  // Try to check if created_by exists
  const wsCols = await supabase.from('workspaces').select('created_by', { count: 'exact' });
  console.log('\nService role workspaces with created_by:', wsCols.error ? wsCols.error.message : JSON.stringify(wsCols.data));

  // Check available RPC functions
  console.log('\nTrying various RPC functions...');

  // Try check_permission_manage
  const cpmResult = await anonSupabase.rpc('check_permission_manage', {
    p_workspace_id: 'ws-main',
    p_resource_type: 'workspace'
  });
  console.log('check_permission_manage:', cpmResult.error ? cpmResult.error.message : cpmResult.data);

  // Try onboard_workspace_owner
  const onboardResult = await supabase.rpc('onboard_workspace_owner', { p_workspace_id: 'ws-main' });
  console.log('onboard_workspace_owner (sr):', onboardResult.error ? onboardResult.error.message : onboardResult.data);
}

main().catch(console.error);
