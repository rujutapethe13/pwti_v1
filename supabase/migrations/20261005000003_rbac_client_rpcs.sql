-- =============================================================================
-- RBAC / 03 â€” Write guards, role-escalation guards, audit, and the client RPCs
--
-- Two enforcement styles live here:
--
--   1. Triggers. Column- and row-level write control cannot be expressed as an
--      RLS policy over a whole-table UPDATE, so the checks sit in BEFORE
--      triggers that compare OLD against NEW and raise. RLS still decides
--      *whether a statement reaches the table at all*; the trigger decides
--      *which parts of it are allowed*.
--
--   2. RPCs. Clients get no direct SELECT on boards, columns or records. They
--      read through get_my_boards / get_board_columns / get_board_items /
--      get_board_cell_values / get_board_groups, which filter at the row level
--      and return nothing at all for a board they were not granted.
--
-- Every trigger begins by letting service_role through. The internal app reads
-- and writes with the service_role key, which bypasses RLS but NOT triggers, so
-- without that early return every board edit in the product would start failing.
-- service_role is not a person: it carries no user identity, so it never
-- satisfies is_super_admin(), and the internal authorization still has to happen
-- in the server guard layer before a service-role call is issued.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- =============================================================================
-- Role escalation guards
-- =============================================================================

-- Nobody changes their own role. Only the super admin grants admin. Admins
-- grant staff. The super admin cannot be demoted, by anyone including
-- themselves.

create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no_actor boolean := auth.uid() is null;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if public.is_service_role() then
    return new;
  end if;

  -- Self-promotion. Covers a user editing their own profiles row, and an admin
  -- editing their own workspace_members row.
  if not v_no_actor and old.user_id is not null and old.user_id = auth.uid() then
    raise exception 'rbac: you cannot change your own role'
      using errcode = '42501';
  end if;

  -- The super admin is not demotable. The one transition allowed is NULL ->
  -- 'admin': that records their role on a membership row that simply had not
  -- been set yet, and it grants nothing they do not already hold. It exists so
  -- the migration backfill in file 05 can complete on their own rows — without
  -- it, `set not null` on workspace_members.role could never be satisfied for
  -- the super admin, and the alternative would be a migration-wide bypass that
  -- also permits real demotions.
  if public.is_super_admin_user(old.user_id)
     and new.role is distinct from 'admin'::public.app_role then
    raise exception 'rbac: the super admin role cannot be changed'
      using errcode = '42501';
  end if;

  -- "Only the super admin can create admins" is a rule about *users*, so it only
  -- applies when there is a user. With auth.uid() null there is no actor: the
  -- statement came from the dashboard, or from a SECURITY DEFINER trigger such as
  -- sync_organization_members_role. Both are trusted server-side code that has
  -- already passed every user-facing check — and RLS on profiles,
  -- organization_members and workspace_members denies an unauthenticated request
  -- outright, so no browser can reach this path with a null uid.
  if new.role = 'admin' and not v_no_actor and not public.is_super_admin() then
    raise exception 'rbac: only the super admin can grant the admin role'
      using errcode = '42501';
  end if;

  if new.role = 'staff'
     and not v_no_actor
     and not (public.is_super_admin() or public.current_role() = 'admin') then
    raise exception 'rbac: only an admin can grant the staff role'
      using errcode = '42501';
  end if;

  return new;
end
$$;

-- organization_members carries organization_id, not just user_id, so it needs
-- its own copy of the check rather than sharing the one above.
create or replace function public.guard_org_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no_actor boolean := auth.uid() is null;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if public.is_service_role() then
    return new;
  end if;

  if not v_no_actor and old.user_id = auth.uid() then
    raise exception 'rbac: you cannot change your own role'
      using errcode = '42501';
  end if;

  -- Same rules as guard_role_change; see that function for why the
  -- super-admin exception allows NULL -> 'admin' and why "no actor" exempts a
  -- role assignment from the escalation checks.
  if public.is_super_admin_user(old.user_id)
     and new.role is distinct from 'admin'::public.app_role then
    raise exception 'rbac: the super admin role cannot be changed'
      using errcode = '42501';
  end if;

  if new.role = 'admin' and not v_no_actor and not public.is_super_admin() then
    raise exception 'rbac: only the super admin can grant the admin role'
      using errcode = '42501';
  end if;

  if new.role = 'staff'
     and not v_no_actor
     and not (public.is_super_admin() or public.current_role() = 'admin') then
    raise exception 'rbac: only an admin can grant the staff role'
      using errcode = '42501';
  end if;

  return new;
end
$$;

drop trigger if exists guard_profiles_role on public.profiles;
create trigger guard_profiles_role
  before update of role on public.profiles
  for each row execute function public.guard_role_change();

drop trigger if exists guard_workspace_members_role on public.workspace_members;
create trigger guard_workspace_members_role
  before update of role on public.workspace_members
  for each row execute function public.guard_role_change();

drop trigger if exists guard_organization_members_role on public.organization_members;
create trigger guard_organization_members_role
  before update of role on public.organization_members
  for each row execute function public.guard_org_member_role_change();

-- The super admin's auth account cannot be deleted, by anyone.
--
-- Note there is no service_role bypass here, unlike every other guard in this
-- file. The app holds the service_role key in many server modules, so a bypass
-- would mean "anyone who can run a server action can delete the super admin",
-- which is the opposite of what the requirement asks for. Recovery from a lost
-- super-admin account is a manual `drop trigger` in the dashboard SQL editor —
-- deliberate, auditable, and not something an application request can reach.
create or replace function public.guard_super_admin_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(old.email) = 'rujutapethe@gmail.com' then
    raise exception 'rbac: the super admin account cannot be deleted'
      using errcode = '42501';
  end if;
  return old;
end
$$;

drop trigger if exists guard_super_admin_delete on auth.users;
create trigger guard_super_admin_delete
  before delete on auth.users
  for each row execute function public.guard_super_admin_deletion();

-- =============================================================================
-- Client write guards
-- =============================================================================

-- Creates: a client may insert only where an admin set can_create.
create or replace function public.guard_record_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_service_role() or public.is_super_admin() then
    return new;
  end if;

  if public.current_role() in ('admin', 'staff') then
    if not public.can_edit_workspace(new.workspace_id) then
      raise exception 'rbac: you cannot create records in this workspace'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not exists (
    select 1
      from public.client_board_access cba
     where cba.user_id = auth.uid()
       and cba.board_id = new.board_id
       and cba.workspace_id = new.workspace_id
       and cba.can_view
       and cba.can_create
  ) then
    raise exception 'rbac: you do not have permission to create records on this board'
      using errcode = '42501';
  end if;

  return new;
end
$$;

-- Updates: identity columns are immutable, so a client cannot walk a record
-- onto a board or into a group they were not granted.
create or replace function public.guard_record_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_service_role() or public.is_super_admin() then
    return new;
  end if;

  if new.board_id     is distinct from old.board_id
     or new.workspace_id is distinct from old.workspace_id
     or new.organization_id is distinct from old.organization_id
     or new.group_id  is distinct from old.group_id then
    raise exception 'rbac: board, workspace, organization and group cannot be changed'
      using errcode = '42501';
  end if;

  if public.current_role() in ('admin', 'staff') then
    if not public.can_edit_workspace(new.workspace_id) then
      raise exception 'rbac: you cannot edit records in this workspace'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not public.can_edit_board(new.board_id) then
    raise exception 'rbac: you cannot edit records on this board'
      using errcode = '42501';
  end if;

  return new;
end
$$;

create or replace function public.guard_record_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_service_role() or public.is_super_admin() then
    return old;
  end if;

  if public.current_role() in ('admin', 'staff') then
    if not public.can_edit_workspace(old.workspace_id) then
      raise exception 'rbac: you cannot delete records in this workspace'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not exists (
    select 1
      from public.client_board_access cba
     where cba.user_id = auth.uid()
       and cba.board_id = old.board_id
       and cba.can_view
       and cba.can_delete
  ) then
    raise exception 'rbac: you do not have permission to delete records on this board'
      using errcode = '42501';
  end if;

  return old;
end
$$;

-- Cell values are the item's data. Because this schema stores cells one row per
-- (record, column) rather than as a values jsonb blob, the "compare OLD vs NEW
-- key by key" rule becomes: this row's column must be editable. That is both
-- stricter and simpler than a blob diff â€” there is no way to smuggle a second
-- column's change through a single write.

create or replace function public.guard_cell_value_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode    text := coalesce(tg_op, 'INSERT');
  v_board   text;
  v_column  text;
begin
  if public.is_service_role() or public.is_super_admin() then
    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_mode = 'DELETE' then
    v_board := old.board_id;
    v_column := old.column_id;
  else
    v_board := new.board_id;
    v_column := new.column_id;
  end if;

  if public.current_role() in ('admin', 'staff') then
    if not public.can_edit_workspace(
      (select w.workspace_id from public.workspaces w where w.id = v_board)
    ) then
      raise exception 'rbac: you cannot edit cells on this board'
        using errcode = '42501';
    end if;

    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- INSERT: creating a cell is a write to that column, so it needs can_edit.
  -- There is no separate can_create for cells â€” creating a value in a column
  -- you cannot edit would be a back door around can_edit = false.
  if not public.client_can_edit_column(v_board, v_column) then
    raise exception 'rbac: you do not have permission to edit column %', v_column
      using errcode = '42501';
  end if;

  -- UPDATE: also refuse a write that retargets the row at a different column,
  -- which would sidestep the check above by moving an editable value into a
  -- read-only column's row.
  if v_mode = 'UPDATE'
     and (new.column_id is distinct from old.column_id
          or new.record_id  is distinct from old.record_id
          or new.board_id   is distinct from old.board_id) then
    raise exception 'rbac: column, record and board cannot be changed on a cell'
      using errcode = '42501';
  end if;

  if v_mode = 'DELETE' then
    -- Deleting a cell is destroying data, so it also needs can_delete.
    if not exists (
      select 1
        from public.client_board_access cba
       where cba.user_id = auth.uid()
         and cba.board_id = v_board
         and cba.can_view
         and cba.can_delete
    ) then
      raise exception 'rbac: you do not have permission to delete cells on this board'
        using errcode = '42501';
    end if;
    return old;
  end if;

  return new;
end
$$;

create or replace function public.guard_group_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode  text := coalesce(tg_op, 'INSERT');
  v_ws    text;
  v_board text;
begin
  if v_mode = 'INSERT' then
    v_ws := new.workspace_id;
    v_board := new.board_id;
  else
    v_ws := old.workspace_id;
    v_board := old.board_id;
  end if;

  if public.is_service_role() or public.is_super_admin() then
    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if public.current_role() in ('admin', 'staff') then
    if not public.can_edit_workspace(v_ws) then
      raise exception 'rbac: you cannot manage groups in this workspace'
        using errcode = '42501';
    end if;
  else
    if not exists (
      select 1
        from public.client_board_access cba
       where cba.user_id = auth.uid()
         and cba.board_id = v_board
         and cba.can_view
         and (case when v_mode = 'INSERT' then cba.can_create else cba.can_delete end)
    ) then
      raise exception 'rbac: you do not have permission to manage groups on this board'
        using errcode = '42501';
    end if;
  end if;

  if v_mode = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.guard_board_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(tg_op, 'INSERT');
begin
  if public.is_service_role() or public.is_super_admin() then
    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if public.current_role() = 'admin' then
    if v_mode = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

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

drop trigger if exists guard_records_insert on public.records;
create trigger guard_records_insert
  before insert on public.records
  for each row execute function public.guard_record_insert();

drop trigger if exists guard_records_update on public.records;
create trigger guard_records_update
  before update on public.records
  for each row execute function public.guard_record_update();

drop trigger if exists guard_records_delete on public.records;
create trigger guard_records_delete
  before delete on public.records
  for each row execute function public.guard_record_delete();

drop trigger if exists guard_cell_values_insert on public.cell_values;
create trigger guard_cell_values_insert
  before insert on public.cell_values
  for each row execute function public.guard_cell_value_write();

drop trigger if exists guard_cell_values_update on public.cell_values;
create trigger guard_cell_values_update
  before update on public.cell_values
  for each row execute function public.guard_cell_value_write();

drop trigger if exists guard_cell_values_delete on public.cell_values;
create trigger guard_cell_values_delete
  before delete on public.cell_values
  for each row execute function public.guard_cell_value_write();

drop trigger if exists guard_groups_insert on public.groups;
create trigger guard_groups_insert
  before insert on public.groups
  for each row execute function public.guard_group_write();

drop trigger if exists guard_groups_update on public.groups;
create trigger guard_groups_update
  before update on public.groups
  for each row execute function public.guard_group_write();

drop trigger if exists guard_groups_delete on public.groups;
create trigger guard_groups_delete
  before delete on public.groups
  for each row execute function public.guard_group_write();

drop trigger if exists guard_boards_insert on public.boards;
create trigger guard_boards_insert
  before insert on public.boards
  for each row execute function public.guard_board_write();

drop trigger if exists guard_boards_delete on public.boards;
create trigger guard_boards_delete
  before delete on public.boards
  for each row execute function public.guard_board_write();


-- =============================================================================
-- Client read RPCs
--
-- A client has no direct SELECT on boards, columns, records or cell_values.
-- Every one of these returns nothing at all for a board they were not granted,
-- and every one of them filters columns through client_visible_column_ids() so
-- a hidden column is absent from the payload rather than merely blank.
--
-- The early `if not can_view_board then return` is what makes an ungranted
-- board indistinguishable from a nonexistent one, which is what the brief
-- asks for: the RPC must not confirm that some other board exists.
-- =============================================================================

-- ── get_my_workspaces ──────────────────────────────────────────────────────
-- Sidebar workspaces. can_view_workspace already encodes the personal rule
-- (owner plus explicit grants), so a personal workspace shows up for its owner
-- and for anyone it was shared with, and for nobody else.
create or replace function public.get_my_workspaces()
returns table (
  id              text,
  organization_id text,
  name            text,
  slug            text,
  description     text,
  type            public.workspace_kind,
  can_view        boolean,
  can_edit        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id,
         w.organization_id,
         w.name,
         w.slug,
         w.description,
         w.type,
         public.can_view_workspace(w.id),
         public.can_edit_workspace(w.id)
    from public.workspaces w
   where public.can_view_workspace(w.id)
   order by w.created_at asc;
$$;

-- ── get_my_boards ──────────────────────────────────────────────────────────
create or replace function public.get_my_boards()
returns table (
  id              text,
  workspace_id    text,
  slug            text,
  name            text,
  icon            text,
  can_view        boolean,
  can_create      boolean,
  can_delete      boolean,
  can_edit_board  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
    select b.id,
           b.workspace_id,
           b.slug,
           b.name,
           b.icon,
           true,
           case when public.current_role() = 'client'
                then coalesce(cba.can_create, false) else true end,
           case when public.current_role() = 'client'
                then coalesce(cba.can_delete, false) else true end,
           public.can_edit_board(b.id)
      from public.boards b
      left join public.client_board_access cba
             on cba.board_id = b.id
            and cba.user_id = auth.uid()
     where public.can_view_board(b.id)
       and b.status is distinct from 'archived'
     order by b.created_at asc;
end
$$;

-- ── get_board_columns ──────────────────────────────────────────────────────
-- Only viewable columns, each carrying whether this caller may edit it. The
-- table view renders the second flag as a read-only cell and omits rows the
-- filter already dropped, so a hidden column cannot be reached through the UI
-- even by guessing an id.
create or replace function public.get_board_columns(p_board_id text)
returns table (
  id          text,
  key         text,
  label       text,
  type        text,
  sort_order  integer,
  required    boolean,
  settings    jsonb,
  can_view    boolean,
  can_edit    boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return;
  end if;

  return query
    select c.id,
           c.key,
           c.label,
           c.type,
           c.sort_order,
           c.required,
           c.settings,
           true,
           public.client_can_edit_column(p_board_id, c.id)
      from public.columns c
     where c.board_id = p_board_id
       and public.client_can_view_column(p_board_id, c.id)
     order by c.sort_order asc, c.created_at asc;
end
$$;

-- ── get_board_items ────────────────────────────────────────────────────────
create or replace function public.get_board_items(p_board_id text)
returns table (
  id           text,
  board_id     text,
  workspace_id text,
  group_id     text,
  title        text,
  status       text,
  created_at   timestamptz,
  updated_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return;
  end if;

  return query
    select r.id, r.board_id, r.workspace_id, r.group_id, r.title,
           r.status, r.created_at, r.updated_at
      from public.records r
     where r.board_id = p_board_id
       and r.status is distinct from 'archived'
     order by r.created_at asc;
end
$$;

-- ── get_board_cell_values ──────────────────────────────────────────────────
-- The "strip the JSONB keys where can_view = false" rule. This schema stores
-- one cell per row instead of a values blob, so the equivalent is to return
-- only the rows whose column survived the filter. An empty visible-column list
-- yields no rows, because `= any('{}')` is false for every value.
create or replace function public.get_board_cell_values(p_board_id text)
returns table (
  record_id  text,
  column_id  text,
  value      jsonb,
  value_text text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return;
  end if;

  return query
    select cv.record_id, cv.column_id, cv.value, cv.value_text, cv.updated_at
      from public.cell_values cv
     where cv.board_id = p_board_id
       and cv.column_id = any (public.client_visible_column_ids(p_board_id));
end
$$;

-- ── get_board_groups ───────────────────────────────────────────────────────
create or replace function public.get_board_groups(p_board_id text)
returns table (
  id          text,
  name        text,
  color       text,
  collapsed   boolean,
  sort_order  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_board(p_board_id) then
    return;
  end if;

  return query
    select g.id, g.name, g.color, g.collapsed, g.sort_order
      from public.groups g
     where g.board_id = p_board_id
     order by g.sort_order asc;
end
$$;

-- ── get_search_results ─────────────────────────────────────────────────────
-- Global search, scoped three ways at once: to workspaces the caller can view,
-- excluding personal workspaces entirely; to boards they may see; and to
-- columns they may see. A match inside a hidden column returns nothing, so a
-- client cannot confirm the existence of a value they are not allowed to read
-- by searching for it.
create or replace function public.get_search_results(
  p_query text,
  p_limit integer default 50
)
returns table (
  board_id      text,
  board_name    text,
  record_id     text,
  record_title  text,
  column_id     text,
  column_label  text,
  value_text    text,
  matched_title boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text;
  v_limit   integer;
begin
  if auth.uid() is null then
    return;
  end if;

  if p_query is null or length(btrim(p_query)) = 0 then
    return;
  end if;

  v_pattern := '%' || btrim(p_query) || '%';
  v_limit   := least(greatest(coalesce(p_limit, 50), 1), 200);

  return query
    with scoped as (
      select r.id, r.board_id, r.workspace_id, r.title
        from public.records r
       where r.workspace_id = any (public.accessible_workspace_ids(false))
         and public.can_view_board(r.board_id)
         and r.status is distinct from 'archived'
    ),
    title_hits as (
      select s.board_id, b.name as board_name, s.id, s.title,
             null::text as column_id, null::text as column_label,
             null::text as value_text, true as matched_title
        from scoped s
        join public.boards b on b.id = s.board_id
       where s.title ilike v_pattern
    ),
    cell_hits as (
      select s.board_id, b.name as board_name, s.id, s.title,
             cv.column_id, c.label as column_label,
             cv.value_text, false as matched_title
        from scoped s
        join public.boards b on b.id = s.board_id
        join public.cell_values cv on cv.record_id = s.id
        join public.columns c on c.id = cv.column_id
       where cv.column_id = any (public.client_visible_column_ids(s.board_id))
         and coalesce(cv.value_text, '') ilike v_pattern
    )
    select * from title_hits
    union all
    select * from cell_hits
    order by board_name asc, record_title asc
    limit v_limit;
end
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- authenticated only. anon and PUBLIC get nothing, so these are unreachable
-- without a real signed session.

revoke all on function public.get_my_workspaces() from public, anon;
revoke all on function public.get_my_boards() from public, anon;
revoke all on function public.get_board_columns(text) from public, anon;
revoke all on function public.get_board_items(text) from public, anon;
revoke all on function public.get_board_cell_values(text) from public, anon;
revoke all on function public.get_board_groups(text) from public, anon;
revoke all on function public.get_search_results(text, integer) from public, anon;

grant execute on function public.get_my_workspaces() to authenticated, service_role;
grant execute on function public.get_my_boards() to authenticated, service_role;
grant execute on function public.get_board_columns(text) to authenticated, service_role;
grant execute on function public.get_board_items(text) to authenticated, service_role;
grant execute on function public.get_board_cell_values(text) to authenticated, service_role;
grant execute on function public.get_board_groups(text) to authenticated, service_role;
grant execute on function public.get_search_results(text, integer) to authenticated, service_role;

-- `raise` is PL/pgSQL, so it is only legal inside a function body. Wrapped in a
-- DO block to reach the top level.
do $$
begin
  raise notice 'rbac 03: write guards, escalation guards and client RPCs in place';
end
$$;
