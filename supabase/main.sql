create extension if not exists pgcrypto;

drop table if exists public.organizations cascade;
create table if not exists public.organizations (
  id text primary key,
  name text not null,
  status text not null default 'active',
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop table if exists public.workspaces cascade;
create table if not exists public.workspaces (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists workspaces_created_by_idx on public.workspaces (created_by);

drop table if exists public.boards cascade;
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
  primary_column_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

drop table if exists public.groups cascade;
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
  status_options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop table if exists public.columns cascade;
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

drop table if exists public.records cascade;
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

drop table if exists public.cell_values cascade;
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

drop table if exists public.views cascade;
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

drop table if exists public.column_dependencies cascade;
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

drop table if exists public.permissions cascade;
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

drop table if exists public.search_index cascade;
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

drop index if exists boards_workspace_id_idx;
create index if not exists boards_workspace_id_idx on public.boards (workspace_id);
drop index if exists columns_board_id_idx;
create index if not exists columns_board_id_idx on public.columns (board_id, sort_order);
drop index if exists records_board_id_idx;
create index if not exists records_board_id_idx on public.records (board_id, created_at);
drop index if exists cell_values_board_record_idx;
create index if not exists cell_values_board_record_idx on public.cell_values (board_id, record_id);
drop index if exists views_board_id_idx;
create index if not exists views_board_id_idx on public.views (board_id, sort_order);
drop index if exists search_index_board_id_idx;
create index if not exists search_index_board_id_idx on public.search_index (board_id, record_id);

drop index if exists cell_values_record_id_idx;
create index if not exists cell_values_record_id_idx on public.cell_values (record_id);

drop index if exists cell_values_column_id_idx;
create index if not exists cell_values_column_id_idx on public.cell_values (column_id);

drop index if exists records_status_idx;
create index if not exists records_status_idx on public.records (status);

drop index if exists records_group_id_idx;
create index if not exists records_group_id_idx on public.records (group_id);

drop index if exists groups_board_id_idx;
create index if not exists groups_board_id_idx on public.groups (board_id);

drop index if exists groups_parent_group_id_idx;
create index if not exists groups_parent_group_id_idx on public.groups (parent_group_id);

drop index if exists columns_organization_id_idx;
create index if not exists columns_organization_id_idx on public.columns (organization_id);

drop index if exists records_organization_id_idx;
create index if not exists records_organization_id_idx on public.records (organization_id);

drop index if exists cell_values_organization_id_idx;
create index if not exists cell_values_organization_id_idx on public.cell_values (organization_id);

drop index if exists views_organization_id_idx;
create index if not exists views_organization_id_idx on public.views (organization_id);

drop index if exists groups_organization_id_idx;
create index if not exists groups_organization_id_idx on public.groups (organization_id);

drop index if exists boards_organization_id_idx;
create index if not exists boards_organization_id_idx on public.boards (organization_id);

drop index if exists records_board_id_status_idx;
create index if not exists records_board_id_status_idx on public.records (board_id, status);

drop index if exists cell_values_board_id_record_id_column_id_idx;
create index if not exists cell_values_board_id_record_id_column_id_idx on public.cell_values (board_id, record_id, column_id);



drop table if exists public.relationships cascade;
create table if not exists public.relationships (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,

  source_board_id text not null references public.boards(id) on delete cascade,
  source_record_id text not null references public.records(id) on delete cascade,
  source_column_id text not null references public.columns(id) on delete cascade,

  target_board_id text not null references public.boards(id) on delete cascade,
  target_record_id text not null references public.records(id) on delete cascade,

  relationship_type text not null default 'one_to_many',
  direction text not null default 'forward',
  label text not null default '',
  status text not null default 'active',
  delete_rule text not null default 'cascade',
  sort_order integer not null default 0,

  metadata jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  unique (source_board_id, source_record_id, source_column_id, target_board_id, target_record_id)
);


create index if not exists relationships_source_idx
  on public.relationships (source_board_id, source_record_id, source_column_id)
  where is_active = true;

create index if not exists relationships_target_idx
  on public.relationships (target_board_id, target_record_id)
  where is_active = true;

create index if not exists relationships_column_idx
  on public.relationships (source_column_id)
  where is_active = true;

create index if not exists relationships_board_idx
  on public.relationships (source_board_id)
  where is_active = true;


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


alter table public.relationships enable row level security;
alter table public.derived_values enable row level security;
alter table public.dependency_graph_edges enable row level security;





drop table if exists public.teams cascade;
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


drop table if exists public.departments cascade;
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


drop index if exists teams_workspace_id_idx;
create index if not exists teams_workspace_id_idx on public.teams (workspace_id);
drop index if exists teams_organization_id_idx;
create index if not exists teams_organization_id_idx on public.teams (organization_id);
drop index if exists departments_team_id_idx;
create index if not exists departments_team_id_idx on public.departments (team_id);
drop index if exists departments_workspace_id_idx;
create index if not exists departments_workspace_id_idx on public.departments (workspace_id);


create or replace function public.sync_team_containment()
returns trigger as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    new.organization_id := (select organization_id from public.workspaces where id = new.workspace_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.sync_department_containment()
returns trigger as $$
begin
  if new.team_id is distinct from old.team_id then
    new.workspace_id := (select workspace_id from public.teams where id = new.team_id);
    new.organization_id := (select organization_id from public.workspaces where id = new.workspace_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_teams_sync_containment on public.teams;
create trigger trg_teams_sync_containment
  before update on public.teams
  for each row
  when (old.workspace_id is distinct from new.workspace_id)
  execute function public.sync_team_containment();

drop trigger if exists trg_departments_sync_containment on public.departments;
create trigger trg_departments_sync_containment
  before update on public.departments
  for each row
  when (old.team_id is distinct from new.team_id)
  execute function public.sync_department_containment();





drop table if exists public.roles cascade;
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text references public.organizations(id) on delete cascade,
  name text not null,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.check_role_org_consistency()
returns trigger as $$
begin
  if new.is_system_role = true and new.organization_id is not null then
    raise exception 'System roles must have organization_id = null';
  end if;
  if new.is_system_role = false and new.organization_id is null then
    raise exception 'Custom roles must have an organization_id';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_roles_org_consistency on public.roles;
create trigger trg_roles_org_consistency
  before insert or update on public.roles
  for each row
  execute function public.check_role_org_consistency();

drop index if exists roles_organization_id_idx;
create index if not exists roles_organization_id_idx on public.roles (organization_id);


drop table if exists public.workspace_members cascade;
create table if not exists public.workspace_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

drop index if exists workspace_members_workspace_id_idx;
create index if not exists workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
drop index if exists workspace_members_role_id_idx;
create index if not exists workspace_members_role_id_idx on public.workspace_members (role_id);


drop table if exists public.team_members cascade;
create table if not exists public.team_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

drop index if exists team_members_team_id_idx;
create index if not exists team_members_team_id_idx on public.team_members (team_id);


insert into public.roles (id, organization_id, name, is_system_role) values
  ('00000000-0000-0000-0000-000000000001', null, 'Owner', true),
  ('00000000-0000-0000-0000-000000000002', null, 'Administrator', true),
  ('00000000-0000-0000-0000-000000000003', null, 'Manager', true),
  ('00000000-0000-0000-0000-000000000004', null, 'Supervisor', true),
  ('00000000-0000-0000-0000-000000000005', null, 'Employee', true),
  ('00000000-0000-0000-0000-000000000006', null, 'Viewer', true)
on conflict (id) do nothing;





do $$ begin
  create type public.resource_type as enum (
    'workspace',
    'board',
    'group',
    'column',
    'record',
    'view',
    'dashboard',
    'widget',
    'relationship',
    'formula',
    'automation',    -- stub: no enforcement logic yet; placeholder for future layers
    'ai'             -- stub: no enforcement logic yet; placeholder for future layers
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.permission_action as enum (
    'view',
    'create',
    'edit',
    'delete',
    'comment',
    'export',
    'share',
    'manage'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.grant_effect as enum (
    'allow',
    'deny'
  );
exception
  when duplicate_object then null;
end $$;


drop table if exists public.permission_grants cascade;
create table if not exists public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  resource_type public.resource_type not null,
  resource_id text,  -- null means "applies to all resources of this type in this workspace"
  action public.permission_action not null,
  effect public.grant_effect not null default 'allow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint permission_grants_xor_assignee
    check ((role_id is not null) <> (user_id is not null))
);

create index if not exists permission_grants_lookup_idx
  on public.permission_grants (workspace_id, resource_type, resource_id, role_id, user_id);

drop index if exists permission_grants_role_id_idx;
create index if not exists permission_grants_role_id_idx on public.permission_grants (role_id);
drop index if exists permission_grants_user_id_idx;
create index if not exists permission_grants_user_id_idx on public.permission_grants (user_id);


create or replace function public.update_permission_grants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_permission_grants_updated_at on public.permission_grants;
create trigger trg_permission_grants_updated_at
  before update on public.permission_grants
  for each row
  execute function public.update_permission_grants_updated_at();




do $$ begin
  create type public.column_visibility as enum (
    'hidden',
    'read_only',
    'editable'
  );
exception
  when duplicate_object then null;
end $$;


drop table if exists public.column_visibility_rules cascade;
create table if not exists public.column_visibility_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  column_id text not null references public.columns(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  visibility public.column_visibility not null,

  visibility_condition jsonb,

  created_at timestamptz not null default now(),

  constraint column_visibility_xor_assignee
    check ((role_id is not null) <> (user_id is not null)),

  unique (column_id, role_id, user_id)
);

create index if not exists column_visibility_rules_board_idx
  on public.column_visibility_rules (board_id, column_id);

create index if not exists column_visibility_rules_workspace_idx
  on public.column_visibility_rules (workspace_id);




do $$ begin
  create type public.invitation_status as enum (
    'pending',
    'accepted',
    'revoked',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;


drop table if exists public.invitations cascade;
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  token text not null,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

drop index if exists invitations_token_idx;
create unique index if not exists invitations_token_idx on public.invitations (token);
drop index if exists invitations_email_idx;
create index if not exists invitations_email_idx on public.invitations (lower(email));
drop index if exists invitations_workspace_idx;
create index if not exists invitations_workspace_idx on public.invitations (workspace_id);
drop index if exists invitations_status_idx;
create index if not exists invitations_status_idx on public.invitations (status);

alter table public.invitations drop constraint if exists invitations_token_not_null;
alter table public.invitations add constraint invitations_token_not_null
  check (token is not null and token <> '');





drop table if exists public.audit_log cascade;
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references public.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,  -- null = system-generated
  action text not null,  -- e.g. 'login', 'permission.grant.updated', 'invite.accepted'
  resource_type text,     -- optional, e.g. 'board', 'permission_grant'
  resource_id text,       -- optional UUID or text identifier
  metadata jsonb,         -- before/after values, IP address, user-agent, etc.
  created_at timestamptz not null default now()
);

create index if not exists audit_log_workspace_created_idx
  on public.audit_log (workspace_id, created_at desc);

create index if not exists audit_log_actor_created_idx
  on public.audit_log (actor_id, created_at desc);

create index if not exists audit_log_action_idx
  on public.audit_log (action);






create or replace function public.check_permission_manage(
  p_workspace_id text,
  p_resource_type public.resource_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    inner join public.permission_grants pg
      on pg.workspace_id = wm.workspace_id
      and pg.role_id = wm.role_id
      and pg.resource_type = p_resource_type
      and pg.action = 'manage'
      and pg.effect = 'allow'
    where wm.user_id = auth.uid()
      and wm.workspace_id = p_workspace_id
    union
    select 1
    from public.permission_grants pg
    where pg.workspace_id = p_workspace_id
      and pg.user_id = auth.uid()
      and pg.resource_type = p_resource_type
      and pg.action = 'manage'
      and pg.effect = 'allow'
  );
$$;


create or replace function public.is_workspace_member(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where user_id = auth.uid() and workspace_id = p_workspace_id
  );
$$;


create or replace function public.onboard_workspace_owner(p_workspace_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_role_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Only the creator may be onboarded as owner.
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and created_by = v_user_id
  ) then
    raise exception 'not the workspace creator';
  end if;

  select id into v_owner_role_id
  from public.roles
  where name = 'Owner' and is_system_role = true
  limit 1;

  if v_owner_role_id is null then
    raise exception 'Owner role not found';
  end if;

  insert into public.workspace_members (user_id, workspace_id, role_id)
  values (v_user_id, p_workspace_id, v_owner_role_id)
  on conflict (user_id, workspace_id) do nothing;

  insert into public.permission_grants (workspace_id, role_id, resource_type, resource_id, action, effect)
  select p_workspace_id, v_owner_role_id, rt, null, 'manage', 'allow'
  from unnest(
    array['workspace','board','group','column','record','view','dashboard',
          'widget','relationship','formula','automation','ai']::public.resource_type[]
  ) as rt
  on conflict do nothing;
end;
$$;


alter table public.teams enable row level security;

drop policy if exists "teams_select_workspace_member" on public.teams;


drop policy if exists "teams_select_workspace_member" on public.teams;
create policy "teams_select_workspace_member" on public.teams
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "teams_manage_permission" on public.teams;


drop policy if exists "teams_manage_permission" on public.teams;
create policy "teams_manage_permission" on public.teams
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "teams_manage_permission_update" on public.teams;


drop policy if exists "teams_manage_permission_update" on public.teams;
create policy "teams_manage_permission_update" on public.teams
  for update
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "teams_manage_permission_delete" on public.teams;


drop policy if exists "teams_manage_permission_delete" on public.teams;
create policy "teams_manage_permission_delete" on public.teams
  for delete
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );


alter table public.departments enable row level security;

drop policy if exists "departments_select_workspace_member" on public.departments;


drop policy if exists "departments_select_workspace_member" on public.departments;
create policy "departments_select_workspace_member" on public.departments
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "departments_manage_permission_insert" on public.departments;


drop policy if exists "departments_manage_permission_insert" on public.departments;
create policy "departments_manage_permission_insert" on public.departments
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "departments_manage_permission_update" on public.departments;


drop policy if exists "departments_manage_permission_update" on public.departments;
create policy "departments_manage_permission_update" on public.departments
  for update
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "departments_manage_permission_delete" on public.departments;


drop policy if exists "departments_manage_permission_delete" on public.departments;
create policy "departments_manage_permission_delete" on public.departments
  for delete
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );


alter table public.roles enable row level security;

drop policy if exists "roles_select_authenticated" on public.roles;


drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated" on public.roles
  for select
  using (
    is_system_role = true
    or organization_id in (
      select w.organization_id
      from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = auth.uid()
    )
  );

drop policy if exists "roles_insert_manage" on public.roles;


drop policy if exists "roles_insert_manage" on public.roles;
create policy "roles_insert_manage" on public.roles
  for insert
  with check (
    is_system_role = false
    and exists (
      select 1 from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.action = 'manage' and pg.effect = 'allow'
      where wm.user_id = auth.uid()
        and w.organization_id = roles.organization_id
    )
  );

drop policy if exists "roles_update_delete_manage" on public.roles;


drop policy if exists "roles_update_delete_manage" on public.roles;
create policy "roles_update_delete_manage" on public.roles
  for update
  using (
    is_system_role = false
    and exists (
      select 1 from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.action = 'manage' and pg.effect = 'allow'
      where wm.user_id = auth.uid()
        and w.organization_id = roles.organization_id
    )
  );

drop policy if exists "roles_update_delete_manage_delete" on public.roles;


drop policy if exists "roles_update_delete_manage_delete" on public.roles;
create policy "roles_update_delete_manage_delete" on public.roles
  for delete
  using (
    is_system_role = false
    and exists (
      select 1 from public.workspace_members wm
      inner join public.workspaces w on w.id = wm.workspace_id
      inner join public.permission_grants pg
        on pg.workspace_id = wm.workspace_id
        and pg.role_id = wm.role_id
        and pg.action = 'manage' and pg.effect = 'allow'
      where wm.user_id = auth.uid()
        and w.organization_id = roles.organization_id
    )
  );


alter table public.workspace_members enable row level security;

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_manage" on public.workspace_members;


drop policy if exists "workspace_members_insert_manage" on public.workspace_members;
create policy "workspace_members_insert_manage" on public.workspace_members
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "workspace_members_update_manage" on public.workspace_members;


drop policy if exists "workspace_members_update_manage" on public.workspace_members;
create policy "workspace_members_update_manage" on public.workspace_members
  for update
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "workspace_members_delete_manage" on public.workspace_members;


drop policy if exists "workspace_members_delete_manage" on public.workspace_members;
create policy "workspace_members_delete_manage" on public.workspace_members
  for delete
  using (
    public.check_permission_manage(workspace_id, 'workspace')
  );


alter table public.team_members enable row level security;

drop policy if exists "team_members_select" on public.team_members;


drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members
  for select
  using (
    team_id in (
      select t.id from public.teams t
      where public.is_workspace_member(t.workspace_id)
    )
  );

drop policy if exists "team_members_insert_manage" on public.team_members;


drop policy if exists "team_members_insert_manage" on public.team_members;
create policy "team_members_insert_manage" on public.team_members
  for insert
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.check_permission_manage(t.workspace_id, 'workspace')
    )
  );

drop policy if exists "team_members_update_manage" on public.team_members;


drop policy if exists "team_members_update_manage" on public.team_members;
create policy "team_members_update_manage" on public.team_members
  for update
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.check_permission_manage(t.workspace_id, 'workspace')
    )
  );

drop policy if exists "team_members_delete_manage" on public.team_members;


drop policy if exists "team_members_delete_manage" on public.team_members;
create policy "team_members_delete_manage" on public.team_members
  for delete
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_id
        and public.check_permission_manage(t.workspace_id, 'workspace')
    )
  );


alter table public.permission_grants enable row level security;

drop policy if exists "permission_grants_select" on public.permission_grants;


drop policy if exists "permission_grants_select" on public.permission_grants;
create policy "permission_grants_select" on public.permission_grants
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "permission_grants_insert_manage" on public.permission_grants;


drop policy if exists "permission_grants_insert_manage" on public.permission_grants;
create policy "permission_grants_insert_manage" on public.permission_grants
  for insert
  with check (
    public.check_permission_manage(workspace_id, resource_type)
  );

drop policy if exists "permission_grants_update_manage" on public.permission_grants;


drop policy if exists "permission_grants_update_manage" on public.permission_grants;
create policy "permission_grants_update_manage" on public.permission_grants
  for update
  using (
    public.check_permission_manage(workspace_id, resource_type)
  );

drop policy if exists "permission_grants_delete_manage" on public.permission_grants;


drop policy if exists "permission_grants_delete_manage" on public.permission_grants;
create policy "permission_grants_delete_manage" on public.permission_grants
  for delete
  using (
    public.check_permission_manage(workspace_id, resource_type)
  );


alter table public.column_visibility_rules enable row level security;

drop policy if exists "column_visibility_rules_select" on public.column_visibility_rules;


drop policy if exists "column_visibility_rules_select" on public.column_visibility_rules;
create policy "column_visibility_rules_select" on public.column_visibility_rules
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "column_visibility_rules_insert_manage" on public.column_visibility_rules;


drop policy if exists "column_visibility_rules_insert_manage" on public.column_visibility_rules;
create policy "column_visibility_rules_insert_manage" on public.column_visibility_rules
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'board')
  );

drop policy if exists "column_visibility_rules_update_manage" on public.column_visibility_rules;


drop policy if exists "column_visibility_rules_update_manage" on public.column_visibility_rules;
create policy "column_visibility_rules_update_manage" on public.column_visibility_rules
  for update
  using (
    public.check_permission_manage(workspace_id, 'board')
  );

drop policy if exists "column_visibility_rules_delete_manage" on public.column_visibility_rules;


drop policy if exists "column_visibility_rules_delete_manage" on public.column_visibility_rules;
create policy "column_visibility_rules_delete_manage" on public.column_visibility_rules
  for delete
  using (
    public.check_permission_manage(workspace_id, 'board')
  );


alter table public.invitations enable row level security;

drop policy if exists "invitations_select" on public.invitations;


drop policy if exists "invitations_select" on public.invitations;
create policy "invitations_select" on public.invitations
  for select
  using (
    (
      public.is_workspace_member(workspace_id)
      and public.check_permission_manage(workspace_id, 'workspace')
    )
    or (
      lower(email) = lower(auth.email()::text)
      and status = 'pending'
    )
  );

drop policy if exists "invitations_insert_manage" on public.invitations;


drop policy if exists "invitations_insert_manage" on public.invitations;
create policy "invitations_insert_manage" on public.invitations
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.check_permission_manage(workspace_id, 'workspace')
  );

drop policy if exists "invitations_update" on public.invitations;


drop policy if exists "invitations_update" on public.invitations;
create policy "invitations_update" on public.invitations
  for update
  using (
    (
      public.is_workspace_member(workspace_id)
      and public.check_permission_manage(workspace_id, 'workspace')
    )
    or (
      lower(email) = lower(auth.email()::text)
      and status = 'pending'
    )
  );

drop policy if exists "invitations_delete_manage" on public.invitations;


drop policy if exists "invitations_delete_manage" on public.invitations;
create policy "invitations_delete_manage" on public.invitations
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.check_permission_manage(workspace_id, 'workspace')
  );


alter table public.audit_log enable row level security;

drop policy if exists "audit_log_insert_all" on public.audit_log;


drop policy if exists "audit_log_insert_all" on public.audit_log;
create policy "audit_log_insert_all" on public.audit_log
  for insert
  with check (true);

drop policy if exists "audit_log_select_workspace_scoped" on public.audit_log;


drop policy if exists "audit_log_select_workspace_scoped" on public.audit_log;
create policy "audit_log_select_workspace_scoped" on public.audit_log
  for select
  using (
    workspace_id is null
    and exists (
      select 1 from public.workspace_members where user_id = auth.uid()
    )
    or (
      workspace_id is not null
      and public.is_workspace_member(workspace_id)
      and exists (
        select 1 from public.workspace_members wm
        inner join public.permission_grants pg
          on pg.workspace_id = wm.workspace_id
          and pg.role_id = wm.role_id
          and pg.action in ('view', 'manage')
          and pg.resource_type = 'workspace'
          and pg.effect = 'allow'
        where wm.user_id = auth.uid()
          and wm.workspace_id = audit_log.workspace_id
      )
    )
  );


drop policy if exists "relationships_select_workspace_member" on public.relationships;



drop policy if exists "relationships_select_workspace_member" on public.relationships;
create policy "relationships_select_workspace_member" on public.relationships
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "derived_values_select_workspace_member" on public.derived_values;


drop policy if exists "derived_values_select_workspace_member" on public.derived_values;
create policy "derived_values_select_workspace_member" on public.derived_values
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "dependency_graph_select_workspace_member" on public.dependency_graph_edges;


drop policy if exists "dependency_graph_select_workspace_member" on public.dependency_graph_edges;
create policy "dependency_graph_select_workspace_member" on public.dependency_graph_edges
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "relationships_insert_manage" on public.relationships;


drop policy if exists "relationships_insert_manage" on public.relationships;
create policy "relationships_insert_manage" on public.relationships
  for insert
  with check (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "relationships_update_manage" on public.relationships;


drop policy if exists "relationships_update_manage" on public.relationships;
create policy "relationships_update_manage" on public.relationships
  for update
  using (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "relationships_delete_manage" on public.relationships;


drop policy if exists "relationships_delete_manage" on public.relationships;
create policy "relationships_delete_manage" on public.relationships
  for delete
  using (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "derived_values_insert_manage" on public.derived_values;


drop policy if exists "derived_values_insert_manage" on public.derived_values;
create policy "derived_values_insert_manage" on public.derived_values
  for insert
  with check (public.check_permission_manage(workspace_id, 'record'));

drop policy if exists "derived_values_update_manage" on public.derived_values;


drop policy if exists "derived_values_update_manage" on public.derived_values;
create policy "derived_values_update_manage" on public.derived_values
  for update
  using (public.check_permission_manage(workspace_id, 'record'));

drop policy if exists "derived_values_delete_manage" on public.derived_values;


drop policy if exists "derived_values_delete_manage" on public.derived_values;
create policy "derived_values_delete_manage" on public.derived_values
  for delete
  using (public.check_permission_manage(workspace_id, 'record'));

drop policy if exists "dependency_graph_insert_manage" on public.dependency_graph_edges;


drop policy if exists "dependency_graph_insert_manage" on public.dependency_graph_edges;
create policy "dependency_graph_insert_manage" on public.dependency_graph_edges
  for insert
  with check (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "dependency_graph_update_manage" on public.dependency_graph_edges;


drop policy if exists "dependency_graph_update_manage" on public.dependency_graph_edges;
create policy "dependency_graph_update_manage" on public.dependency_graph_edges
  for update
  using (public.check_permission_manage(workspace_id, 'relationship'));

drop policy if exists "dependency_graph_delete_manage" on public.dependency_graph_edges;


drop policy if exists "dependency_graph_delete_manage" on public.dependency_graph_edges;
create policy "dependency_graph_delete_manage" on public.dependency_graph_edges
  for delete
  using (public.check_permission_manage(workspace_id, 'relationship'));






do $$ begin
  create type public.widget_type as enum (
    'kpi_card',
    'bar_chart',
    'line_chart',
    'table',
    'progress_ring',
    'chart_horizontal_bar',
    'chart_stacked_bar',
    'chart_grouped_bar',
    'chart_spline',
    'chart_area',
    'chart_stacked_area',
    'chart_pie',
    'chart_donut',
    'chart_scatter',
    'chart_radar',
    'chart_funnel',
    'chart_gauge',
    'chart_battery',

    'calendar',
    'recent_activity',
    'ai_summary',
    'custom_widget'
  );
exception
  when duplicate_object then null;
end $$;


drop table if exists public.dashboard_widgets cascade;
create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id    text not null references public.workspaces(id) on delete cascade,
  dashboard_id    text not null,   -- FK to dashboards table (external)

  widget_type  public.widget_type not null,
  title        text not null default 'Untitled Widget',

  position jsonb not null default '{"x":0,"y":0,"w":4,"h":3}'::jsonb,

  config jsonb not null default '{}'::jsonb,

  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create index if not exists dashboard_widgets_dashboard_id_idx
  on public.dashboard_widgets (dashboard_id);

create index if not exists dashboard_widgets_workspace_id_idx
  on public.dashboard_widgets (workspace_id);

create index if not exists dashboard_widgets_widget_type_idx
  on public.dashboard_widgets (widget_type);


create or replace function public.update_dashboard_widgets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dashboard_widgets_updated_at on public.dashboard_widgets;
create trigger trg_dashboard_widgets_updated_at
  before update on public.dashboard_widgets
  for each row
  execute function public.update_dashboard_widgets_updated_at();


alter table public.dashboard_widgets enable row level security;

drop policy if exists "dashboard_widgets_select_workspace_member" on public.dashboard_widgets;


drop policy if exists "dashboard_widgets_select_workspace_member" on public.dashboard_widgets;
create policy "dashboard_widgets_select_workspace_member" on public.dashboard_widgets
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "dashboard_widgets_insert_manage" on public.dashboard_widgets;


drop policy if exists "dashboard_widgets_insert_manage" on public.dashboard_widgets;
create policy "dashboard_widgets_insert_manage" on public.dashboard_widgets
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'dashboard')
  );

drop policy if exists "dashboard_widgets_update_manage" on public.dashboard_widgets;


drop policy if exists "dashboard_widgets_update_manage" on public.dashboard_widgets;
create policy "dashboard_widgets_update_manage" on public.dashboard_widgets
  for update
  using (
    public.check_permission_manage(workspace_id, 'dashboard')
  );

drop policy if exists "dashboard_widgets_delete_manage" on public.dashboard_widgets;


drop policy if exists "dashboard_widgets_delete_manage" on public.dashboard_widgets;
create policy "dashboard_widgets_delete_manage" on public.dashboard_widgets
  for delete
  using (
    public.check_permission_manage(workspace_id, 'dashboard')
  );


create or replace function public.can_user(
  p_user_id uuid,
  p_action public.permission_action,
  p_resource_type public.resource_type,
  p_resource_id text default null,
  p_workspace_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id text;
begin
  if p_workspace_id is null then
    select wm.workspace_id into v_workspace_id
    from public.workspace_members wm
    where wm.user_id = p_user_id
    limit 1;

    if v_workspace_id is null then
      return false; -- User has no workspace memberships
    end if;
  else
    v_workspace_id := p_workspace_id;
  end if;

  v_user_id := p_user_id::text;

  if exists (
    select 1 from public.permission_grants
    where workspace_id = v_workspace_id
      and user_id = p_user_id
      and resource_type = p_resource_type
      and (resource_id = p_resource_id or (resource_id is null and p_resource_id is null))
      and action = p_action
      and effect = 'deny'
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.permission_grants
    where workspace_id = v_workspace_id
      and user_id = p_user_id
      and resource_type = p_resource_type
      and (resource_id = p_resource_id or (resource_id is null and p_resource_id is null))
      and action = p_action
      and effect = 'allow'
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.workspace_members wm
    inner join public.permission_grants pg
      on pg.workspace_id = wm.workspace_id
      and pg.role_id = wm.role_id
      and pg.resource_type = p_resource_type
      and (pg.resource_id = p_resource_id or (pg.resource_id is null and p_resource_id is null))
      and pg.action = p_action
      and pg.effect = 'deny'
    where wm.user_id = p_user_id
      and wm.workspace_id = v_workspace_id
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.workspace_members wm
    inner join public.permission_grants pg
      on pg.workspace_id = wm.workspace_id
      and pg.role_id = wm.role_id
      and pg.resource_type = p_resource_type
      and (pg.resource_id = p_resource_id or (pg.resource_id is null and p_resource_id is null))
      and pg.action = p_action
      and pg.effect = 'allow'
    where wm.user_id = p_user_id
      and wm.workspace_id = v_workspace_id
  ) then
    return true;
  end if;

  return false;
end;
$$;





do $$ begin
  alter type public.resource_type add value if not exists 'folder';
exception
  when duplicate_object then null;
  when others then null;
end $$;


drop table if exists public.folders cascade;
create table if not exists public.folders (
  id text primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

drop index if exists folders_workspace_id_idx;
create index if not exists folders_workspace_id_idx on public.folders (workspace_id, position);


create or replace function public.update_folders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_folders_updated_at on public.folders;
create trigger trg_folders_updated_at
  before update on public.folders
  for each row
  execute function public.update_folders_updated_at();


alter table public.boards
  add column if not exists folder_id text references public.folders(id) on delete set null;

drop index if exists boards_folder_id_idx;
create index if not exists boards_folder_id_idx on public.boards (folder_id);


alter table public.folders enable row level security;

drop policy if exists "folders_select_workspace_member" on public.folders;


drop policy if exists "folders_select_workspace_member" on public.folders;
create policy "folders_select_workspace_member" on public.folders
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

drop policy if exists "folders_insert_manage" on public.folders;


drop policy if exists "folders_insert_manage" on public.folders;
create policy "folders_insert_manage" on public.folders
  for insert
  with check (
    public.check_permission_manage(workspace_id, 'folder')
  );

drop policy if exists "folders_update_manage" on public.folders;


drop policy if exists "folders_update_manage" on public.folders;
create policy "folders_update_manage" on public.folders
  for update
  using (
    public.check_permission_manage(workspace_id, 'folder')
  );

drop policy if exists "folders_delete_manage" on public.folders;


drop policy if exists "folders_delete_manage" on public.folders;
create policy "folders_delete_manage" on public.folders
  for delete
  using (
    public.check_permission_manage(workspace_id, 'folder')
  );




insert into public.organizations (id, name, status, plan) values
  ('org-acme', 'Acme Corp', 'active', 'business')
on conflict (id) do nothing;

insert into public.workspaces (id, organization_id, name, slug, description, status) values
  ('ws-design', 'org-acme', 'Design Team', 'design', 'Creative design workspace', 'active'),
  ('ws-eng', 'org-acme', 'Engineering', 'engineering', 'Software engineering workspace', 'active')
on conflict (id) do nothing;





-- Memberships / permission grants require a REAL auth user. The previous
-- seed used fake non-UUID user ids ('a','b','c') which violate the FK to
-- auth.users(id) and would abort the migration. To wire up memberships for a
-- real user, run this after the setup and replace <AUTH_USER_UUID> with the
-- user's auth.uid():

--   do $$
--   declare
--     v_owner_role_id uuid;
--     v_real_user uuid := '<AUTH_USER_UUID>';
--   begin
--     select id into v_owner_role_id from public.roles
--     where name = 'Owner' and is_system_role = true limit 1;
--
--     insert into public.workspace_members (user_id, workspace_id, role_id)
--     select v_real_user, w.id, v_owner_role_id
--     from public.workspaces w
--     on conflict (user_id, workspace_id) do nothing;
--
--     insert into public.permission_grants (workspace_id, role_id, resource_type, resource_id, action, effect)
--     select w.id, v_owner_role_id, rt, null, 'manage', 'allow'
--     from public.workspaces w
--     cross join unnest(
--       array['workspace','board','group','column','record','view','dashboard',
--             'widget','relationship','formula','automation','ai']::public.resource_type[]
--     ) as rt
--     on conflict do nothing;
--   end $$;



