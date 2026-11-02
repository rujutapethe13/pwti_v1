-- Members role mapping and UUID-safe invite path.
-- UI keys are view/edit; database roles are Viewer/Employee and client/staff.

create or replace function public.role_id_for_access(
  p_workspace_id text,
  p_access text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role_name text;
  v_org_id text;
  v_role_id uuid;
begin
  v_role_name := case p_access
    when 'view' then 'Viewer'
    when 'edit' then 'Employee'
    else null
  end;
  if v_role_name is null then
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;

  select w.organization_id into v_org_id
    from public.workspaces w
   where w.id = p_workspace_id;

  select r.id into v_role_id
    from public.roles r
   where r.name = v_role_name
     and (r.organization_id = v_org_id or r.is_system_role)
   order by (r.organization_id = v_org_id) desc, r.is_system_role desc
   limit 1;

  if v_role_id is null then
    raise exception 'members: no role named % exists for workspace %', v_role_name, p_workspace_id
      using errcode = 'P0002';
  end if;
  return v_role_id;
end
$$;

create or replace function public.invite_workspace_member(
  p_workspace_id text,
  p_email text,
  p_access text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_role_id uuid;
  v_can_edit boolean;
  v_code text;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can invite'
      using errcode = '42501';
  end if;

  v_role := case p_access
    when 'view' then 'client'::public.app_role
    when 'edit' then 'staff'::public.app_role
    else null
  end;
  if v_role is null then
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;
  v_can_edit := p_access = 'edit';
  v_role_id := public.role_id_for_access(p_workspace_id, p_access);

  if exists (
    select 1 from public.workspace_invites i
     where i.workspace_id = p_workspace_id
       and i.email = lower(trim(p_email))
       and i.used_at is null
       and (i.expires_at is null or i.expires_at > now())
  ) then
    raise exception 'members: that person already has a pending invite' using errcode = '23505';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '');
  insert into public.workspace_invites
    (code, workspace_id, email, role, can_view, can_edit, created_by, expires_at)
  values
    (v_code, p_workspace_id, lower(trim(p_email)), v_role, true, v_can_edit,
     auth.uid(), now() + interval '14 days');
  return v_code;
end
$$;

create or replace function public.add_workspace_member(
  p_workspace_id text, p_email text, p_access text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid;
  v_role public.app_role;
  v_role_id uuid;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can add members'
      using errcode = '42501';
  end if;
  v_role := case p_access when 'view' then 'client'::public.app_role
                           when 'edit' then 'staff'::public.app_role end;
  if v_role is null then
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;
  v_role_id := public.role_id_for_access(p_workspace_id, p_access);
  select u.id into v_uid from auth.users u
   where lower(u.email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'members: no account exists for %', p_email using errcode = 'P0002';
  end if;
  if exists (select 1 from public.workspace_members wm
             where wm.workspace_id = p_workspace_id and wm.user_id = v_uid) then
    raise exception 'members: that person is already a member' using errcode = '23505';
  end if;
  insert into public.workspace_members
    (user_id, workspace_id, role_id, role, can_view, can_edit)
  values (v_uid, p_workspace_id, v_role_id, v_role, true, p_access = 'edit');
  return v_uid;
end
$$;

create or replace function public.set_workspace_member_access(
  p_workspace_id text, p_user_id uuid, p_access text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
  v_role public.app_role;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can change access'
      using errcode = '42501';
  end if;
  v_role := case p_access when 'view' then 'client'::public.app_role
                           when 'edit' then 'staff'::public.app_role end;
  if v_role is null then
    raise exception 'members: access must be either edit or view' using errcode = '22023';
  end if;
  select w.owner_id into v_owner from public.workspaces w where w.id = p_workspace_id;
  if v_owner = p_user_id or p_user_id = auth.uid() then
    raise exception 'members: the owner or yourself cannot be changed' using errcode = '42501';
  end if;
  update public.workspace_members
     set role_id = public.role_id_for_access(p_workspace_id, p_access),
         role = v_role, can_view = true, can_edit = (p_access = 'edit')
   where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then
    raise exception 'members: that person is not a member of this workspace' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.remove_workspace_member(p_workspace_id text, p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  if not public.can_manage_members(p_workspace_id, null) then
    raise exception 'members: only the owner and users with edit access can remove members'
      using errcode = '42501';
  end if;
  select w.owner_id into v_owner from public.workspaces w where w.id = p_workspace_id;
  if v_owner = p_user_id or p_user_id = auth.uid() then
    raise exception 'members: the owner or yourself cannot be removed' using errcode = '42501';
  end if;
  delete from public.workspace_members
   where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then
    raise exception 'members: that person is not a member of this workspace' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id text;
  v_inv record;
  v_role_id uuid;
  v_role public.app_role;
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, lower(coalesce(new.email, '')),
          nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''), 'client')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();

  select i.* into v_inv from public.workspace_invites i
   where i.used_at is null and (i.expires_at is null or i.expires_at > now())
     and ((nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '') is not null
           and i.code = nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''))
       or (i.email is not null and lower(i.email) = lower(new.email)))
   order by i.created_at desc limit 1;

  if found then
    select w.organization_id into v_org_id
      from public.workspaces w where w.id = v_inv.workspace_id;
    v_role := v_inv.role;
    v_role_id := public.role_id_for_access(v_inv.workspace_id,
      case when v_role = 'client' then 'view' else 'edit' end);
    if v_org_id is not null then
      insert into public.organization_members (organization_id, user_id, role)
      values (v_org_id, new.id, 'client')
      on conflict (organization_id, user_id) do nothing;
    end if;
    insert into public.workspace_members
      (user_id, workspace_id, role_id, role, can_view, can_edit)
    values (new.id, v_inv.workspace_id, v_role_id, v_role, true, v_role = 'staff')
    on conflict (user_id, workspace_id) do nothing;
    update public.workspace_invites set used_at = now(), used_by = new.id
     where code = v_inv.code;
    if v_role <> 'client' then
      update public.profiles set role = v_role, updated_at = now()
       where id = new.id;
      if v_org_id is not null then
        update public.organization_members set role = v_role
         where organization_id = v_org_id and user_id = new.id;
      end if;
    end if;
  end if;
  return new;
end
$$;
