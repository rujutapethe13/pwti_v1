-- =============================================================================
-- RBAC / 01 — Types, tables, columns, and the auth.users onboarding trigger
--
-- Adds the RBAC schema on top of the existing metadata engine. Nothing here
-- rewrites an existing table: the permission model is purely additive, so the
-- older permission tables (permission_grants, column_visibility_rules,
-- board_access_*) stay in place and are left dormant by later migrations.
--
-- Adaptation notes vs. the original brief (the live schema differs):
--   * the item table is `records`, not `items`, and it has no `values` jsonb.
--     Cell data lives one row per (record, column) in `cell_values`. So column
--     permissions key off `cell_values.column_id`, and "compare OLD.values to
--     NEW.values" becomes a BEFORE UPDATE trigger on `cell_values`.
--   * the column table is `columns`, with `label` (not `name`) and `sort_order`
--     (not `position`).
--   * `workspaces` already had `created_by`; we add `type` and `owner_id`.
--   * `workspace_members` already existed with a `role_id` FK to `roles`. We add
--     `role`, `can_view` and `can_edit` alongside it and leave `role_id`
--     untouched so existing joins keep working.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
-- Postgres has no `create type if not exists`, and adding a value to an
-- existing enum cannot happen in the same transaction that uses it. Catch only
-- `duplicate_object` so a genuine failure still aborts the migration.

do $$
begin
  create type public.app_role as enum ('admin', 'staff', 'client');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.workspace_kind as enum ('standard', 'client', 'personal');
exception
  when duplicate_object then null;
end
$$;

-- ── profiles ───────────────────────────────────────────────────────────────
-- Created for every auth user by handle_new_user() below, defaulting to
-- 'client'. This is the authoritative *organization-wide* role and is what
-- public.current_role() reads. Per-workspace roles live in workspace_members.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  avatar_url  text,
  role        public.app_role not null default 'client',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- ── organization_members ───────────────────────────────────────────────────
-- Which organizations a user belongs to, and at what org-wide role. Kept in
-- sync from profiles.role by a trigger so multi-org works later without
-- another migration.

create table if not exists public.organization_members (
  organization_id  text not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             public.app_role not null default 'client',
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

-- ── workspaces: type + owner_id ────────────────────────────────────────────

alter table public.workspaces add column if not exists type public.workspace_kind;
alter table public.workspaces add column if not exists owner_id uuid references auth.users (id) on delete set null;

update public.workspaces
   set type = 'standard'
 where type is null;

update public.workspaces
   set owner_id = created_by
 where owner_id is null
   and created_by is not null;

alter table public.workspaces alter column type set default 'standard';
alter table public.workspaces alter column type set not null;

create index if not exists workspaces_type_idx on public.workspaces (type);
create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

-- ── workspace_members: role / can_view / can_edit ──────────────────────────
-- role_id (FK to the legacy `roles` table) is deliberately left in place.
-- Backfilled from role_id names in migration 05.

alter table public.workspace_members add column if not exists role public.app_role;
alter table public.workspace_members add column if not exists can_view boolean;
alter table public.workspace_members add column if not exists can_edit boolean;

-- The legacy role_id is NOT NULL and ON DELETE RESTRICT, which makes it
-- impossible to create a membership without also picking one of six seeded
-- system roles. That would leave `role` as a derived column rather than the
-- authority, and every new insert would have to pick a legacy role that no
-- longer means anything. Relaxing it lets the new model stand on its own.
--
-- Rows that already carry a role_id keep it, and migration 05 backfills `role`
-- from it, so nothing is lost. workspace-permissions.ts reads `role` first and
-- only falls back to the legacy role name.
alter table public.workspace_members alter column role_id drop not null;

update public.workspace_members set can_view = true  where can_view is null;
update public.workspace_members set can_edit = false where can_edit is null;

alter table public.workspace_members alter column can_view set default true;
alter table public.workspace_members alter column can_view set not null;
alter table public.workspace_members alter column can_edit set default false;
alter table public.workspace_members alter column can_edit set not null;

-- ── workspace_personal_access ──────────────────────────────────────────────
-- Extra grants on a personal workspace, beyond the owner and the super admin.
-- The owner can hand specific admins/staff a view (and optionally edit) grant.
-- Nobody else can reach a personal workspace.

create table if not exists public.workspace_personal_access (
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  can_edit      boolean not null default false,
  granted_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_personal_access_user_idx
  on public.workspace_personal_access (user_id);

-- ── client_board_access ────────────────────────────────────────────────────
-- Per-client-user board grants. Default deny: no row means the client cannot
-- see the board at all, and therefore cannot see its columns or items either.

create table if not exists public.client_board_access (
  user_id       uuid not null references auth.users (id) on delete cascade,
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  board_id      text not null references public.boards (id) on delete cascade,
  can_view      boolean not null default true,
  can_create    boolean not null default false,
  can_delete    boolean not null default false,
  granted_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, board_id)
);

create index if not exists client_board_access_workspace_idx
  on public.client_board_access (workspace_id);
create index if not exists client_board_access_board_idx
  on public.client_board_access (board_id);

-- A board grant must belong to the workspace that actually contains the board.
-- Without this a grant could be written against workspace A for a board in
-- workspace B, and can_view_board() would then trust the wrong workspace.
--
-- The composite foreign key needs a matching unique constraint to reference.
-- `id` is already the primary key of both tables, so the pair is trivially
-- unique; naming it explicitly is what makes the FK declarable.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'boards_id_workspace_id_key'
  ) then
    alter table public.boards
      add constraint boards_id_workspace_id_key unique (id, workspace_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'columns_id_board_id_key'
  ) then
    alter table public.columns
      add constraint columns_id_board_id_key unique (id, board_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'client_board_access_board_workspace_match'
  ) then
    alter table public.client_board_access
      add constraint client_board_access_board_workspace_match
      foreign key (board_id, workspace_id)
      references public.boards (id, workspace_id)
      not valid;
  end if;
end
$$;

-- ── client_column_permissions ──────────────────────────────────────────────
-- Per-client-user column grants on a granted board. Default deny: no row means
-- the column is hidden AND read-only for that client, everywhere — table,
-- filter, sort, group-by, search, exports and dashboard charts.

create table if not exists public.client_column_permissions (
  user_id       uuid not null references auth.users (id) on delete cascade,
  board_id      text not null references public.boards (id) on delete cascade,
  column_id     text not null references public.columns (id) on delete cascade,
  can_view      boolean not null default false,
  can_edit      boolean not null default false,
  granted_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, column_id)
);

create index if not exists client_column_permissions_board_idx
  on public.client_column_permissions (board_id);

-- The column must actually belong to the board it is granted against.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_column_permissions_column_board_match'
  ) then
    alter table public.client_column_permissions
      add constraint client_column_permissions_column_board_match
      foreign key (column_id, board_id)
      references public.columns (id, board_id)
      not valid;
  end if;
end
$$;

-- ── workspace_invites ──────────────────────────────────────────────────────
-- Optional pre-enrollment. Signup itself is open to anyone (default role
-- 'client'); an invite additionally files the new user into a specific
-- workspace on first login. Matched on email, or on an explicit code the user
-- typed at signup (passed through signup metadata as `invite_code`).

create table if not exists public.workspace_invites (
  code          text primary key,
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  email         text,
  role          public.app_role not null default 'client',
  can_view      boolean not null default true,
  can_edit      boolean not null default false,
  created_by    uuid references auth.users (id) on delete set null,
  expires_at    timestamptz,
  used_at       timestamptz,
  used_by       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists workspace_invites_email_idx
  on public.workspace_invites (lower(email));

-- Only the super admin can create admins, and that rule has to hold for the
-- invite path too — otherwise anyone who can mint an invite could mint an
-- admin. Invites may therefore only pre-enroll staff or clients.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_invites_no_admin_role'
  ) then
    alter table public.workspace_invites
      add constraint workspace_invites_no_admin_role check (role <> 'admin');
  end if;
end
$$;

-- ── handle_new_user ────────────────────────────────────────────────────────
-- Runs on every signup. Creates the profiles row (role 'client' by default),
-- mirrors it into organization_members, and consumes a matching invite.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id       uuid := new.id;
  v_email         text := lower(coalesce(new.email, ''));
  v_full_name     text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  v_invite_code   text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')), '');
  v_org_id        text;
  v_inv           record;
begin
  if v_email = '' then
    raise warning 'rbac: new auth user % has no email; skipping profile', v_user_id;
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_email, v_full_name, 'client')
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();

  -- Resolve the invite before choosing an org, so the invite can point at a
  -- workspace in an organization the user is not yet a member of.
  select * into v_inv
    from public.workspace_invites i
   where i.used_at is null
     and (i.expires_at is null or i.expires_at > now())
     and (
       (v_invite_code is not null and i.code = v_invite_code)
       or (v_invite_code is null and i.email is not null and lower(i.email) = v_email)
     )
   order by i.created_at desc
   limit 1;

  if found then
    select w.organization_id into v_org_id
      from public.workspaces w
     where w.id = v_inv.workspace_id;
  else
    -- No invite: fall back to the caller's default organization so an admin
    -- signing up with an existing org still lands in the right tenant.
    select w.organization_id into v_org_id
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
     where wm.user_id = v_user_id
     order by w.created_at asc
     limit 1;
  end if;

  if v_org_id is null then
    -- No invite and no membership yet. Attach to the oldest organization so
    -- the row is not orphaned; if there is genuinely no organization the
    -- insert below is skipped and the empty state is the correct answer.
    select o.id into v_org_id
      from public.organizations o
     order by o.created_at asc
     limit 1;
  end if;

  if v_org_id is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org_id, v_user_id, 'client')
    on conflict (organization_id, user_id) do nothing;
  end if;

  -- `found` is unreliable here: the select for v_org_id above reset it. The
  -- invite's primary key is non-null exactly when a row was matched, so test
  -- that instead.
  if v_inv.code is not null then
    insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
    values (v_user_id, v_inv.workspace_id, v_inv.role, v_inv.can_view, v_inv.can_edit)
    on conflict (user_id, workspace_id) do nothing;

    update public.workspace_invites
       set used_at = now(), used_by = v_user_id
     where code = v_inv.code;

    -- An invite that carries an elevated role promotes the profile too, so
    -- current_role() reports it for the whole org rather than one workspace.
    if v_inv.role <> 'client' then
      update public.profiles set role = v_inv.role, updated_at = now()
       where id = v_user_id;

      update public.organization_members set role = v_inv.role
       where organization_id = v_org_id and user_id = v_user_id;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Keep organization_members in step with profiles.role ───────────────────
-- profiles.role is the single editable org-wide role. Mirroring it means an
-- admin changing someone's role in the admin UI only has to write one row.

create or replace function public.sync_organization_members_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organization_members
     set role = new.role
   where user_id = new.id
     and role is distinct from new.role;

  return new;
end
$$;

drop trigger if exists on_profile_role_changed on public.profiles;
create trigger on_profile_role_changed
  after update of role on public.profiles
  for each row execute function public.sync_organization_members_role();

-- ── Bootstrap: give the super admin their profile + membership ─────────────
-- The super admin is identified in SQL by is_super_admin() (migration 02), so
-- this only needs to create the row, never grant the privilege.

do $$
declare
  v_uid uuid;
begin
  select id into v_uid
    from auth.users
   where lower(email) = 'rujutapethe@gmail.com'
   limit 1;

  if v_uid is null then
    raise notice 'rbac: super admin auth user not present yet; bootstrap deferred';
    return;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (v_uid, 'rujutapethe@gmail.com', 'Super Admin', 'admin')
  on conflict (id) do update
    set role = 'admin', updated_at = now();

  raise notice 'rbac: super admin profile ready for %', v_uid;
end
$$;

raise notice 'rbac 01: types, tables, columns and onboarding trigger in place';