const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Find a board with columns + a group
  const { data: boards } = await supabase.from('boards').select('id, name, slug').limit(5);
  console.log('Boards:', JSON.stringify(boards?.map(b => ({ id: b.id, name: b.name, slug: b.slug })), null, 2));

  // Pick the first board that has records
  for (const board of boards || []) {
    const { data: records, count } = await supabase
      .from('records')
      .select('id, title, board_id')
      .eq('board_id', board.id)
      .limit(3);

    const { data: cols } = await supabase
      .from('columns')
      .select('id, label, type, settings')
      .eq('board_id', board.id)
      .order('sort_order');

    const { data: cells, count: cellCount } = await supabase
      .from('cell_values')
      .select('record_id, column_id, value, value_text')
      .eq('board_id', board.id);

    console.log(`\n=== Board: ${board.name} (${board.id}) ===`);
    console.log('Columns:', JSON.stringify(cols?.map(c => ({ id: c.id, label: c.label, type: c.type, options: c.settings?.options })), null, 2));
    console.log('Records:', JSON.stringify(records?.map(r => ({ id: r.id, title: r.title })), null, 2));
    console.log('Cell count:', cellCount);

    // Group cells by record
    const byRecord = {};
    for (const c of cells || []) {
      if (!byRecord[c.record_id]) byRecord[c.record_id] = [];
      byRecord[c.record_id].push({ column_id: c.column_id, value: c.value, value_text: c.value_text });
    }
    console.log('Cells by record:', JSON.stringify(byRecord, null, 2));
  }
}

main().catch(console.error);