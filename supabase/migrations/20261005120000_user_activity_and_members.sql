-- =============================================================================
-- User activity + member directory
--
-- Three things the account surfaces need and the schema did not have:
--
--   1. `last_login_at` / `last_active_at` on the user record, so "Last login"
--      and the online dot are real data rather than a hardcoded string.
--   2. A way to write those two timestamps from the caller's own JWT. That is
--      `touch_user_activity()`.
--   3. A member list for the Members & access modal, with the sensitive
--      columns withheld in the database rather than in the UI.
--
-- ── On "the users table" ────────────────────────────────────────────────────
-- There is no `public.users` table in this database. The user record is
-- `public.profiles` (migration 01), created for every auth user by
-- `handle_new_user()`. That is what these columns are added to, and it is what
-- the RPCs below read.
--
-- ── Why the privacy gate is in SQL ──────────────────────────────────────────
-- Members with View or Edit access see only name, email and role. Last login and
-- joined-on are withheld by nulling the column inside the function, so the
-- values never cross the wire and there is no second code path that could forget
-- to strip them. Hiding the column in a component is not the same control.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- ── profiles: activity timestamps ──────────────────────────────────────────

alter table public.profiles add column if not exists last_login_at  timestamptz;
alter table public.profiles add column if not exists last_active_at timestamptz;

-- The member list orders by last_active_at to find the online ones, and the
-- "stale session" sweep wants the oldest first.
create index if not exists profiles_last_active_at_idx
  on public.profiles (last_active_at desc nulls last);

-- ── touch_user_activity ────────────────────────────────────────────────────
-- Writes last_active_at on every heartbeat. p_is_login additionally stamps
-- last_login_at, and is called from the two places a login actually completes
-- (signInWithEmail and the OAuth/PKCE callback) rather than from app load, so a
-- page refresh does not rewrite history.
--
-- The `last_active_at < now() - 60 seconds` clause bounds the write rate: a
-- client that pings every 15 seconds performs one real UPDATE per minute, and a
-- background tab that pings anyway does not turn into a hot row.
--
-- Returns whether a row was written, so a caller can tell "recorded" from
-- "no profile row for this user" without a second query.

create or replace function public.touch_user_activity(p_is_login boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_written integer;
begin
  if v_uid is null then
    return false;
  end if;

  update public.profiles
     set last_active_at = now(),
         last_login_at  = case when p_is_login then now() else last_login_at end
   where id = v_uid
     and (p_is_login or last_active_at is null or last_active_at < now() - interval '60 seconds');

  get diagnostics v_written = row_count;

  return v_written > 0;
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

-- ── list_workspace_members ─────────────────────────────────────────────────
-- One row per member of the workspace, with the display role the UI shows
-- (Owner / Edit / View) derived from the same three columns the rest of the app
-- authorizes on: workspaces.owner_id, workspace_members.role, can_edit.
--
-- `status` is Active unless an unconsumed, unexpired invite still exists for
-- the member's address, which is what makes an invited-but-not-signed-up person
-- read as Pending rather than as a member who has never logged in.
--
-- For a caller who is not an owner or admin the last three columns come back
-- null. See the header note.

create or replace function public.list_workspace_members(p_workspace_id text)
returns table (
  user_id        uuid,
  full_name      text,
  email          text,
  avatar_url     text,
  role           text,
  status         text,
  last_active_at timestamptz,
  last_login_at  timestamptz,
  joined_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_privileged boolean;
begin
  if v_uid is null or p_workspace_id is null then
    return;
  end if;

  if not public.can_view_workspace(p_workspace_id) then
    raise exception 'rbac: you do not have access to this workspace'
      using errcode = '42501';
  end if;

  v_privileged := public.can_manage_workspace_members(p_workspace_id);

  return query
  select
    p.id,
    coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'User') as full_name,
    p.email,
    p.avatar_url,
    case
      when w.owner_id = p.id then 'owner'
      when wm.role = 'admin' then 'owner'
      when wm.can_edit then 'edit'
      else 'view'
    end as role,
    case
      when v_privileged and exists (
        select 1
          from public.workspace_invites i
         where i.workspace_id = p_workspace_id
           and i.used_at is null
           and (i.expires_at is null or i.expires_at > now())
           and i.email is not null
           and lower(i.email) = lower(p.email)
      ) then 'pending'
      when v_privileged then 'active'
      else null
    end as status,
    case when v_privileged then p.last_active_at else null end as last_active_at,
    case when v_privileged then p.last_login_at  else null end as last_login_at,
    case when v_privileged then wm.created_at     else null end as joined_at
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  join public.workspaces w on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id
  order by 2 asc;
end
$$;

-- ── list_board_members ─────────────────────────────────────────────────────
-- A board has no membership table of its own: its access is derived from the
-- workspace that contains it, so the board's member list is that workspace's
-- list. The board-level access tables (board_admins, board_access_overrides)
-- narrow or widen individual grants and are deliberately not folded in here —
-- presenting them as board members would name people who cannot open the board.
--
-- Both checks run: can_view_board for the board, and can_view_workspace again
-- inside list_workspace_members, so reaching this function without either
-- permission fails rather than returning an empty list that looks like a
-- workspace with nobody in it.

create or replace function public.list_board_members(p_board_id text)
returns table (
  user_id        uuid,
  full_name      text,
  email          text,
  avatar_url     text,
  role           text,
  status         text,
  last_active_at timestamptz,
  last_login_at  timestamptz,
  joined_at      timestamptz
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

  if v_ws is null then
    raise exception 'rbac: board not found' using errcode = '42501';
  end if;

  if not public.can_view_board(p_board_id) then
    raise exception 'rbac: board not found' using errcode = '42501';
  end if;

  return query
  select * from public.list_workspace_members(v_ws);
end
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- PUBLIC is revoked first so a future default grant cannot expose these.

revoke all on function public.touch_user_activity(boolean) from public;
revoke all on function public.can_manage_workspace_members(text) from public;
revoke all on function public.list_workspace_members(text) from public;
revoke all on function public.list_board_members(text) from public;

grant execute on function public.touch_user_activity(boolean) to authenticated, service_role;
grant execute on function public.can_manage_workspace_members(text) to authenticated, service_role;
grant execute on function public.list_workspace_members(text) to authenticated, service_role;
grant execute on function public.list_board_members(text) to authenticated, service_role;

-- Backfill nothing: last_login_at/last_active_at are unknown for users who
-- signed in before this migration, and inventing a value would be worse than
-- showing none. The first heartbeat after deploy fills last_active_at in.

-- `raise` is PL/pgSQL, so it is only legal inside a function body. Wrapped in a
-- DO block to reach the top level.
do $$
declare
  v_cols integer;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'profiles'
     and column_name in ('last_login_at', 'last_active_at');

  if v_cols <> 2 then
    raise exception 'user activity: expected last_login_at and last_active_at on public.profiles, found %', v_cols;
  end if;

  raise notice 'user activity: profiles.last_login_at / last_active_at in place';
  raise notice 'user activity: touch_user_activity, can_manage_workspace_members, list_workspace_members, list_board_members in place';
end
$$;