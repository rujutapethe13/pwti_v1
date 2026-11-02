-- Fix members UUID/text mismatches - revert bad casts
-- The schema uses text IDs for workspaces/boards, so no UUID casting needed

create or replace function public.add_workspace_member(
  p_workspace_id text,
  p_email        text,
  p_access       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as 
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
;
;
;
;
;

create or replace function public.can_manage_members(p_workspace_id text, p_board_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as 
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
;
;
;
;
