-- Workspace: multiple owners per workspace
--
-- Adds `is_owner` to workspace_members so a workspace can have more than one
-- owner alongside the legacy single `workspaces.owner_id`. `resolve_workspace_access`
-- treats either as owner access, so owners appear as "Owner" everywhere and can
-- manage memberships.
--
-- Write RPCs refuse to remove or demote the last remaining owner.
--
-- Owner grants use `role='admin'` (a valid app_role enum value) plus
-- `is_owner=true`; invites use `role='staff'` plus `is_owner=true` to avoid the
-- `workspace_invites_no_admin_role` check constraint. We deliberately do NOT
-- add 'owner' to the app_role enum because Postgres forbids using a newly added
-- enum value in the same transaction.
--
-- Idempotent: safe to re-run whole.

alter table public.workspace_members add column if not exists is_owner boolean not null default false;
alter table public.workspace_invites add column if not exists is_owner boolean not null default false;

create index if not exists workspace_members_is_owner_idx
  on public.workspace_members (workspace_id, is_owner)
  where is_owner;

-- ── resolve_workspace_access: members flagged is_owner are owners too ──

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
  v_is_owner boolean;
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

  -- The legacy single owner column.
  if v_owner = p_user_id then
    return 'owner';
  end if;

  select wm.role::text, wm.can_edit, wm.is_owner
    into v_role, v_can_edit, v_is_owner
    from public.workspace_members wm
   where wm.workspace_id = p_workspace_id
     and wm.user_id = p_user_id;

  if not found then
    return null;
  end if;

  if v_is_owner then
    return 'owner';
  end if;

  if v_role = 'admin' or v_role = 'staff' or v_can_edit then
    return 'edit';
  end if;

  return 'view';
end
$$;

-- ── Guard: never remove or demote the last owner ──

create or replace function public.set_workspace_member_access(
  p_workspace_id text,
  p_user_id      uuid,
  p_access       text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_owner_count integer;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can change access'
      using errcode = '42501';
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

  -- Demoting an owner: refuse if it would leave the workspace without an owner.
  if p_access <> 'owner' then
    select count(*) into v_owner_count
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.is_owner;
    if v_owner_count <= 1 and exists (
      select 1 from public.workspace_members wm
       where wm.workspace_id = p_workspace_id
         and wm.user_id = p_user_id
         and wm.is_owner
    ) then
      raise exception 'members: cannot demote the last owner'
        using errcode = '42501';
    end if;
  end if;

  update public.workspace_members
     set role = case when p_access = 'owner' then 'admin' else p_access end,
         can_edit = (p_access <> 'view'),
         is_owner = (p_access = 'owner')
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
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_owner_count integer;
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

  -- Removing an owner: refuse if it would leave the workspace without an owner.
  select count(*) into v_owner_count
    from public.workspace_members wm
   where wm.workspace_id = p_workspace_id
     and wm.is_owner;
  if v_owner_count <= 1 and exists (
    select 1 from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id = p_user_id
       and wm.is_owner
  ) then
    raise exception 'members: cannot remove the last owner' using errcode = '42501';
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

create or replace function public.add_workspace_member(
  p_workspace_id text,
  p_email        text,
  p_access       text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can add members'
      using errcode = '42501';
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

  insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit, is_owner)
  values (
    v_uid, p_workspace_id,
    case when p_access = 'owner' then 'admin' else p_access end,
    true,
    p_access <> 'view',
    p_access = 'owner'
  );

  return v_uid;
end
$$;

create or replace function public.invite_workspace_member(
  p_workspace_id text,
  p_email        text,
  p_access       text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can invite'
      using errcode = '42501';
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
    code, workspace_id, email, role, can_view, can_edit, is_owner, created_by, expires_at
  )
  values (
    v_code, p_workspace_id, lower(trim(p_email)),
    case when p_access = 'owner' then 'staff' else p_access end,
    true,
    p_access <> 'view',
    p_access = 'owner',
    auth.uid(),
    now() + interval '14 days'
  );

  return v_code;
end
$$;

do $$
begin
  raise notice 'multiple_owners: is_owner columns and owner-aware resolve_workspace_access in place';
end
$$;
