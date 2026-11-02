-- Fix: Members modal role source-of-truth consistency
--
-- role (public.app_role enum) is the single source of truth. can_view/can_edit
-- derive from it:
--   View  => role='client',  can_view=true,  can_edit=false
--   Edit  => role='staff',   can_view=true,  can_edit=true
-- role_id (uuid FK to public.roles.id) is kept in sync by looking up the
-- matching system role (organization_id is null). No text is compared to a
-- uuid: workspace_id params are text, user_id/role_id/created_by are uuid, and
-- the roles lookup compares text name to text name and uuid id to uuid id.
--
-- Idempotent: safe to re-run whole.

create or replace function public.role_id_for_label(p_role public.app_role)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  select r.id into v_role_id
    from public.roles r
   where r.organization_id is null
     and r.name = case p_role
         when 'client' then 'Viewer'
         when 'staff'  then 'Employee'
         when 'admin'  then 'Administrator'
       end;
  if v_role_id is null then
    raise exception 'members: no system role mapping exists for %', p_role
      using errcode = 'P0002';
  end if;
  return v_role_id;
end
$$;

-- ── add_workspace_member: set role_id consistently with role + booleans ─────

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
  v_uid      uuid;
  v_role     public.app_role;
  v_can_edit boolean;
  v_role_id  uuid;
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

  v_role_id := public.role_id_for_label(v_role);

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

  insert into public.workspace_members (user_id, workspace_id, role_id, role, can_view, can_edit)
  values (v_uid, p_workspace_id::text, v_role_id, v_role, true, v_can_edit);

  return v_uid;
end
$$;

-- ── set_workspace_member_access: set role_id consistently on role change ───

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
  v_owner    uuid;
  v_role     public.app_role;
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
     set role_id = public.role_id_for_label(v_role),
         role    = v_role,
         can_view = true,
         can_edit = v_can_edit
   where workspace_id = p_workspace_id
     and user_id = p_user_id;

  if not found then
    raise exception 'members: that person is not a member of this workspace'
      using errcode = 'P0002';
  end if;
end
$$;

-- ── handle_new_user (accept-invite): mirror invite role_id into membership ─

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
    select w.organization_id into v_org_id
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
     where wm.user_id = v_user_id
     order by w.created_at asc
     limit 1;
  end if;

  if v_org_id is null then
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

  if v_inv.code is not null then
    insert into public.workspace_members (user_id, workspace_id, role_id, role, can_view, can_edit)
    values (v_user_id, v_inv.workspace_id, public.role_id_for_label(v_inv.role), v_inv.role, true, v_inv.role = 'staff')
    on conflict (user_id, workspace_id) do nothing;

    update public.workspace_invites
       set used_at = now(), used_by = v_user_id
     where code = v_inv.code;

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
