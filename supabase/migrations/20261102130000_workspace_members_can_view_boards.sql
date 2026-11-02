-- Workspace members can see the workspace contents.
-- Apply in the Supabase SQL Editor.

create or replace function public.can_view_board(p_board_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws text;
begin
  if v_uid is null or p_board_id is null then
    return false;
  end if;

  select b.workspace_id into v_ws
    from public.boards b
   where b.id = p_board_id
     and b.status is distinct from 'archived';

  if not found then
    return false;
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  -- Admins, staff, and clients who were added to the workspace may see its
  -- boards. Board-level client grants remain supported for compatibility.
  if public.can_view_workspace(v_ws) then
    return true;
  end if;

  return exists (
    select 1
      from public.client_board_access cba
     where cba.user_id = v_uid
       and cba.board_id = p_board_id
       and cba.can_view
  );
end
$$;
