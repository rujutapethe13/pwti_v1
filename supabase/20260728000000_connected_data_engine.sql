-- Connected Data Engine
-- Generic relationships table + derived value infrastructure
-- Part of the metadata-driven No-Code Business OS

-- ── Relationships Table ─────────────────────────────────────
-- One generic table for all relationship types (1:1, 1:many, many:1, many:many).
-- Mirror, Lookup, and Rollup columns reference this table rather than
-- maintaining their own relationship data.
-- ────────────────────────────────────────────────────────────

drop table if exists public.relationships cascade;
create table if not exists public.relationships (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,

  -- Source side
  source_board_id text not null references public.boards(id) on delete cascade,
  source_record_id text not null references public.records(id) on delete cascade,
  source_column_id text not null references public.columns(id) on delete cascade,

  -- Target side
  target_board_id text not null references public.boards(id) on delete cascade,
  target_record_id text not null references public.records(id) on delete cascade,

  -- Relationship metadata
  relationship_type text not null default 'one_to_many',
  direction text not null default 'forward',
  label text not null default '',
  status text not null default 'active',
  delete_rule text not null default 'cascade',
  sort_order integer not null default 0,

  -- Open metadata bag for future extension
  metadata jsonb not null default '{}'::jsonb,

  -- Soft delete support
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- Unique constraint: prevent duplicate relationships
  unique (source_board_id, source_record_id, source_column_id, target_board_id, target_record_id)
);

-- ── Indexes ─────────────────────────────────────────────────

-- Fast lookup by source record (for Mirror/Lookup/Rollup resolution)
create index if not exists relationships_source_idx
  on public.relationships (source_board_id, source_record_id, source_column_id)
  where is_active = true;

-- Fast lookup by target record (for reverse relationship traversal)
create index if not exists relationships_target_idx
  on public.relationships (target_board_id, target_record_id)
  where is_active = true;

-- Fast lookup by column (for dependency graph building)
create index if not exists relationships_column_idx
  on public.relationships (source_column_id)
  where is_active = true;

-- Fast lookup by board (for relationship picker)
create index if not exists relationships_board_idx
  on public.relationships (source_board_id)
  where is_active = true;

-- ── Derived Value Cache Table ───────────────────────────────
-- Mirrors the cell_values pattern but specifically for derived columns.
-- This is a CACHE, not the source of truth. The source of truth is
-- the relationship + source column value. If a derived value is missing,
-- the Query Service recomputes it on read.
-- ────────────────────────────────────────────────────────────

drop table if exists public.derived_values cascade;
create table if not exists public.derived_values (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  record_id text not null references public.records(id) on delete cascade,
  column_id text not null references public.columns(id) on delete cascade,
  value jsonb,
  value_text text not null default '',
  version integer not null default 1,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, record_id, column_id)
);

create index if not exists derived_values_board_record_idx
  on public.derived_values (board_id, record_id);

create index if not exists derived_values_column_idx
  on public.derived_values (column_id);

-- ── Dependency Graph Cache Table ────────────────────────────
-- Denormalized cache of the dependency graph for fast traversal.
-- Rebuilt when columns are added/removed or relationship config changes.
-- ────────────────────────────────────────────────────────────

drop table if exists public.dependency_graph_edges cascade;
create table if not exists public.dependency_graph_edges (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  source_column_id text not null references public.columns(id) on delete cascade,
  target_column_id text not null references public.columns(id) on delete cascade,
  dependency_type text not null,
  relationship_id text references public.relationships(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (board_id, source_column_id, target_column_id, dependency_type)
);

create index if not exists dependency_graph_source_idx
  on public.dependency_graph_edges (source_column_id);

create index if not exists dependency_graph_target_idx
  on public.dependency_graph_edges (target_column_id);

-- ── RLS Policies ────────────────────────────────────────────

alter table public.relationships enable row level security;
alter table public.derived_values enable row level security;
alter table public.dependency_graph_edges enable row level security;

-- Organization-scoped access
drop policy if exists "relationships_org_access" on public.relationships;
create policy "relationships_org_access" on public.relationships
  using (organization_id in (
    select organization_id from public.workspaces w
    inner join public.workspace_members wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
  ));

drop policy if exists "derived_values_org_access" on public.derived_values;
create policy "derived_values_org_access" on public.derived_values
  using (organization_id in (
    select organization_id from public.workspaces w
    inner join public.workspace_members wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
  ));

drop policy if exists "dependency_graph_org_access" on public.dependency_graph_edges;
create policy "dependency_graph_org_access" on public.dependency_graph_edges
  using (organization_id in (
    select organization_id from public.workspaces w
    inner join public.workspace_members wm on wm.workspace_id = w.id
    where wm.user_id = auth.uid()
  ));

