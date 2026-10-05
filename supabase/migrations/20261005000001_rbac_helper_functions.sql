-- =============================================================================
-- RBAC / 02 — Security-definer helpers
--
-- Every authorization decision in the app funnels through one of these. They
-- read the permission tables at query time, so revoking a board or a column
-- takes effect on the very next statement: nothing is cached in JWT claims or
-- in a session variable.
--
-- All of them are `stable`, `security definer`, and `set search_path = ''`.
-- The empty search_path means every reference is schema-qualified — that is
-- deliberate, and it is why `auth.uid()` rather than a bare `uid()` appears
-- throughout. A SECURITY DEFINER function that inherits the caller's
-- search_path is the classic way to get hijacked through a temp schema.
--
-- Because these functions are owned by the table owner and the tables do NOT
-- use `force row level security`, they bypass RLS themselves. That is what
-- makes it safe for a policy on `boards` to call `can_view_board()`, which
-- reads `boards` — with FORCE that would recurse until Postgres bailed out.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- ── is_super_admin ─────────────────────────────────────────────────────────
-- The one identity that cannot be demoted, deleted or restricted. Matched on
-- the JWT email exactly as specified, with the verified flag required — an
-- unverified account holding a matching email is not the super admin.
--
-- Under service_role there is no end-user JWT, so this correctly returns false;
-- service_role is a bypass, not a person, and the write triggers check for it
-- separately via is_service_role().

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = auth.uid()
       and lower(u.email) = 'rujutapethe@gmail.com'
       and u.email_confirmed_at is not null
  );
$$;

-- Same question, asked about some other user id. Used by the escalation guards
-- so they can tell "demoting an admin" from "demoting the super admin".

create or replace function public.is_super_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = p_user_id
       and lower(u.email) = 'rujutapethe@gmail.com'
       and u.email_confirmed_at is not null
  );
$$;

-- ── is_service_role ────────────────────────────────────────────────────────
-- True for requests made with the service_role key. The internal app uses that
-- key for its own reads and writes, so the write triggers in migration 03 use
-- this to distinguish an internal server write (allowed) from a client write
-- through the anon key (permission-checked). It is not a person and has no
-- user identity, so it never satisfies is_super_admin().

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

-- ── current_org_id ─────────────────────────────────────────────────────────
-- Resolves the caller's organization *from workspace membership*, which is
-- what fixes the "Unable to determine organization" failure: the old path read
-- workspace_members through the anon key and gave up whenever RLS returned
-- nothing. This resolves it through a SECURITY DEFINER function, which is not
-- subject to the caller's RLS.
--
-- Deliberately does NOT call current_role(), because current_role() calls this.
-- Breaking that cycle is why the role lookup below is spelled out inline.

create or replace function public.current_org_id()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org text;
begin
  if v_uid is null then
    return null;
  end if;

  select w.organization_id into v_org
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
   where wm.user_id = v_uid
   order by w.created_at asc
   limit 1;

  if v_org is not null then
    return v_org;
  end if;

  if public.is_super_admin() then
    select o.id into v_org
      from public.organizations o
     order by o.created_at asc
     limit 1;
    return v_org;
  end if;

  select om.organization_id into v_org
    from public.organization_members om
   where om.user_id = v_uid
   order by om.created_at asc
   limit 1;

  return v_org;
end
$$;

-- ── current_role ───────────────────────────────────────────────────────────
-- The organization-wide role: admin, staff or client. 'admin' is also what the
-- super admin resolves to; call is_super_admin() separately when the
-- distinction matters.

create or replace function public.current_role()
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.app_role;
begin
  if v_uid is null then
    return null;
  end if;

  if public.is_super_admin() then
    return 'admin';
  end if;

  select om.role into v_role
    from public.organization_members om
   where om.user_id = v_uid
     and om.organization_id = public.current_org_id();

  if v_role is null then
    select p.role into v_role
      from public.profiles p
     where p.id = v_uid;
  end if;

  return coalesce(v_role, 'client');
end
$$;

-- ── can_view_workspace / can_edit_workspace ───────────────────────────────

create or replace function public.can_view_workspace(p_workspace_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_kind  public.workspace_kind;
  v_owner uuid;
  v_org   text;
begin
  if v_uid is null or p_workspace_id is null then
    return false;
  end if;

  if public.is_super_admin() then
    return exists (select 1 from public.workspaces w where w.id = p_workspace_id);
  end if;

  select w.type, w.owner_id, w.organization_id
    into v_kind, v_owner, v_org
    from public.workspaces w
   where w.id = p_workspace_id;

  if not found then
    return false;
  end if;

  -- A personal workspace is closed by default. The owner always sees it, and
  -- anyone else needs an explicit row in workspace_personal_access. Admins get
  -- no blanket access to other people's personal workspaces.
  if v_kind = 'personal' then
    if v_owner = v_uid then
      return true;
    end if;
    return exists (
      select 1
        from public.workspace_personal_access a
       where a.workspace_id = p_workspace_id
         and a.user_id = v_uid
    );
  end if;

  -- Admins reach every non-personal workspace in their own organization.
  if public.current_role() = 'admin' then
    return v_org is not null and v_org = public.current_org_id();
  end if;

  -- Staff need an assignment; clients need a membership row.
  return exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id = v_uid
       and wm.can_view
  );
end
$$;

create or replace function public.can_edit_workspace(p_workspace_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_kind  public.workspace_kind;
  v_owner uuid;
  v_org   text;
begin
  if v_uid is null or p_workspace_id is null then
    return false;
  end if;

  if public.is_service_role() then
    return exists (select 1 from public.workspaces w where w.id = p_workspace_id);
  end if;

  if public.is_super_admin() then
    return exists (select 1 from public.workspaces w where w.id = p_workspace_id);
  end if;

  select w.type, w.owner_id, w.organization_id
    into v_kind, v_owner, v_org
    from public.workspaces w
   where w.id = p_workspace_id;

  if not found then
    return false;
  end if;

  if v_kind = 'personal' then
    if v_owner = v_uid then
      return true;
    end if;
    return exists (
      select 1
        from public.workspace_personal_access a
       where a.workspace_id = p_workspace_id
         and a.user_id = v_uid
         and a.can_edit
    );
  end if;

  if public.current_role() = 'admin' then
    return v_org is not null and v_org = public.current_org_id();
  end if;

  if public.current_role() = 'staff' then
    return exists (
      select 1
        from public.workspace_members wm
       where wm.workspace_id = p_workspace_id
         and wm.user_id = v_uid
         and wm.can_edit
    );
  end if;

  -- Clients never edit at workspace level. Their write access is per-column on
  -- a granted board, enforced by the cell_values trigger in migration 03.
  return false;
end
$$;

-- ── can_view_board / can_edit_board ────────────────────────────────────────

create or replace function public.can_view_board(p_board_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_ws   text;
begin
  if v_uid is null or p_board_id is null then
    return false;
  end if;

  select b.workspace_id into v_ws
    from public.boards b
   where b.id = p_board_id;

  if not found then
    return false;
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if public.current_role() = 'admin' then
    return public.can_view_workspace(v_ws);
  end if;

  if public.current_role() = 'staff' then
    if not public.can_view_workspace(v_ws) then
      return false;
    end if;

    -- Staff board-level override. This is the one place the pre-existing
    -- board_access_overrides table stays live: it is the "optional
    -- board-level override" for staff, and it can only ever narrow what
    -- workspace assignment already granted.
    if exists (
      select 1
        from public.board_access_overrides o
       where o.board_id = p_board_id
         and o.user_id = v_uid
         and o.access = 'revoked'
    ) then
      return false;
    end if;

    return true;
  end if;

  -- Clients: default deny, and the two layers must both pass. Membership of the
  -- client workspace is not implied by holding a board grant — a stale grant
  -- left behind after someone is removed from the workspace must not keep
  -- working on its own.
  if not public.can_view_workspace(v_ws) then
    return false;
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

create or replace function public.can_edit_board(p_board_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  text;
begin
  if v_uid is null or p_board_id is null then
    return false;
  end if;

  select b.workspace_id into v_ws
    from public.boards b
   where b.id = p_board_id;

  if not found then
    return false;
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if public.current_role() = 'admin' then
    return public.can_view_workspace(v_ws);
  end if;

  if public.current_role() = 'staff' then
    return public.can_edit_workspace(v_ws);
  end if;

  -- A client may modify rows on a board they have been granted. What they may
  -- actually change is decided per column by client_can_edit_column(); this
  -- predicate only answers "is this board within their granted set at all".
  return exists (
    select 1
      from public.client_board_access cba
     where cba.user_id = v_uid
       and cba.board_id = p_board_id
       and cba.can_view
  );
end
$$;

-- ── Column-level client permissions ─────────────────────────────────────────
-- Both column predicates require board access first, so a client can never
-- reach a column on a board they were not granted even if a stray
-- client_column_permissions row points at it.

create or replace function public.client_can_view_column(p_board_id text, p_column_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return false;
  end if;

  if not exists (
    select 1 from public.columns c
     where c.id = p_column_id and c.board_id = p_board_id
  ) then
    return false;
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if public.current_role() in ('admin', 'staff') then
    return true;
  end if;

  return exists (
    select 1
      from public.client_column_permissions ccp
     where ccp.user_id = auth.uid()
       and ccp.board_id = p_board_id
       and ccp.column_id = p_column_id
       and ccp.can_view
  );
end
$$;

create or replace function public.client_can_edit_column(p_board_id text, p_column_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return false;
  end if;

  if not exists (
    select 1 from public.columns c
     where c.id = p_column_id and c.board_id = p_board_id
  ) then
    return false;
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if public.current_role() in ('admin', 'staff') then
    return true;
  end if;

  return exists (
    select 1
      from public.client_column_permissions ccp
     where ccp.user_id = auth.uid()
       and ccp.board_id = p_board_id
       and ccp.column_id = p_column_id
       and ccp.can_edit
  );
end
$$;

-- The column set one user may see on a board. Every client-facing read path
-- filters on this, so hiding a column hides it from the table, filters, sort,
-- group-by, search, exports and dashboard charts at once — there is no second
-- code path that could forget.

create or replace function public.client_visible_column_ids(p_board_id text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return '{}'::text[];
  end if;

  if public.is_super_admin() or public.current_role() in ('admin', 'staff') then
    return coalesce(
      (select array_agg(c.id) from public.columns c where c.board_id = p_board_id),
      '{}'::text[]
    );
  end if;

  return coalesce(
    (
      select array_agg(ccp.column_id)
        from public.client_column_permissions ccp
       where ccp.user_id = auth.uid()
         and ccp.board_id = p_board_id
         and ccp.can_view
    ),
    '{}'::text[]
  );
end
$$;

-- ── accessible_workspace_ids ───────────────────────────────────────────────
-- The scoping list for global search, client search, notifications, the
-- activity feed and Overview analytics. Personal workspaces are excluded by
-- default because those surfaces must never leak them; a caller that genuinely
-- wants them has to ask for them by name.
--
-- Returns nothing for a client. Client search and org-wide Overview are not
-- client features, and handing a client the id of their own client workspace
-- here would confirm the existence of a workspace the brief says they should
-- not learn about. Their board data comes from the per-board RPCs instead.

create or replace function public.accessible_workspace_ids(p_include_personal boolean default false)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.app_role;
begin
  if v_uid is null then
    return '{}'::text[];
  end if;

  v_role := public.current_role();
  if v_role = 'client' then
    return '{}'::text[];
  end if;

  if p_include_personal then
    return coalesce(
      (
        select array_agg(w.id)
          from public.workspaces w
         where public.can_view_workspace(w.id)
      ),
      '{}'::text[]
    );
  end if;

  return coalesce(
    (
      select array_agg(w.id)
        from public.workspaces w
       where w.type <> 'personal'
         and public.can_view_workspace(w.id)
    ),
    '{}'::text[]
  );
end
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- authenticated needs EXECUTE to use these from policies and RPCs; anon gets
-- nothing, and PUBLIC is revoked so a future default grant cannot leak them.

revoke all on function public.is_super_admin() from public;
revoke all on function public.is_super_admin_user(uuid) from public;
revoke all on function public.is_service_role() from public;
revoke all on function public.current_org_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.can_view_workspace(text) from public;
revoke all on function public.can_edit_workspace(text) from public;
revoke all on function public.can_view_board(text) from public;
revoke all on function public.can_edit_board(text) from public;
revoke all on function public.client_can_view_column(text, text) from public;
revoke all on function public.client_can_edit_column(text, text) from public;
revoke all on function public.client_visible_column_ids(text) from public;
revoke all on function public.accessible_workspace_ids(boolean) from public;

grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.is_super_admin_user(uuid) to authenticated, service_role;
grant execute on function public.is_service_role() to authenticated, service_role;
grant execute on function public.current_org_id() to authenticated, service_role;
grant execute on function public.current_role() to authenticated, service_role;
grant execute on function public.can_view_workspace(text) to authenticated, service_role;
grant execute on function public.can_edit_workspace(text) to authenticated, service_role;
grant execute on function public.can_view_board(text) to authenticated, service_role;
grant execute on function public.can_edit_board(text) to authenticated, service_role;
grant execute on function public.client_can_view_column(text, text) to authenticated, service_role;
grant execute on function public.client_can_edit_column(text, text) to authenticated, service_role;
grant execute on function public.client_visible_column_ids(text) to authenticated, service_role;
grant execute on function public.accessible_workspace_ids(boolean) to authenticated, service_role;

-- `raise` is PL/pgSQL, so it is only legal inside a function body. Wrapped in a
-- DO block to reach the top level.
do $$
begin
  raise notice 'rbac 02: helpers in place (is_super_admin, current_role, current_org_id, can_view/edit_workspace, can_view/edit_board, client_can_view/edit_column, client_visible_column_ids, accessible_workspace_ids)';
end
$$;