-- =============================================================================
-- RBAC / 06 — Board write guard: recognise admins and trusted DB roles
--
-- Problem this fixes
--   public.guard_board_write() only let a write through when
--   `public.is_service_role()` was true or `public.current_role() = 'admin'`.
--
--   An admin deleting from the Supabase dashboard SQL editor (or any direct
--   postgres connection) runs with no JWT: auth.uid() is NULL,
--   request.jwt.role is unset, is_service_role() is false, and current_role()
--   falls through to 'client'. The guard raised
--   "rbac: only an admin can create or delete boards", rolled the whole
--   workspace delete back, and the ON DELETE CASCADE into boards never
--   committed — so the item reappeared on refresh.
--
--   The app's own delete path (deleteWorkspaceInDb / BoardService.delete) uses
--   the service_role key, where is_service_role() is already true. That path
--   was fine; the dashboard path was not.
--
-- What changed
--   1. public.is_admin()        — a SECURITY DEFINER, case-safe admin test that
--                                  reads profiles, organization_members and
--                                  workspace_members and also honours the super
--                                  admin. Replaces the brittle
--                                  `current_role() = 'admin'` comparison, which
--                                  was case-sensitive and only ever read one
--                                  table for one organization.
--   2. public.is_trusted_db_role() — true for service_role (the internal app)
--                                  and for a direct postgres connection with no
--                                  JWT (the dashboard / SQL editor). Browser
--                                  anon calls carry request.jwt.role = 'anon' and
--                                  are excluded, and RLS on boards already denies
--                                  them before this trigger ever runs.
--   3. guard_board_write()       — rewritten to use both helpers. The
--                                  non-admin fallbacks (can_edit_board, workspace
--                                  owner) are unchanged.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- ── 1. is_admin ──────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  -- The super admin is an admin, and is identified by email rather than by a
  -- role string, so check it first.
  if public.is_super_admin() then
    return true;
  end if;

  -- Case-safe across every place a role is stored. 'Admin', 'ADMIN' and 'admin'
  -- all count; a legacy casing such as 'Super_Admin' would not have matched the
  -- original `current_role() = 'admin'` at all.
  if exists (select 1 from public.profiles p where p.id = v_uid and lower(p.role) = 'admin') then
    return true;
  end if;

  if exists (
    select 1 from public.organization_members om
    where om.user_id = v_uid and lower(om.role) = 'admin'
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.workspace_members wm
    where wm.user_id = v_uid and lower(wm.role) = 'admin'
  ) then
    return true;
  end if;

  return false;
end
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- ── 2. is_trusted_db_role ────────────────────────────────────────────────────

create or replace function public.is_trusted_db_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_setting('request.jwt.role', true), '') = 'service_role'
      or (current_setting('request.jwt.role', true) is null and auth.uid() is null)
$$;

revoke all on function public.is_trusted_db_role() from public;
grant execute on function public.is_trusted_db_role() to authenticated, service_role;

-- ── 3. guard_board_write ─────────────────────────────────────────────────────

create or replace function public.guard_board_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(tg_op, 'INSERT');
begin
  -- Trusted server-side roles: the internal app (service_role) and a direct
  -- postgres connection with no JWT (the Supabase dashboard / SQL editor). These
  -- carry no end-user identity, so they never satisfy is_admin(); for
  -- service_role the real authorization still happens in the server guard layer
  -- before the call is issued, and for the dashboard the operator is running as
  -- the database owner and is accountable for what they run.
  if public.is_trusted_db_role() then
    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Super admin and admin may create and delete boards. This is the path an
  -- admin hits from the app: auth.uid() is set and is_admin() reads their role.
  if public.is_admin() then
    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Non-admin DELETE fallbacks, unchanged from the original guard.
  if v_mode = 'DELETE' and OLD.id is not null then
    if public.can_edit_board(OLD.id) then
      return old;
    end if;

    if exists (
      select 1
        from public.boards b
        join public.workspaces w on w.id = b.workspace_id
       where b.id = OLD.id
        and w.owner_id = auth.uid()
    ) then
      return old;
    end if;
  end if;

  raise exception 'rbac: only an admin can create or delete boards'
    using errcode = '42501';
end
$$;

do $$
begin
  raise notice 'rbac 06: is_admin(), is_trusted_db_role() and guard_board_write() in place';
end
$$;