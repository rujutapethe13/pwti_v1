const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const boardId = 'board-1789198961264-97skyan';

  // Get columns
  const { data: cols } = await supabase.from('columns').select('id, label, type').eq('board_id', boardId);
  const colMap = {};
  for (const c of cols) colMap[c.label] = c.id;

  // Get a record
  const { data: records } = await supabase.from('records').select('id, title').eq('board_id', boardId).limit(1);
  const record = records[0];
  console.log('Testing write for record:', record.title, record.id);

  // Try inserting a cell value for each column
  const testValues = {
    'Item Name': 'Test Item',
    'Job Type': 'opt-retouching',
    'Status': 'opt-done',
    'Date': '2026-09-15',
    'Assigned To': 'Test User',
  };

  for (const [label, value] of Object.entries(testValues)) {
    const colId = colMap[label];
    if (!colId) { console.log('No column for', label); continue; }

    const { data, error } = await supabase
      .from('cell_values')
      .upsert({
        id: `${boardId}:${record.id}:${colId}`,
        organization_id: 'org-main',
        workspace_id: 'ws-1789198888475-7eeo1ex',
        board_id: boardId,
        record_id: record.id,
        column_id: colId,
        value: value,
        value_text: String(value),
        version: 1,
        updated_at: new Date().toISOString(),
      })
      .select();

    console.log(label, '->', error ? `ERROR: ${error.message}` : `OK: ${JSON.stringify(data)}`);
  }

  // Verify
  const { data: cells } = await supabase.from('cell_values').select('column_id, value, value_text').eq('record_id', record.id);
  console.log('\nVerification - cells for record:');
  for (const c of cells) {
    const col = cols.find(x => x.id === c.column_id);
    console.log(`  ${col?.label}: value=${JSON.stringify(c.value)} text=${c.value_text}`);
  }
}

main().catch(console.error);