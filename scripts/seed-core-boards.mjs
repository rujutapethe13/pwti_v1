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

const ORG_ID = 'org-main';
const WS_ID = 'ws-main';
const NOW = new Date().toISOString();

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function seed() {
  console.log('Seeding core boards...');

  // Ensure organization exists
  const { error: orgError } = await supabase
    .from('organizations')
    .upsert({ id: ORG_ID, name: 'Acme Corp', status: 'active', plan: 'business' });
  if (orgError) console.error('Organization upsert error:', orgError);

  // Ensure workspace exists
  const { error: wsError } = await supabase
    .from('workspaces')
    .upsert({ id: WS_ID, organization_id: ORG_ID, name: 'Main Workspace', slug: 'main', description: '', status: 'active' });
  if (wsError) console.error('Workspace upsert error:', wsError);

  // Core board definitions from registry.ts
  const coreBoards = [
    {
      id: 'production',
      slug: 'production',
      name: 'Production',
      description: 'Live production work',
      icon: 'Camera',
      favorite: true,
      pinned: true,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor', 'viewer'],
      groups: [
        { name: 'Inbox', color: '#64748b' },
        { name: 'In Progress', color: '#0ea5e9' },
        { name: 'Done', color: '#22c55e' },
      ],
      columns: [
        { key: 'name', label: 'Name', type: 'text', required: true, order: 0 },
        { key: 'status', label: 'Status', type: 'status', order: 1, settings: { options: [
          { id: 'opt-to-do', label: 'To Do', color: '#94a3b8' },
          { id: 'opt-in-progress', label: 'In Progress', color: '#f59e0b' },
          { id: 'opt-review', label: 'Review', color: '#8b5cf6' },
          { id: 'opt-blocked', label: 'Blocked', color: '#ef4444' },
          { id: 'opt-done', label: 'Done', color: '#22c55e' },
        ]}},
        { key: 'owner', label: 'Owner', type: 'person', order: 2 },
        { key: 'due', label: 'Due Date', type: 'date', order: 3 },
        { key: 'job_type', label: 'Job Type', type: 'dropdown', order: 4, settings: { options: [
          { id: 'opt-retouching', label: 'Retouching' },
          { id: 'opt-compositing', label: 'Compositing' },
          { id: 'opt-color-grade', label: 'Color Grade' },
          { id: 'opt-delivery', label: 'Delivery' },
        ]}},
        { key: 'priority', label: 'Priority', type: 'priority', order: 5, settings: { options: [
          { id: 'opt-low', label: 'Low' },
          { id: 'opt-medium', label: 'Medium' },
          { id: 'opt-high', label: 'High' },
          { id: 'opt-critical', label: 'Critical' },
        ]}},
      ],
      views: ['table', 'kanban', 'calendar', 'timeline'],
    },
    {
      id: 'analytics',
      slug: 'analytics',
      name: 'Analytics Studio',
      description: 'Performance and operational analytics',
      icon: 'ChartNoAxesCombined',
      favorite: false,
      pinned: false,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor', 'viewer'],
      groups: [{ name: 'All Tasks', color: '#94a3b8' }],
      columns: [
        { key: 'metric', label: 'Metric', type: 'text', order: 0 },
        { key: 'value', label: 'Value', type: 'number', order: 1 },
        { key: 'trend', label: 'Trend', type: 'progress', order: 2, settings: { min: 0, max: 100 } },
      ],
      views: ['dashboard', 'chart', 'table'],
    },
    {
      id: 'cgi',
      slug: 'cgi',
      name: 'CGI',
      description: '3D and motion graphics board',
      icon: 'Blocks',
      favorite: false,
      pinned: false,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor', 'viewer'],
      groups: [{ name: 'All Tasks', color: '#94a3b8' }],
      columns: [
        { key: 'shot', label: 'Shot', type: 'text', order: 0 },
        { key: 'status', label: 'Status', type: 'status', order: 1, settings: { options: [
          { id: 'opt-queued', label: 'Queued', color: '#94a3b8' },
          { id: 'opt-rendering', label: 'Rendering', color: '#3b82f6' },
          { id: 'opt-review', label: 'Review', color: '#f59e0b' },
          { id: 'opt-approved', label: 'Approved', color: '#22c55e' },
        ]}},
        { key: 'assignee', label: 'Assignee', type: 'person', order: 2 },
        { key: 'priority', label: 'Priority', type: 'priority', order: 3, settings: { options: [
          { id: 'opt-low', label: 'Low' },
          { id: 'opt-medium', label: 'Medium' },
          { id: 'opt-high', label: 'High' },
          { id: 'opt-critical', label: 'Critical' },
        ]}},
      ],
      views: ['table', 'gallery', 'chart'],
    },
    {
      id: 'retouching',
      slug: 'retouching',
      name: 'Retouching',
      description: 'Image finishing workflow',
      icon: 'FileCog',
      favorite: false,
      pinned: false,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor', 'viewer'],
      groups: [{ name: 'All Tasks', color: '#94a3b8' }],
      columns: [
        { key: 'item', label: 'Item', type: 'text', order: 0 },
        { key: 'status', label: 'Status', type: 'status', order: 1, settings: { options: [
          { id: 'opt-queued', label: 'Queued', color: '#94a3b8' },
          { id: 'opt-retouching', label: 'Retouching', color: '#3b82f6' },
          { id: 'opt-qc', label: 'QC', color: '#f59e0b' },
          { id: 'opt-approved', label: 'Approved', color: '#22c55e' },
        ]}},
        { key: 'artist', label: 'Artist', type: 'person', order: 2 },
        { key: 'priority', label: 'Priority', type: 'priority', order: 3, settings: { options: [
          { id: 'opt-low', label: 'Low' },
          { id: 'opt-medium', label: 'Medium' },
          { id: 'opt-high', label: 'High' },
          { id: 'opt-critical', label: 'Critical' },
        ]}},
      ],
      views: ['table', 'form', 'gallery'],
    },
    {
      id: 'settings',
      slug: 'settings',
      name: 'Settings',
      description: 'Workspace configuration and permissions',
      icon: 'Cog',
      favorite: false,
      pinned: false,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor'],
      groups: [{ name: 'All Tasks', color: '#94a3b8' }],
      columns: [
        { key: 'area', label: 'Area', type: 'text', order: 0 },
        { key: 'status', label: 'Status', type: 'status', order: 1, settings: { options: [
          { id: 'opt-active', label: 'Active', color: '#22c55e' },
          { id: 'opt-review', label: 'Review', color: '#f59e0b' },
          { id: 'opt-needs-attention', label: 'Needs Attention', color: '#ef4444' },
        ]}},
        { key: 'owner', label: 'Owner', type: 'person', order: 2 },
        { key: 'updated', label: 'Updated', type: 'date', order: 3 },
      ],
      views: ['docs'],
    },
    {
      id: 'video',
      slug: 'video',
      name: 'Video',
      description: 'Video production board',
      icon: 'Clapperboard',
      favorite: false,
      pinned: false,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor', 'viewer'],
      groups: [{ name: 'All Tasks', color: '#94a3b8' }],
      columns: [
        { key: 'title', label: 'Title', type: 'text', order: 0 },
        { key: 'status', label: 'Status', type: 'status', order: 1, settings: { options: [
          { id: 'opt-queued', label: 'Queued', color: '#94a3b8' },
          { id: 'opt-editing', label: 'Editing', color: '#3b82f6' },
          { id: 'opt-review', label: 'Review', color: '#f59e0b' },
          { id: 'opt-approved', label: 'Approved', color: '#22c55e' },
        ]}},
        { key: 'editor', label: 'Editor', type: 'person', order: 2 },
        { key: 'asset', label: 'Asset', type: 'files', order: 3 },
      ],
      views: ['table', 'gallery', 'timeline'],
    },
    {
      id: 'dashboard',
      slug: 'dashboard',
      name: 'Dashboard',
      description: 'Operational overview and KPI surface',
      icon: 'LayoutDashboard',
      favorite: true,
      pinned: true,
      visibility: 'workspace',
      status: 'active',
      sharedWith: ['owner', 'editor', 'viewer'],
      groups: [{ name: 'All Tasks', color: '#94a3b8' }],
      columns: [
        { key: 'metric', label: 'Metric', type: 'text', order: 0 },
        { key: 'value', label: 'Value', type: 'number', order: 1 },
      ],
      views: ['dashboard', 'table'],
    },
  ];

  for (const boardDef of coreBoards) {
    console.log(`\n--- Creating board: ${boardDef.name} (${boardDef.id}) ---`);

    // 1. Create board
    const { error: boardError } = await supabase
      .from('boards')
      .upsert({
        id: boardDef.id,
        organization_id: ORG_ID,
        workspace_id: WS_ID,
        slug: boardDef.slug,
        name: boardDef.name,
        description: boardDef.description,
        icon: boardDef.icon,
        favorite: boardDef.favorite,
        pinned: boardDef.pinned,
        visibility: boardDef.visibility,
        status: boardDef.status,
        shared_with: boardDef.sharedWith,
        created_at: NOW,
        updated_at: NOW,
      });
    if (boardError) {
      console.error(`  Board error:`, boardError);
      continue;
    }
    console.log(`  ✓ Board created`);

    // 2. Create groups
    const groupIdMap = new Map();
    for (let i = 0; i < boardDef.groups.length; i++) {
      const g = boardDef.groups[i];
      const groupId = generateId('group');
      groupIdMap.set(g.name, groupId);

      const { error: groupError } = await supabase
        .from('groups')
        .upsert({
          id: groupId,
          organization_id: ORG_ID,
          workspace_id: WS_ID,
          board_id: boardDef.id,
          parent_group_id: null,
          name: g.name,
          color: g.color,
          collapsed: false,
          sort_order: i,
          status: 'active',
          created_at: NOW,
          updated_at: NOW,
        });
      if (groupError) console.error(`  Group error (${g.name}):`, groupError);
    }
    console.log(`  ✓ ${boardDef.groups.length} group(s) created`);

    // 3. Create columns
    const columnIdMap = new Map();
    for (let i = 0; i < boardDef.columns.length; i++) {
      const c = boardDef.columns[i];
      const columnId = generateId('col');
      columnIdMap.set(c.key, columnId);

      let defaultValue = '';
      if (c.type === 'number') defaultValue = 0;
      else if (c.type === 'status') defaultValue = 'To Do';
      else if (c.type === 'date') defaultValue = null;
      else if (c.type === 'dropdown') defaultValue = '';
      else if (c.type === 'person') defaultValue = null;
      else if (c.type === 'files') defaultValue = [];
      else if (c.type === 'progress') defaultValue = 0;

      const { error: colError } = await supabase
        .from('columns')
        .upsert({
          id: columnId,
          organization_id: ORG_ID,
          workspace_id: WS_ID,
          board_id: boardDef.id,
          key: c.key,
          label: c.label,
          type: c.type,
          required: c.required ?? false,
          hidden: false,
          frozen: false,
          default_value: defaultValue,
          settings: c.settings ?? {},
          permissions: { view: ['owner', 'editor', 'commenter', 'viewer'], edit: ['owner', 'editor'], configure: ['owner'] },
          validation: [],
          version: 1,
          sort_order: c.order,
          created_at: NOW,
          updated_at: NOW,
        });
      if (colError) console.error(`  Column error (${c.label}):`, colError);
    }
    console.log(`  ✓ ${boardDef.columns.length} column(s) created`);

    // 4. Create views
    for (let i = 0; i < boardDef.views.length; i++) {
      const viewType = boardDef.views[i];
      const viewId = generateId('view');
      const isDefault = i === 0;

      // Default settings per view type
      let viewSettings = {};
      if (viewType === 'kanban') {
        const statusCol = boardDef.columns.find(c => c.type === 'status');
        viewSettings = {
          groupBy: { columnId: statusCol ? columnIdMap.get(statusCol.key) : null },
          cardSize: 'normal',
          showCardCount: true,
          showEmptyGroups: true,
          collapsedColumns: [],
          divideBy: { enabled: false, primaryType: 'status', primaryColumnId: statusCol ? columnIdMap.get(statusCol.key) : '', secondaryType: null, secondaryColumnId: '' },
          cardFields: [],
          showColumnName: true,
          displayCoverImage: false,
          showBattery: false,
        };
      } else if (viewType === 'calendar') {
        const dateCol = boardDef.columns.find(c => c.type === 'date');
        viewSettings = {
          dateColumnId: dateCol ? columnIdMap.get(dateCol.key) : '',
          endDateColumnId: '',
          defaultView: 'month',
          firstDayOfWeek: 1,
          showWeekends: true,
          showRecordCount: true,
        };
      } else if (viewType === 'timeline' || viewType === 'gantt') {
        const startCol = boardDef.columns.find(c => c.type === 'date');
        viewSettings = {
          startDateColumnId: startCol ? columnIdMap.get(startCol.key) : '',
          endDateColumnId: '',
          groupBy: null,
          defaultZoom: 'week',
          showTodayMarker: true,
          showDependencies: false,
        };
      } else if (viewType === 'gallery') {
        const imageCol = boardDef.columns.find(c => c.type === 'files');
        const titleCol = boardDef.columns.find(c => c.type === 'text');
        viewSettings = {
          imageColumnId: imageCol ? columnIdMap.get(imageCol.key) : '',
          titleColumnId: titleCol ? columnIdMap.get(titleCol.key) : '',
          subtitleColumnId: '',
          cardSize: 'normal',
          aspectRatio: '1:1',
        };
      } else if (viewType === 'dashboard') {
        viewSettings = {
          widgets: [],
          toolbarCollapsed: false,
          dashboardFilters: [],
          filtersActive: false,
        };
      }

      const { error: viewError } = await supabase
        .from('views')
        .upsert({
          id: viewId,
          organization_id: ORG_ID,
          workspace_id: WS_ID,
          board_id: boardDef.id,
          name: viewType.charAt(0).toUpperCase() + viewType.slice(1),
          type: viewType,
          visibility: 'shared',
          filters: [],
          sorting: [],
          grouping: [],
          visible_column_ids: Array.from(columnIdMap.values()),
          column_widths: {},
          row_height: 44,
          settings: viewSettings,
          personal_owner_user_id: null,
          shared_with: ['owner', 'editor', 'viewer'],
          is_default: isDefault,
          sort_order: i,
          created_at: NOW,
          updated_at: NOW,
        });
      if (viewError) console.error(`  View error (${viewType}):`, viewError);
    }
    console.log(`  ✓ ${boardDef.views.length} view(s) created`);

    // 5. Create sample records (only for boards that had demo data)
    if (['production', 'cgi', 'retouching', 'video', 'analytics'].includes(boardDef.id)) {
      const firstGroupId = groupIdMap.get(boardDef.groups[0].name);
      const sampleRecords = getSampleRecords(boardDef.id);
      
      for (const rec of sampleRecords) {
        const recordId = generateId('record');
        
        const { error: recError } = await supabase
          .from('records')
          .upsert({
            id: recordId,
            organization_id: ORG_ID,
            workspace_id: WS_ID,
            board_id: boardDef.id,
            group_id: firstGroupId,
            title: rec.title,
            status: 'active',
            version: 1,
            archived_at: null,
            created_at: NOW,
            updated_at: NOW,
          });
        if (recError) console.error(`  Record error (${rec.title}):`, recError);

        // Create cell values
        for (const [colKey, value] of Object.entries(rec.cellValues)) {
          const columnId = columnIdMap.get(colKey);
          if (columnId) {
            const { error: cellError } = await supabase
              .from('cell_values')
              .upsert({
                id: generateId('cell'),
                organization_id: ORG_ID,
                workspace_id: WS_ID,
                board_id: boardDef.id,
                record_id: recordId,
                column_id: columnId,
                value: value,
                value_text: String(value ?? ''),
                version: 1,
                updated_at: NOW,
              });
            if (cellError) console.error(`  Cell error (${colKey}):`, cellError);
          }
        }
      }
      console.log(`  ✓ ${sampleRecords.length} sample record(s) created`);
    }
  }

  console.log('\n✓ All core boards seeded!');
}

function getSampleRecords(boardId) {
  const records = {
    production: [
      { title: 'Levis', cellValues: { status: 'Done', owner: 'Rujuta', due: '2026-08-11', job_type: 'Retouching', priority: 'High' }},
      { title: 'Wipro', cellValues: { status: 'Review', owner: 'Maya Chen', due: '2026-08-18', job_type: 'Compositing', priority: 'Medium' }},
      { title: 'NSM', cellValues: { status: 'In Progress', owner: 'Alex Rivera', due: '2026-08-25', job_type: 'Color Grade', priority: 'Critical' }},
    ],
    cgi: [
      { title: 'Trailer hero shot', cellValues: { shot: 'Trailer hero shot', status: 'Rendering', assignee: 'Nina', priority: 'High' }},
      { title: 'Environment matte', cellValues: { shot: 'Environment matte', status: 'Review', assignee: 'Omar', priority: 'Critical' }},
    ],
    retouching: [
      { title: 'Campaign hero image', cellValues: { item: 'Campaign hero image', status: 'Retouching', artist: 'Mina', priority: 'High' }},
      { title: 'Lifestyle composite', cellValues: { item: 'Lifestyle composite', status: 'QC', artist: 'Leo', priority: 'Medium' }},
    ],
    video: [
      { title: 'Launch trailer', cellValues: { title: 'Launch trailer', status: 'Editing', editor: 'Maya', asset: ['trailer-v1.mov'] }},
      { title: 'Social cutdown', cellValues: { title: 'Social cutdown', status: 'Review', editor: 'Jordan', asset: ['social-cutdown-v3.mp4'] }},
    ],
    analytics: [
      { title: 'Delivery Health', cellValues: { metric: 'Delivery Health', value: 92, trend: 92 }},
      { title: 'Queue Velocity', cellValues: { metric: 'Queue Velocity', value: 18, trend: 68 }},
      { title: 'Backlog Reduction', cellValues: { metric: 'Backlog Reduction', value: 24, trend: 81 }},
    ],
  };
  return records[boardId] ?? [];
}

seed().catch(console.error);