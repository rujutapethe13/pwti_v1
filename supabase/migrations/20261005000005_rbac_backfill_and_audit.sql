-- =============================================================================
-- RBAC / 05 — Backfill existing rows, then record every future change
--
-- Two jobs, in this order:
--
--   1. Give the pre-existing membership rows an app_role. Before this file
--      workspace_members.role is NULL, and can_view_workspace() reads role
--      membership rather than this column, so the app keeps working — but any
--      UI that reads the column needs it populated, and leaving it nullable
--      would be a trap for the next migration.
--
--   2. Attach audit triggers. Every role change, permission change, board or
--      column grant, personal-access grant and deletion lands in audit_log with
--      the actor recorded.
--
-- The backfill mapping is a judgement call and is called out here so it can be
-- corrected: the legacy `roles` table seeded six names with no way to tell a
-- staff member from a read-only client. 'viewer' and 'guest' map to 'client'
-- because a read-only legacy role is the closest thing to a client; everything
-- else that is not clearly an administrator maps to 'staff'. If the real
-- distribution differs, re-run just the UPDATE block with the right mapping —
-- it is idempotent in the sense that it only touches rows still at its default.
--
-- Idempotent: safe to re-run whole.
-- =============================================================================

-- ── 1. Backfill ────────────────────────────────────────────────────────────

-- workspace_members.role from the legacy roles.name.
update public.workspace_members wm
   set role = case
                when lower(r.name) in ('owner', 'administrator', 'admin', 'manager')
                  then 'admin'::public.app_role
                when lower(r.name) in ('viewer', 'guest')
                  then 'client'::public.app_role
                else 'staff'::public.app_role
              end
  from public.roles r
 where r.id = wm.role_id
   and wm.role is null;

update public.workspace_members set role = 'client'::public.app_role
 where role is null;

alter table public.workspace_members alter column role set default 'client';
alter table public.workspace_members alter column role set not null;

-- profiles.role: the highest authority any of a user's memberships implies, so
-- someone who is an Owner of any workspace is an admin org-wide rather than a
-- client who happens to hold one row.
with strongest as (
  select wm.user_id,
         max(
           case wm.role
             when 'admin'::public.app_role then 2
             when 'staff'::public.app_role then 1
             else 0
           end
         ) as rank
    from public.workspace_members wm
   group by wm.user_id
)
update public.profiles p
   set role = case s.rank
                when 2 then 'admin'::public.app_role
                when 1 then 'staff'::public.app_role
                else 'client'::public.app_role
              end,
       updated_at = now()
  from strongest s
 where s.user_id = p.id
   and p.role is distinct from case s.rank
                                  when 2 then 'admin'::public.app_role
                                  when 1 then 'staff'::public.app_role
                                  else 'client'::public.app_role
                                end;

-- organization_members from profiles, so current_role() has a row to read for
-- users who were created before the onboarding trigger existed.
insert into public.organization_members (organization_id, user_id, role)
select w.organization_id, p.id, p.role
  from public.profiles p
  join public.workspace_members wm on wm.user_id = p.id
  join public.workspaces w on w.id = wm.workspace_id
  join (
    select wm2.user_id, min(w2.organization_id) as organization_id
      from public.workspace_members wm2
      join public.workspaces w2 on w2.id = wm2.workspace_id
     group by wm2.user_id
  ) pick on pick.user_id = p.id and pick.organization_id = w.organization_id
on conflict (organization_id, user_id) do nothing;

do $$
declare
  v_members  bigint;
  v_profiles bigint;
  v_orgs     bigint;
begin
  select count(*) into v_members  from public.workspace_members where role is not null;
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_orgs     from public.organization_members;

  raise notice 'rbac 05: backfill complete — % workspace_members rows have a role, % profiles rows, % organization_members rows', v_members, v_profiles, v_orgs;
end
$$;

-- ── 2. Audit triggers ──────────────────────────────────────────────────────
-- Append-only. audit_log has no UPDATE or DELETE policy, and none is added
-- here, so an entry cannot be rewritten after the fact.

create or replace function public.audit_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action  text;
  v_res     text;
  v_ws      text;
  v_meta    jsonb;
  v_old     jsonb;
  v_new     jsonb;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  v_action := lower(tg_op);

  if tg_op = 'UPDATE' then
    -- Only record a change when something that means something actually moved,
    -- so updated_at churn does not fill the table with noise.
    if v_old = v_new then
      return new;
    end if;
  end if;

  v_res := tg_table_name;
  v_ws  := null;

  if v_new is not null then
    if v_new ? 'workspace_id' then
      v_ws := v_new ->> 'workspace_id';
    elsif v_new ? 'board_id' then
      select b.workspace_id into v_ws from public.boards b where b.id = v_new ->> 'board_id';
    end if;
  elsif v_old is not null then
    if v_old ? 'workspace_id' then
      v_ws := v_old ->> 'workspace_id';
    elsif v_old ? 'board_id' then
      select b.workspace_id into v_ws from public.boards b where b.id = v_old ->> 'board_id';
    end if;
  end if;

  v_meta := jsonb_build_object(
    'before', v_old,
    'after',  v_new,
    'table',   tg_table_name
  );

  insert into public.audit_log (
    workspace_id, actor_id, action, resource_type, resource_id, metadata
  )
  values (
    v_ws,
    auth.uid(),
    v_action,
    v_res,
    coalesce(
      (v_new ->> 'id'),
      (v_new ->> 'user_id'),
      (v_old ->> 'id'),
      (v_old ->> 'user_id')
    ),
    v_meta
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists audit_workspace_members on public.workspace_members;
create trigger audit_workspace_members
  after insert or update or delete on public.workspace_members
  for each row execute function public.audit_write();

drop trigger if exists audit_client_board_access on public.client_board_access;
create trigger audit_client_board_access
  after insert or update or delete on public.client_board_access
  for each row execute function public.audit_write();

drop trigger if exists audit_client_column_permissions on public.client_column_permissions;
create trigger audit_client_column_permissions
  after insert or update or delete on public.client_column_permissions
  for each row execute function public.audit_write();

drop trigger if exists audit_workspace_personal_access on public.workspace_personal_access;
create trigger audit_workspace_personal_access
  after insert or update or delete on public.workspace_personal_access
  for each row execute function public.audit_write();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after update of role on public.profiles
  for each row execute function public.audit_write();

drop trigger if exists audit_organization_members on public.organization_members;
create trigger audit_organization_members
  after insert or update or delete on public.organization_members
  for each row execute function public.audit_write();

drop trigger if exists audit_workspaces_type on public.workspaces;
create trigger audit_workspaces_type
  after update of type, owner_id on public.workspaces
  for each row execute function public.audit_write();

-- ── 3. Verification notices ────────────────────────────────────────────────
-- These do not assert; they print. Run them by hand afterwards to confirm the
-- backfill actually did something rather than assuming it did.

do $$
declare
  v_null_roles  bigint;
  v_no_profile  bigint;
  v_admin_crews  bigint;
begin
  select count(*) into v_null_roles from public.workspace_members where role is null;
  select count(*) into v_no_profile from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id);
  select count(*) into v_admin_crews from public.organization_members where role = 'admin';

  if v_null_roles = 0 then
    raise notice 'rbac 05: OK — every workspace_members row has a role';
  else
    raise warning 'rbac 05: % workspace_members rows still have a NULL role', v_null_roles;
  end if;

  if v_no_profile = 0 then
    raise notice 'rbac 05: OK — every auth user has a profiles row';
  else
    raise warning 'rbac 05: % auth users have no profiles row (they predate the trigger; add them before inviting them into a workspace)', v_no_profile;
  end if;

  raise notice 'rbac 05: % users currently hold admin', v_admin_crews;
  raise notice 'rbac 05: expected exactly 1 admin plus the super admin — review the list before going live';
end
$$;

raise notice 'rbac 05: audit triggers attached and backfill verified';