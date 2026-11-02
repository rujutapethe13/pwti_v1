-- Fix open signup when no invitation matches.
-- Apply in the Supabase SQL Editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := new.id;
  v_email text := lower(coalesce(new.email, ''));
  v_full_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  v_invite_code text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')), '');
  v_org_id text;
  v_inv record;
  v_has_invite boolean := false;
begin
  if v_email = '' then
    raise warning 'rbac: new auth user % has no email; skipping profile', v_user_id;
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_email, v_full_name, 'client')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = pg_catalog.now();

  select * into v_inv
    from public.workspace_invites i
   where i.used_at is null
     and (i.expires_at is null or i.expires_at > pg_catalog.now())
     and (
       (v_invite_code is not null and i.code = v_invite_code)
       or (v_invite_code is null and i.email is not null and lower(i.email) = v_email)
     )
   order by i.created_at desc
   limit 1;
  v_has_invite := found;

  if v_has_invite then
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

  if v_has_invite then
    insert into public.workspace_members (user_id, workspace_id, role, can_view, can_edit)
    values (v_user_id, v_inv.workspace_id, v_inv.role, v_inv.can_view, v_inv.can_edit)
    on conflict (user_id, workspace_id) do nothing;

    update public.workspace_invites
       set used_at = pg_catalog.now(), used_by = v_user_id
     where code = v_inv.code;

    if v_inv.role <> 'client' then
      update public.profiles
         set role = v_inv.role, updated_at = pg_catalog.now()
       where id = v_user_id;
      update public.organization_members
         set role = v_inv.role
       where organization_id = v_org_id and user_id = v_user_id;
    end if;
  end if;

  return new;
end
$$;
