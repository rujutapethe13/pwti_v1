-- ────────────────────────────────────────────────────────────
-- Migration: Fix trigger function privileges (42501 errors)
-- ────────────────────────────────────────────────────────────
--
-- ROOT CAUSE
--   Two functions were declared SECURITY INVOKER (the default), but
--   they query tables that have Row-Level Security enabled:
--
--   1. public.is_workspace_member() — SELECTs from public.workspace_members
--      The workspace_members SELECT policy is self-referential and uses
--      this very function. With SECURITY INVOKER, the policy re-enters
--      RLS on workspace_members, causing either infinite recursion or
--      42501 (insufficient_privilege) for callers who can't see those rows.
--
--   2. public.validate_connect_board_cell_value() — SELECTs from
--      public.columns to determine the column type. The columns table has
--      RLS enforced by 20260826_rls_core_metadata.sql. With SECURITY
--      INVOKER, callers without a workspace_members row (e.g. the
--      service_role via anon path, or any user whose policy check denies
--      SELECT) trigger error 42501.
--
-- FIX
--   Convert both functions to SECURITY DEFINER with an explicit
--   search_path, so they read the protected tables as the function owner
--   (table owner), bypassing RLS. Both functions are strictly read-only:
--     - is_workspace_member: SELECT EXISTS (read-only check)
--     - validate_connect_board_cell_value: SELECT ... INTO (read-only lookup)
--   No data mutation or exfiltration is possible.
--
-- This mirrors the pattern already established by
--   supabase/Fix infinite recursion in workspace_members.sql
-- and check_permission_manage() (which is already SECURITY DEFINER).

-- ── 1. is_workspace_member ───────────────────────────────────

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

-- ── 2. validate_connect_board_cell_value ──────────────────────

create or replace function public.validate_connect_board_cell_value()
returns trigger
language plpgsql
security definer
as $$
declare
  v_column_type text;
  v_value jsonb := new.value;
begin
  select type into v_column_type from public.columns where id = new.column_id;

  if v_column_type is distinct from 'connect_board' then
    return new;
  end if;

  if v_value is null then
    return new;
  end if;

  if jsonb_typeof(v_value) <> 'object' or not (v_value ? 'linked_item_ids') then
    raise exception 'connect_board cell value must be an object with a linked_item_ids array';
  end if;

  if jsonb_typeof(v_value->'linked_item_ids') <> 'array' then
    raise exception 'connect_board cell value.linked_item_ids must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_value->'linked_item_ids') as item
    where jsonb_typeof(item->'board_id') <> 'string'
       or jsonb_typeof(item->'item_id') <> 'string'
  ) then
    raise exception 'connect_board cell value.linked_item_ids entries must each have string board_id and item_id';
  end if;

  return new;
end;
$$;
