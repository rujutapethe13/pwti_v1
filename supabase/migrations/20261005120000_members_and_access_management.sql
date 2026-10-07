-- =============================================================================
-- Members & access management
--
-- Adds the write side and the per-board override that the existing RBAC tables
-- do not have. Deliberately *not* a new membership table.
--
-- ── Where membership already lives ──────────────────────────────────────────
--   workspaces.owner_id          the single owner. This is the only "owner".
--   workspace_members.role       app_role: admin | staff | client
--   workspace_members.can_edit   per-member edit flag
--   workspace_invites            pre-enrollment; used_at / expires_at make a
--                                row "pending" rather than accepted
--   board_admins                 configurable workspace admins
--
-- `can_edit_workspace` / `can_edit_board` (migration 02) already read those
-- columns, and the RLS on records / cell_values / views / groups (migration 04)
-- already authorizes through them. Introducing a parallel membership table would
-- have meant the Members dialog enforced something the data layer ignored, so
-- this feature extends the model the rest of the app authorizes on.
--
-- ── What is actually new here ───────────────────────────────────────────────
--   1. board_member_overrides — a real per-board role (owner|edit|view). The
--      existing board_access_overrides is binary granted/revoked and is consumed
--      by can_view_board as a *narrowing* flag; it cannot express "edit".
--   2. resolve_workspace_access / resolve_board_access — one place that answers
--      "what can this person do", so the API and the UI cannot disagree.
--      list_workspace_members maps app_role 'admin' to the Owner badge, which
--      would have made every admin undeletable in the dialog; these resolve
--      owner from workspaces.owner_id only.
--   3. list_pending_workspace_invites — list_workspace_members folds a pending
--      invite into an existing member's status. People who were invited but
--      have never signed up have no workspace_members row at all and so were
--      invisible; this returns them.
--   4. The write RPCs. Every one is SECURITY DEFINER and gated, so a membership
--      cannot be changed by calling a table directly with the anon key — the
--      tables have no client INSERT/UPDATE/DELETE policy.
--
-- ── Known limitation, stated rather than hidden ────────────────────────────
-- board_member_overrides is honoured by this feature and by /api/members, but
-- can_view_board / can_edit_board do not read it yet. A board-level override is
-- therefore enforced in the Members dialog and the API, not in the row-level
-- policies on records / cell_values. Folding it into those predicates changes
-- RLS semantics for every board, so it is deliberately a separate change.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================
 
-- ── Dependency verification ──────────────────────────────────────────────────
-- This migration requires the following from earlier RBAC migrations:
--   • public.app_role type (migration 20261005000000)
--   • public.is_super_admin(), current_role(), current_org_id() (migration 20261005000001)
--   • public.can_view_workspace(), can_view_board() (migration 20261005000001)
--   • public.workspace_members table with role/can_view/can_edit columns
--   • public.workspace_invites table
--   • public.board_admins table
--   • public.board_access_overrides table
--   • public.boards, public.workspaces, public.profiles tables
-- If any are missing, the CREATE FUNCTION statements below will fail.
-- Verify before proceeding:
do $$
declare
  v_missing text;
  v_debug   text;
  v_exists  boolean;
begin
  -- Debug: check each dependency individually using pg_proc directly
  select string_agg(format('%s: %s', s.name, case when s.exists then 'EXISTS' else 'MISSING' end), '; ')
    into v_debug
    from (
      select 'type public.app_role' as name, to_regtype('public.app_role') is not null as exists
      union all
      select 'function public.is_super_admin()', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_super_admin' and pg_get_function_identity_arguments(p.oid) = ''
      ) as exists
      union all
      select 'function public.current_role()', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'current_role' and pg_get_function_identity_arguments(p.oid) = ''
      ) as exists
      union all
      select 'function public.current_org_id()', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'current_org_id' and pg_get_function_identity_arguments(p.oid) = ''
      ) as exists
      union all
      select 'function public.can_view_workspace(text)', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'can_view_workspace' and pg_get_function_identity_arguments(p.oid) ILIKE '%text%'
      ) as exists
      union all
      select 'function public.can_view_board(text)', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'can_view_board' and pg_get_function_identity_arguments(p.oid) ILIKE '%text%'
      ) as exists
      union all
      select 'table public.workspace_members', to_regclass('public.workspace_members') is not null as exists
      union all
      select 'table public.workspace_invites', to_regclass('public.workspace_invites') is not null as exists
      union all
      select 'table public.board_admins', to_regclass('public.board_admins') is not null as exists
      union all
      select 'table public.board_access_overrides', to_regclass('public.board_access_overrides') is not null as exists
      union all
      select 'table public.boards', to_regclass('public.boards') is not null as exists
      union all
      select 'table public.workspaces', to_regclass('public.workspaces') is not null as exists
      union all
      select 'table public.profiles', to_regclass('public.profiles') is not null as exists
    ) s;
  raise notice 'members: dependency check — %', v_debug;
 
  select string_agg(t.name, ', ' order by t.name)
    into v_missing
    from unnest(array[
      'type public.app_role',
      'function public.is_super_admin()',
      'function public.current_role()',
      'function public.current_org_id()',
      'function public.can_view_workspace(text)',
      'function public.can_view_board(text)',
      'table public.workspace_members',
      'table public.workspace_invites',
      'table public.board_admins',
      'table public.board_access_overrides',
      'table public.boards',
      'table public.workspaces',
      'table public.profiles'
    ]) as t(name)
   where not exists (
     select 1
     from (
       select 'type public.app_role' as name, to_regtype('public.app_role') is not null as exists
       union all
       select 'function public.is_super_admin()', exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'is_super_admin' and pg_get_function_identity_arguments(p.oid) = ''
       ) as exists
       union all
       select 'function public.current_role()', exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'current_role' and pg_get_function_identity_arguments(p.oid) = ''
       ) as exists
       union all
       select 'function public.current_org_id()', exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'current_org_id' and pg_get_function_identity_arguments(p.oid) = ''
       ) as exists
       union all
       select 'function public.can_view_workspace(text)', exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'can_view_workspace' and pg_get_function_identity_arguments(p.oid) ILIKE '%text%'
       ) as exists
       union all
       select 'function public.can_view_board(text)', exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'can_view_board' and pg_get_function_identity_arguments(p.oid) ILIKE '%text%'
       ) as exists
       union all
       select 'table public.workspace_members', to_regclass('public.workspace_members') is not null as exists
       union all
       select 'table public.workspace_invites', to_regclass('public.workspace_invites') is not null as exists
       union all
       select 'table public.board_admins', to_regclass('public.board_admins') is not null as exists
       union all
       select 'table public.board_access_overrides', to_regclass('public.board_access_overrides') is not null as exists
       union all
       select 'table public.boards', to_regclass('public.boards') is not null as exists
       union all
       select 'table public.workspaces', to_regclass('public.workspaces') is not null as exists
       union all
       select 'table public.profiles', to_regclass('public.profiles') is not null as exists
     ) s
     where s.name = t.name and s.exists
   );
 
  if v_missing is not null then
    raise exception 'members: missing dependencies — apply earlier RBAC migrations first: %', v_missing;
  end if;
 
  raise notice 'members: all dependencies satisfied';
end
$$;
 
-- ── can_manage_workspace_members ───────────────────────────────────────────
-- "Owner or admin of this workspace". Distinct from can_edit_workspace: an
-- admin may edit a workspace without being entitled to see who is in it, and
-- this is the predicate that decides that.
--
-- SECURITY DEFINER because workspace_members has no client policy that admits
-- the owner or the workspace admins, and reading it to answer a question about
-- reading it would otherwise recurse.
 
create or replace function public.can_manage_workspace_members(p_workspace_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_org   text;
begin
  if v_uid is null or p_workspace_id is null then
    return false;
  end if;
 
  select w.owner_id, w.organization_id into v_owner, v_org
    from public.workspaces w
   where w.id = p_workspace_id;
 
  if v_owner = v_uid then
    return true;
  end if;
 
  if public.is_super_admin() then
    return true;
  end if;
 
  -- An organization admin manages the members of any workspace in their own
  -- organization, and of no workspace outside it.
  if public.current_role() = 'admin' then
    return v_org is not null and v_org = public.current_org_id();
  end if;
 
return exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id = v_uid
       and wm.role = 'admin'
  );
end
$$;
 
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. board_member_overrides — per-board role
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.board_member_overrides (
  board_id   text not null references public.boards (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  access     text not null check (access in ('owner', 'edit', 'view')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists board_member_overrides_user_id_idx
  on public.board_member_overrides (user_id);

-- SELECT only, and only for someone entitled to manage the board's members.
-- Writes happen exclusively through the SECURITY DEFINER RPCs below.
alter table public.board_member_overrides enable row level security;

drop policy if exists "board_member_overrides_select_manage" on public.board_member_overrides;
create policy "board_member_overrides_select_manage"
  on public.board_member_overrides for select
  using (
    public.can_manage_workspace_members((
      select b.workspace_id from public.boards b where b.id = board_member_overrides.board_id
    ))
  );

grant select on public.board_member_overrides to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Access resolution — the single source of truth
-- ─────────────────────────────────────────────────────────────────────────────

-- The workspace-level answer: owner | edit | view, or null for no access.
--
-- p_user_id is explicit rather than auth.uid() so the same function serves the
-- caller's own access (what the UI gates on) and the role of every other member
-- (what the list shows). Access to *whose* role you may read is decided by the
-- caller of this function, not here.
create or replace function public.resolve_workspace_access(p_workspace_id text, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner    uuid;
  v_role     text;
  v_can_edit boolean;
begin
  if p_workspace_id is null or p_user_id is null then
    return null;
  end if;

  select w.owner_id into v_owner
    from public.workspaces w
   where w.id = p_workspace_id;

  if not found then
    return null;
  end if;

  -- Super admin always has owner access everywhere
  if public.is_super_admin_user(p_user_id) then
    return 'owner';
  end if;

  -- The owner. app_role = 'admin' is a workspace administrator, not the owner:
  -- conflating the two would make every admin undeletable in the Members dialog.
  if v_owner = p_user_id then
    return 'owner';
  end if;

  select wm.role::text, wm.can_edit
    into v_role, v_can_edit
    from public.workspace_members wm
   where wm.workspace_id = p_workspace_id
     and wm.user_id = p_user_id;

  if not found then
    return null;
  end if;

  if v_role = 'admin' or v_role = 'staff' or v_can_edit then
    return 'edit';
  end if;

  return 'view';
end
$$;

-- The board-level answer. A board_member_overrides row wins over the workspace
-- role; its absence is what the UI reports as "Inherited from workspace".
create or replace function public.resolve_board_access(p_board_id text, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ws      text;
  v_access  text;
begin
  if p_board_id is null or p_user_id is null then
    return null;
  end if;

  select b.workspace_id into v_ws
    from public.boards b
   where b.id = p_board_id;

  if not found then
    return null;
  end if;

  -- Super admin always has owner access everywhere
  if public.is_super_admin_user(p_user_id) then
    return 'owner';
  end if;

  select o.access into v_access
    from public.board_member_overrides o
   where o.board_id = p_board_id
     and o.user_id = p_user_id;

  if v_access is not null then
    return v_access;
  end if;

  return public.resolve_workspace_access(v_ws, p_user_id);
end
$$;

-- One predicate for "may change members". Owner and edit yes, view no.
--
-- Owner of the workspace is always allowed. Otherwise the caller needs edit on
-- the exact scope being managed — for a board that is resolve_board_access, so a
-- per-board edit grant is honoured and a per-board view grant cannot manage
-- anyone.
create or replace function public.can_manage_members(p_workspace_id text, p_board_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_access text;
begin
  if v_uid is null or p_workspace_id is null then
    return false;
  end if;

  select w.owner_id into v_owner
    from public.workspaces w
   where w.id = p_workspace_id;

  if v_owner = v_uid then
    return true;
  end if;

  if p_board_id is null then
    v_access := public.resolve_workspace_access(p_workspace_id, v_uid);
  else
    v_access := public.resolve_board_access(p_board_id, v_uid);
  end if;

  return v_access = 'owner' or v_access = 'edit';
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Pending invites
-- ─────────────────────────────────────────────────────────────────────────────

-- Invited, never signed up: an unconsumed, unexpired invite for an address that
-- has no workspace_members row. Without this, an invite is only visible after the
-- recipient has already accepted it.
create or replace function public.list_pending_workspace_invites(p_workspace_id text)
returns table (
  code       text,
  email      text,
  access     text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_workspace_id is null then
    return;
  end if;

  if not public.can_manage_workspace_members(p_workspace_id) then
    raise exception 'members: only the owner and workspace admins can view pending invites'
      using errcode = '42501';
  end if;

  return query
  select
    i.code,
    i.email,
    case when i.can_edit then 'edit' else 'view' end,
    i.created_by,
    i.created_at,
    i.expires_at
  from public.workspace_invites i
  where i.workspace_id = p_workspace_id
    and i.used_at is null
    and (i.expires_at is null or i.expires_at > now())
    and i.email is not null
    and not exists (
      select 1
        from public.workspace_members wm
        join auth.users u on u.id = wm.user_id
       where wm.workspace_id = p_workspace_id
         and lower(u.email) = lower(i.email)
    )
  order by i.created_at desc;
end
$$;

-- Board overrides, so the dialog can label who is set for this board only.
create or replace function public.list_board_member_overrides(p_board_id text)
returns table (
  user_id    uuid,
  email      text,
  access     text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ws text;
begin
  if auth.uid() is null or p_board_id is null then
    return;
  end if;

  select b.workspace_id into v_ws
    from public.boards b
   where b.id = p_board_id;

  if not found then
    raise exception 'members: board not found' using errcode = '42501';
  end if;

  -- Every workspace member may read the override list; access is stripped to
  -- role only by can_view_board, and the dialog hides the columns it may not see.
  if not public.can_view_board(p_board_id) then
    raise exception 'members: board not found' using errcode = '42501';
  end if;

  return query
  select
    o.user_id,
    lower(u.email),
    o.access,
    o.created_at
  from public.board_member_overrides o
  join auth.users u on u.id = o.user_id
  where o.board_id = p_board_id
  order by 2 asc;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Writes
--
-- All SECURITY DEFINER, all gated by can_manage_members, all refusing the owner.
-- app_role has no 'owner' value: owner is workspaces.owner_id, so an owner has
-- no row to demote and cannot be deleted by accident.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add someone who already has an account.
create or replace function public.add_workspace_member(
  p_workspace_id text,
  p_email        text,
  p_access       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_role    public.app_role;
  v_can_edit boolean;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can add members'
      using errcode = '42501';
  end if;

  if p_access = 'edit' then
    v_role := 'staff'::public.app_role;
    v_can_edit := true;
  elsif p_access = 'view' then
    v_role := 'client'::public.app_role;
    v_can_edit := false;
  else
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;

  select u.id into v_uid
    from auth.users u
   where lower(u.email) = lower(trim(p_email));

  if v_uid is null then
    raise exception 'members: no account exists for %', p_email using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.workspace_members wm
     where wm.workspace_id = p_workspace_id and wm.user_id = v_uid
  ) then
    raise exception 'members: that person is already a member' using errcode = '23505';
  end if;

  insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
  values (v_uid, p_workspace_id, v_role, true, v_can_edit);

  return v_uid;
end
$$;

-- Invite an address that has no account yet.
create or replace function public.invite_workspace_member(
  p_workspace_id text,
  p_email        text,
  p_access       text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role      public.app_role;
  v_can_edit  boolean;
  v_code      text;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can invite'
      using errcode = '42501';
  end if;

  if p_access = 'edit' then
    v_role := 'staff'::public.app_role;
    v_can_edit := true;
  elsif p_access = 'view' then
    v_role := 'client'::public.app_role;
    v_can_edit := false;
  else
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.workspace_invites i
      join auth.users u on lower(u.email) = lower(i.email)
     where i.workspace_id = p_workspace_id
       and i.used_at is null
       and (i.expires_at is null or i.expires_at > now())
       and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'members: that person already has a pending invite' using errcode = '23505';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_invites (
    code, workspace_id, email, role, can_view, can_edit, created_by, expires_at
  )
  values (
    v_code, p_workspace_id, lower(trim(p_email)), v_role, true, v_can_edit,
    auth.uid(), now() + interval '14 days'
  );

  return v_code;
end
$$;

create or replace function public.set_workspace_member_access(
  p_workspace_id text,
  p_user_id      uuid,
  p_access       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_role    public.app_role;
  v_can_edit boolean;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can change access'
      using errcode = '42501';
  end if;

  if p_access = 'edit' then
    v_role := 'staff'::public.app_role;
    v_can_edit := true;
  elsif p_access = 'view' then
    v_role := 'client'::public.app_role;
    v_can_edit := false;
  else
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;

  select w.owner_id into v_owner
    from public.workspaces w
   where w.id = p_workspace_id;

  if v_owner = p_user_id then
    raise exception 'members: the owner''s access cannot be changed' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'members: you cannot change your own access' using errcode = '42501';
  end if;

  update public.workspace_members
     set role = v_role, can_edit = v_can_edit
   where workspace_id = p_workspace_id
     and user_id = p_user_id;

  if not found then
    raise exception 'members: that person is not a member of this workspace'
      using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.remove_workspace_member(
  p_workspace_id text,
  p_user_id      uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can remove members'
      using errcode = '42501';
  end if;

  select w.owner_id into v_owner
    from public.workspaces w
   where w.id = p_workspace_id;

  if v_owner = p_user_id then
    raise exception 'members: the owner cannot be removed' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'members: you cannot remove yourself' using errcode = '42501';
  end if;

  delete from public.workspace_members
   where workspace_id = p_workspace_id
     and user_id = p_user_id;

  if not found then
    raise exception 'members: that person is not a member of this workspace'
      using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.resend_workspace_invite(
  p_workspace_id text,
  p_code         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_workspace_members(p_workspace_id) then
    raise exception 'members: only the owner and workspace admins can resend invites'
      using errcode = '42501';
  end if;

  -- created_at is what the dialog orders by, so bumping it is what makes a resent
  -- invite sort back to the top of the pending list.
  update public.workspace_invites
     set created_at = now(),
         expires_at = now() + interval '14 days'
   where code = p_code
     and workspace_id = p_workspace_id
     and used_at is null;

  if not found then
    raise exception 'members: invite not found or already accepted' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.cancel_workspace_invite(
  p_workspace_id text,
  p_code         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_workspace_members(p_workspace_id) then
    raise exception 'members: only the owner and workspace admins can cancel invites'
      using errcode = '42501';
  end if;

  delete from public.workspace_invites
   where code = p_code
     and workspace_id = p_workspace_id
     and used_at is null;

  if not found then
    raise exception 'members: invite not found or already accepted' using errcode = 'P0002';
  end if;
end
$$;

-- p_access null clears the override and hands the board back to the workspace role.
create or replace function public.set_board_member_access(
  p_board_id text,
  p_user_id  uuid,
  p_access   text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws    text;
  v_owner uuid;
begin
  select b.workspace_id into v_ws
    from public.boards b
   where b.id = p_board_id;

  if not found then
    raise exception 'members: board not found' using errcode = '42501';
  end if;

  if not public.can_manage_members(v_ws, p_board_id) then
    raise exception 'members: only the owner and users with edit access can change board access'
      using errcode = '42501';
  end if;

  select w.owner_id into v_owner
    from public.workspaces w
   where w.id = v_ws;

  if v_owner = p_user_id then
    raise exception 'members: the owner''s access cannot be changed' using errcode = '42501';
  end if;

  if p_access is null then
    delete from public.board_member_overrides
     where board_id = p_board_id and user_id = p_user_id;
    return;
  end if;

  if p_access not in ('owner', 'edit', 'view') then
    raise exception 'members: access must be owner, edit or view' using errcode = '22023';
  end if;

  insert into public.board_member_overrides (board_id, user_id, access, granted_by)
  values (p_board_id, p_user_id, p_access, auth.uid())
  on conflict (board_id, user_id)
  do update set access = excluded.access,
                granted_by = auth.uid();
end
$$;

create or replace function public.remove_board_member_access(
  p_board_id text,
  p_user_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.set_board_member_access(p_board_id, p_user_id, null);
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
--
-- PUBLIC is revoked first so a future default grant cannot expose these.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.resolve_workspace_access(text, uuid) from public;
revoke all on function public.resolve_board_access(text, uuid) from public;
revoke all on function public.can_manage_members(text, text) from public;
revoke all on function public.can_manage_workspace_members(text) from public;
revoke all on function public.list_pending_workspace_invites(text) from public;
revoke all on function public.list_board_member_overrides(text) from public;
revoke all on function public.add_workspace_member(text, text, text) from public;
revoke all on function public.invite_workspace_member(text, text, text) from public;
revoke all on function public.set_workspace_member_access(text, uuid, text) from public;
revoke all on function public.remove_workspace_member(text, uuid) from public;
revoke all on function public.resend_workspace_invite(text, text) from public;
revoke all on function public.cancel_workspace_invite(text, text) from public;
revoke all on function public.set_board_member_access(text, uuid, text) from public;
revoke all on function public.remove_board_member_access(text, uuid) from public;

grant execute on function public.resolve_workspace_access(text, uuid) to authenticated, service_role;
grant execute on function public.resolve_board_access(text, uuid) to authenticated, service_role;
grant execute on function public.can_manage_members(text, text) to authenticated, service_role;
grant execute on function public.can_manage_workspace_members(text) to authenticated, service_role;
grant execute on function public.list_pending_workspace_invites(text) to authenticated, service_role;
grant execute on function public.list_board_member_overrides(text) to authenticated, service_role;
grant execute on function public.add_workspace_member(text, text, text) to authenticated, service_role;
grant execute on function public.invite_workspace_member(text, text, text) to authenticated, service_role;
grant execute on function public.set_workspace_member_access(text, uuid, text) to authenticated, service_role;
grant execute on function public.remove_workspace_member(text, uuid) to authenticated, service_role;
grant execute on function public.resend_workspace_invite(text, text) to authenticated, service_role;
grant execute on function public.cancel_workspace_invite(text, text) to authenticated, service_role;
grant execute on function public.set_board_member_access(text, uuid, text) to authenticated, service_role;
grant execute on function public.remove_board_member_access(text, uuid) to authenticated, service_role;

-- Every function this migration depends on must exist, or the feature is wired to
-- nothing. Checked rather than assumed: migration 01-05 are applied by hand and
-- there is no ledger to consult.
do $$
declare
  v_missing text;
begin
  select string_agg(t.name, ', ' order by t.name)
    into v_missing
    from unnest(array[
      'resolve_workspace_access(p_workspace_id text, p_user_id uuid)',
      'resolve_board_access(p_board_id text, p_user_id uuid)',
      'can_manage_members(p_workspace_id text, p_board_id text)',
      'can_manage_workspace_members(p_workspace_id text)',
      'list_pending_workspace_invites(p_workspace_id text)',
      'list_board_member_overrides(p_board_id text)',
      'add_workspace_member(p_workspace_id text, p_email text, p_access text)',
      'invite_workspace_member(p_workspace_id text, p_email text, p_access text)',
      'set_workspace_member_access(p_workspace_id text, p_user_id uuid, p_access text)',
      'remove_workspace_member(p_workspace_id text, p_user_id uuid)',
      'resend_workspace_invite(p_workspace_id text, p_code text)',
      'cancel_workspace_invite(p_workspace_id text, p_code text)',
      'set_board_member_access(p_board_id text, p_user_id uuid, p_access text)',
      'remove_board_member_access(p_board_id text, p_user_id uuid)'
    ]) as t(name)
   where not exists (
     select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = t.name
   );

  if v_missing is not null then
    raise exception 'members: these functions failed to create: %', v_missing;
  end if;

  raise notice 'members: board_member_overrides created, RLS enabled (SELECT for managers, writes via RPC)';
  raise notice 'members: access resolvers and %s write RPCs in place', 14;
  raise notice 'members: LIMITATION — board_member_overrides is not yet read by can_view_board / can_edit_board';
end
$$;