import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function cleanup() {
  console.log('Starting cleanup of demo/test boards...');

  // First, find boards to delete
  const { data: boardsToDelete, error: findError } = await supabase
    .from('boards')
    .select('id, name')
    .or('name.ilike.%may%,name.ilike.%june%,name.ilike.%july%,name.ilike.%august%,name.ilike.%test%,name.ilike.%demo%,name.ilike.%temp%,name.ilike.%tmp%')
    .not('name', 'in', '("production","analytics","cgi","retouching","settings","video")');

  if (findError) {
    console.error('Error finding boards:', findError);
    return;
  }

  console.log(`Found ${boardsToDelete?.length ?? 0} boards to delete:`, boardsToDelete?.map(b => b.name));

  if (!boardsToDelete || boardsToDelete.length === 0) {
    console.log('No boards to clean up.');
    return;
  }

  const boardIds = boardsToDelete.map(b => b.id);

  // Delete in correct order due to foreign keys
  console.log('Deleting cell_values...');
  const { error: cellError } = await supabase
    .from('cell_values')
    .delete()
    .in('board_id', boardIds);
  if (cellError) console.error('cell_values error:', cellError);

  console.log('Deleting records...');
  const { error: recordsError } = await supabase
    .from('records')
    .delete()
    .in('board_id', boardIds);
  if (recordsError) console.error('records error:', recordsError);

  console.log('Deleting groups...');
  const { error: groupsError } = await supabase
    .from('groups')
    .delete()
    .in('board_id', boardIds);
  if (groupsError) console.error('groups error:', groupsError);

  console.log('Deleting columns...');
  const { error: columnsError } = await supabase
    .from('columns')
    .delete()
    .in('board_id', boardIds);
  if (columnsError) console.error('columns error:', columnsError);

  console.log('Deleting views...');
  const { error: viewsError } = await supabase
    .from('views')
    .delete()
    .in('board_id', boardIds);
  if (viewsError) console.error('views error:', viewsError);

  console.log('Deleting relationships...');
  const { error: relError } = await supabase
    .from('relationships')
    .delete()
    .or(`source_board_id.in.(${boardIds.join(',')}),target_board_id.in.(${boardIds.join(',')})`);
  if (relError) console.error('relationships error:', relError);

  console.log('Deleting derived_values...');
  const { error: dvError } = await supabase
    .from('derived_values')
    .delete()
    .in('board_id', boardIds);
  if (dvError) console.error('derived_values error:', dvError);

  console.log('Deleting dependency_graph_edges...');
  const { error: dgeError } = await supabase
    .from('dependency_graph_edges')
    .delete()
    .in('board_id', boardIds);
  if (dgeError) console.error('dependency_graph_edges error:', dgeError);

  console.log('Deleting search_index...');
  const { error: siError } = await supabase
    .from('search_index')
    .delete()
    .in('board_id', boardIds);
  if (siError) console.error('search_index error:', siError);

  console.log('Deleting column_dependencies...');
  const { error: cdError } = await supabase
    .from('column_dependencies')
    .delete()
    .in('board_id', boardIds);
  if (cdError) console.error('column_dependencies error:', cdError);

  console.log('Deleting boards...');
  const { error: boardsError } = await supabase
    .from('boards')
    .delete()
    .in('id', boardIds);
  if (boardsError) console.error('boards error:', boardsError);

  // Verify
  const { data: remainingBoards, error: verifyError } = await supabase
    .from('boards')
    .select('id, name, workspace_id')
    .order('created_at');

  if (verifyError) {
    console.error('Verify error:', verifyError);
  } else {
    console.log('\nBoards remaining after cleanup:');
    console.table(remainingBoards);
  }

  console.log('\nCleanup complete!');
}

cleanup().catch(console.error);