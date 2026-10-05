-- Migration 20260930120000: Scope Client 360 RLS to the caller's organization
--
-- Problem
--   20260916000000_client_360_due_date_status.sql created one policy per Client
--   360 table:
--
--       create policy "client_360_clients_owner_all" on public.client_360_clients
--           for all using (auth.uid() is not null);
--
--   The policy names say "owner_all", but the body grants *every authenticated
--   user* full SELECT/INSERT/UPDATE/DELETE on the whole table. Nothing in the
--   predicate references organization_id, so any signed-in user could read and
--   rewrite another studio's clients, aliases, field mappings and daily
--   snapshots by calling PostgREST with their own token. In a multi-tenant
--   product that is a cross-tenant data breach, not a permissive default.
--
--   The same migrations also granted table DML to the `anon` role. RLS made
--   that grant inert, but it meant any future policy edit — or a table briefly
--   having RLS disabled during debugging — would immediately expose data to
--   unauthenticated callers.
--
-- Fix
--   Replace each policy with one that requires membership of a workspace in the
--   same organization as the row. This mirrors the predicate already used by
--   activity_logs (20260924010000), which is correct, and keeps the rule in one
--   readable place rather than copying a hand-rolled join into five policies.
--
--   `anon` is dropped from the grants. The application only ever talks to
--   these tables as a signed-in user.

-- ── Helper ───────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the policy can read workspace_members without recursing
-- through that table's own policies. `search_path` is pinned so the function
-- cannot be hijacked by a caller-controlled schema, and it is revoked from
-- PUBLIC so it can only be used as a policy predicate.
create or replace function public.is_organization_member(p_organization_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.workspace_members wm
        join public.workspaces w on w.id = wm.workspace_id
        where w.organization_id = p_organization_id
          and wm.user_id = auth.uid()
    );
$$;

revoke all on function public.is_organization_member(text) from public;
grant execute on function public.is_organization_member(text) to authenticated;

-- ── Policies ─────────────────────────────────────────────────────────────────
-- One policy per table, scoped to the caller's organization. `USING` covers
-- reads and the visibility check for updates/deletes; `WITH CHECK` covers what
-- a row may look like after an insert or update, so a user cannot write a row
-- into an organization they do not belong to.

drop policy if exists "client_360_field_mappings_owner_all" on public.client_360_field_mappings;
drop policy if exists "client_360_clients_owner_all"           on public.client_360_clients;
drop policy if exists "client_360_client_aliases_owner_all"    on public.client_360_client_aliases;
drop policy if exists "client_360_daily_snapshot_owner_all"    on public.client_360_daily_snapshot;
drop policy if exists "client_360_status_mappings_owner_all"   on public.client_360_status_mappings;

create policy "client_360_field_mappings_org_member" on public.client_360_field_mappings
    for all
    using (public.is_organization_member(organization_id))
    with check (public.is_organization_member(organization_id));

create policy "client_360_clients_org_member" on public.client_360_clients
    for all
    using (public.is_organization_member(organization_id))
    with check (public.is_organization_member(organization_id));

create policy "client_360_client_aliases_org_member" on public.client_360_client_aliases
    for all
    using (public.is_organization_member(organization_id))
    with check (public.is_organization_member(organization_id));

create policy "client_360_daily_snapshot_org_member" on public.client_360_daily_snapshot
    for all
    using (public.is_organization_member(organization_id))
    with check (public.is_organization_member(organization_id));

create policy "client_360_status_mappings_org_member" on public.client_360_status_mappings
    for all
    using (public.is_organization_member(organization_id))
    with check (public.is_organization_member(organization_id));

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Only signed-in users reach these tables. `anon` keeps nothing.

revoke all on public.client_360_field_mappings from anon;
revoke all on public.client_360_clients          from anon;
revoke all on public.client_360_client_aliases   from anon;
revoke all on public.client_360_daily_snapshot   from anon;
revoke all on public.client_360_status_mappings  from anon;

grant select, insert, update, delete on
    public.client_360_field_mappings,
    public.client_360_clients,
    public.client_360_client_aliases,
    public.client_360_daily_snapshot,
    public.client_360_status_mappings
    to authenticated;

-- ── Audit log grants ─────────────────────────────────────────────────────────
-- 20260924010000 commented "No UPDATE or DELETE — audit log is append-only" and
-- then granted update and delete to anon and authenticated. RLS blocked the
-- writes because no such policy existed, so nothing was reachable — but the
-- grant contradicted the rule and would have made the audit trail mutable the
-- moment anyone added a policy or disabled RLS on the table.

revoke all on public.activity_logs from anon;
revoke update, delete on public.activity_logs from authenticated;
grant select, insert on public.activity_logs to authenticated;