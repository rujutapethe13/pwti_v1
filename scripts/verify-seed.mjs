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

async function verify() {
  console.log('Verifying seeded data...\n');

  // Check boards
  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('id, name, slug, workspace_id')
    .order('name');
  if (boardsError) console.error('Boards error:', boardsError);
  else {
    console.log('=== BOARDS ===');
    console.table(boards);
  }

  // Check groups
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, board_id, name, color')
    .order('board_id, sort_order');
  if (groupsError) console.error('Groups error:', groupsError);
  else {
    console.log('\n=== GROUPS ===');
    console.table(groups);
  }

  // Check columns
  const { data: columns, error: columnsError } = await supabase
    .from('columns')
    .select('id, board_id, key, label, type, sort_order')
    .order('board_id, sort_order');
  if (columnsError) console.error('Columns error:', columnsError);
  else {
    console.log('\n=== COLUMNS ===');
    console.table(columns);
  }

  // Check views
  const { data: views, error: viewsError } = await supabase
    .from('views')
    .select('id, board_id, name, type, is_default, sort_order')
    .order('board_id, sort_order');
  if (viewsError) console.error('Views error:', viewsError);
  else {
    console.log('\n=== VIEWS ===');
    console.table(views);
  }

  // Check records
  const { data: records, error: recordsError } = await supabase
    .from('records')
    .select('id, board_id, title, group_id')
    .order('board_id, created_at');
  if (recordsError) console.error('Records error:', recordsError);
  else {
    console.log('\n=== RECORDS ===');
    console.table(records);
  }

  // Check cell_values count per board
  const { data: cellCounts, error: cellError } = await supabase
    .from('cell_values')
    .select('board_id, id');
  if (cellError) console.error('Cell values error:', cellError);
  else {
    const counts = {};
    for (const cv of cellCounts) {
      counts[cv.board_id] = (counts[cv.board_id] || 0) + 1;
    }
    console.log('\n=== CELL VALUES COUNT PER BOARD ===');
    console.table(Object.entries(counts).map(([board_id, count]) => ({ board_id, count })));
  }

  // Verify workspaces intact
  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name, organization_id');
  if (wsError) console.error('Workspaces error:', wsError);
  else {
    console.log('\n=== WORKSPACES (structure intact) ===');
    console.table(workspaces);
  }
}

verify().catch(console.error);