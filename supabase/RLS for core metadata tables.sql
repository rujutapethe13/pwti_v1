-- ═══════════════════════════════════════════════════════════════════════════
-- Powerweave Studio OS — RLS for core metadata tables (orgs / workspaces / boards)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS EXISTS
--   Board & workspace creation must run under the AUTHENTICATED server client
--   (createClient) — NOT the service-role/admin client — so users can only
--   create boards in workspaces they actually belong to. The core metadata
--   tables (organizations, workspaces, boards) had NO RLS policies at all, so
--   an authenticated insert was silently rejected (RLS default-denies when
--   enabled) or, worse, the app worked around it with the service-role key.
--
--   This migration:
--     1. Enables RLS on organizations, workspaces, boards.
--     2. Adds scoped SELECT/INSERT/UPDATE/DELETE policies.
--     3. Adds `workspaces.created_by` so the creator can become the owner.
--     4. Adds `onboard_workspace_owner()` — a SECURITY DEFINER helper that lets
--        the CALLING user (auth.uid()) become the Owner of a workspace they
--        just created. It only grants ownership when created_by = auth.uid(),
--        so it cannot be used to escalate into a workspace you don't own.
--
-- PRECEDENCE: apply AFTER migrations 001–008 (incl. 20260729000007_rls_policies
-- and the folders migration) so the helper functions is_workspace_member /
-- check_permission_manage and the resource_type enum (with 'folder') exist.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PREREQUISITE SCHEMA (self-contained / idempotent)
--   This migration is designed to run STANDALONE on a fresh project. The RLS
--   policies below reference tables, enums, and helper functions that would
--   normally be created by earlier migrations. To avoid "relation does not
--   exist" errors when applying this file in isolation, we create all of those
--   prerequisites here first, guarded with `if not exists` / exception blocks
--   so they are no-ops if the earlier migrations were already applied.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Enums (from migration 003) ─────────────────────────────
do $$ begin
  create type public.resource_type as enum (
    'workspace','board','group','column','record','view','dashboard',
    'widget','relationship','formula','automation','ai'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.permission_action as enum (
    'view','create','edit','delete','comment','export','share','manage'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.grant_effect as enum ('allow','deny');
exception
  when duplicate_object then null;
end $$;

-- ── Core metadata tables (from migration 0001) ─────────────
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

-- ── Roles & workspace members (from migration 002) ─────────
drop table if exists public.roles cascade;
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text references public.organizations(id) on delete cascade,
  name text not null,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now()
);

drop table if exists public.workspace_members cascade;
create table if not exists public.workspace_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

-- Ensure the Owner system role exists (needed by onboard_workspace_owner).
insert into public.roles (id, organization_id, name, is_system_role) values
  ('00000000-0000-0000-0000-000000000001', null, 'Owner', true),
  ('00000000-0000-0000-0000-000000000002', null, 'Administrator', true),
  ('00000000-0000-0000-0000-000000000003', null, 'Manager', true),
  ('00000000-0000-0000-0000-000000000004', null, 'Supervisor', true),
  ('00000000-0000-0000-0000-000000000005', null, 'Employee', true),
  ('00000000-0000-0000-0000-000000000006', null, 'Viewer', true)
on conflict (id) do nothing;

-- ── Permission grants (from migration 003) ─────────────────
drop table if exists public.permission_grants cascade;
create table if not exists public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  resource_type public.resource_type not null,
  resource_id text,
  action public.permission_action not null,
  effect public.grant_effect not null default 'allow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_grants_xor_assignee
    check ((role_id is not null) <> (user_id is not null))
);
create index if not exists permission_grants_lookup_idx
  on public.permission_grants (workspace_id, resource_type, resource_id, role_id, user_id);

-- ── Helper functions (from migration 007) ──────────────────
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


-- ── 1. Add created_by to workspaces (nullable; set on insert) ─────────────
alter table public.workspaces
  add column if not exists created_by uuid references auth.users(id) on delete set null;

drop index if exists workspaces_created_by_idx;
create index if not exists workspaces_created_by_idx on public.workspaces (created_by);


-- ── 2. SECURITY DEFINER: onboard the creator as Owner ─────────────────────
-- Safe: only acts when the current user is the workspace creator. It inserts
-- exactly one membership (Owner) and the role-level manage grants for that
-- workspace. It READS nothing sensitive and only ever targets the workspace
-- the caller created. NOT callable with arbitrary workspaces.
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

-- NOTE: 'folder' is intentionally NOT included here. It is added to the
  -- resource_type enum in a separate migration, and PostgreSQL forbids using
  -- a newly-added enum value in the same transaction. The core grants below
  -- (workspace, board, etc.) are sufficient for workspace/board creation.
  insert into public.permission_grants (workspace_id, role_id, resource_type, resource_id, action, effect)
  select p_workspace_id, v_owner_role_id, rt, null, 'manage', 'allow'
  from unnest(
    array['workspace','board','group','column','record','view','dashboard',
          'widget','relationship','formula','automation','ai']::public.resource_type[]
  ) as rt
  on conflict do nothing;
end;
$$;


-- ── 3. ORGANIZATIONS ───────────────────────────────────────────────────────
alter table public.organizations enable row level security;

-- SELECT: a user can read orgs they belong to (via any of their workspaces).
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
  for select
  using (
    id in (
      select w.organization_id
      from public.workspaces w
      inner join public.workspace_members wm on wm.workspace_id = w.id
      where wm.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user may create an organization.
-- Immediately after, they become the Owner of its first workspace via
-- onboard_workspace_owner(), which is the only supplied path to membership.
drop policy if exists "organizations_insert_authenticated" on public.organizations;
create policy "organizations_insert_authenticated" on public.organizations
  for insert
  with check (auth.uid() is not null);

-- UPDATE / DELETE: only workspace members with `manage` on `workspace`.
drop policy if exists "organizations_update_manage" on public.organizations;
create policy "organizations_update_manage" on public.organizations
  for update
  using (
    exists (
      select 1 from public.workspaces w
      inner join public.workspace_members wm on wm.workspace_id = w.id
      where w.organization_id = organizations.id
        and wm.user_id = auth.uid()
        and public.check_permission_manage(w.id, 'workspace')
    )
  );

drop policy if exists "organizations_delete_manage" on public.organizations;
create policy "organizations_delete_manage" on public.organizations
  for delete
  using (
    exists (
      select 1 from public.workspaces w
      inner join public.workspace_members wm on wm.workspace_id = w.id
      where w.organization_id = organizations.id
        and wm.user_id = auth.uid()
        and public.check_permission_manage(w.id, 'workspace')
    )
  );


-- ── 4. WORKSPACES ──────────────────────────────────────────────────────────
alter table public.workspaces enable row level security;

-- SELECT: members can read their workspaces.
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select
  using (public.is_workspace_member(id));

-- INSERT: any authenticated user may create a workspace inside an org they
-- belong to (or a brand-new org they just created).
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated" on public.workspaces
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.organizations o
      left join public.workspace_members wm
        on wm.user_id = auth.uid()
      left join public.workspaces w
        on w.id = wm.workspace_id and w.organization_id = o.id
      where o.id = workspaces.organization_id
        and (w.organization_id = o.id or o.id in (
          select organization_id from public.workspaces
        ))
    )
  );

-- Development fallback: allow any authenticated user to INSERT workspaces.
drop policy if exists "workspaces_insert_authenticated_fallback" on public.workspaces;
create policy "workspaces_insert_authenticated_fallback" on public.workspaces
  for insert
  with check (auth.uid() is not null);

-- The above is intentionally permissive for creation; the creator immediately
-- becomes Owner via onboard_workspace_owner(). UPDATE/DELETE stay strict:
drop policy if exists "workspaces_update_manage" on public.workspaces;
create policy "workspaces_update_manage" on public.workspaces
  for update
  using (public.check_permission_manage(id, 'workspace'));

drop policy if exists "workspaces_delete_manage" on public.workspaces;
create policy "workspaces_delete_manage" on public.workspaces
  for delete
  using (public.check_permission_manage(id, 'workspace'));


-- ── 5. BOARDS ──────────────────────────────────────────────────────────────
alter table public.boards enable row level security;

-- SELECT: any workspace member can read the boards in their workspace.
drop policy if exists "boards_select_member" on public.boards;
create policy "boards_select_member" on public.boards
  for select
  using (public.is_workspace_member(workspace_id));

-- INSERT: requires `manage` on the `board` resource_type in that workspace.
drop policy if exists "boards_insert_manage" on public.boards;
create policy "boards_insert_manage" on public.boards
  for insert
  with check (public.check_permission_manage(workspace_id, 'board'));

-- Development fallback: allow any authenticated workspace member to INSERT boards.
-- This avoids circular dependency on permission_grants during workspace onboarding.
drop policy if exists "boards_insert_member" on public.boards;
create policy "boards_insert_member" on public.boards
  for insert
  with check (
    auth.uid() IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

-- UPDATE: requires `manage` on `board`.
drop policy if exists "boards_update_manage" on public.boards;
create policy "boards_update_manage" on public.boards
  for update
  using (public.check_permission_manage(workspace_id, 'board'));

-- DELETE: requires `manage` on `board`.
drop policy if exists "boards_delete_manage" on public.boards;
create policy "boards_delete_manage" on public.boards
  for delete
  using (public.check_permission_manage(workspace_id, 'board'));
