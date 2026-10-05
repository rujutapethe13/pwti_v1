create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  status text not null default 'active',
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.boards (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  template_id text,
  icon text,
  favorite boolean not null default false,
  pinned boolean not null default false,
  visibility text not null default 'workspace',
  status text not null default 'active',
  shared_with text[] not null default '{owner,editor,viewer}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.groups (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  parent_group_id text references public.groups(id) on delete set null,
  name text not null,
  color text,
  collapsed boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.columns (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  type text not null,
  required boolean not null default false,
  hidden boolean not null default false,
  frozen boolean not null default false,
  default_value jsonb,
  settings jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{"view":["owner","editor","commenter","viewer"],"edit":["owner","editor"],"configure":["owner"]}'::jsonb,
  validation jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, key)
);

create table if not exists public.records (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  group_id text references public.groups(id) on delete set null,
  title text not null,
  status text not null default 'active',
  version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cell_values (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  record_id text not null references public.records(id) on delete cascade,
  column_id text not null references public.columns(id) on delete cascade,
  value jsonb,
  value_text text not null default '',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (board_id, record_id, column_id)
);

create table if not exists public.views (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  name text not null,
  description text,
  type text not null,
  visibility text not null default 'shared',
  filters jsonb not null default '[]'::jsonb,
  sorting jsonb not null default '[]'::jsonb,
  grouping jsonb not null default '[]'::jsonb,
  visible_column_ids text[] not null default '{}'::text[],
  column_widths jsonb not null default '{}'::jsonb,
   row_height integer not null default 40,
   settings jsonb not null default '{}'::jsonb,
   personal_owner_user_id text,
  shared_with text[] not null default '{owner,editor,commenter,viewer}',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.column_dependencies (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  source_column_id text not null references public.columns(id) on delete cascade,
  target_board_id text references public.boards(id) on delete cascade,
  target_column_id text not null references public.columns(id) on delete cascade,
  relation text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  scope text not null,
  role text not null,
  subject text not null,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_index (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  record_id text not null references public.records(id) on delete cascade,
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, record_id)
);

create index if not exists boards_workspace_id_idx on public.boards (workspace_id);
create index if not exists columns_board_id_idx on public.columns (board_id, sort_order);
create index if not exists records_board_id_idx on public.records (board_id, created_at);
create index if not exists cell_values_board_record_idx on public.cell_values (board_id, record_id);
create index if not exists views_board_id_idx on public.views (board_id, sort_order);
create index if not exists search_index_board_id_idx on public.search_index (board_id, record_id);