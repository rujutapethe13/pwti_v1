-- ────────────────────────────────────────────────────────────
-- Migration 006: Audit Log
-- Part of the Powerweave Studio OS authorization & org model
-- ────────────────────────────────────────────────────────────

-- ── Audit Log Table ────────────────────────────────────────
-- Immutable log of security-relevant events across the platform.
-- INSERT is unrestricted (system writes these); SELECT is restricted by RLS.

drop table if exists public.audit_log cascade;
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references public.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,  -- null = system-generated
  action text not null,  -- e.g. 'login', 'permission.grant.updated', 'invite.accepted'
  resource_type text,     -- optional, e.g. 'board', 'permission_grant'
  resource_id text,       -- optional UUID or text identifier
  metadata jsonb,         -- before/after values, IP address, user-agent, etc.
  created_at timestamptz not null default now()
);

-- Query patterns: recent activity by workspace, recent activity by user
create index if not exists audit_log_workspace_created_idx
  on public.audit_log (workspace_id, created_at desc);

create index if not exists audit_log_actor_created_idx
  on public.audit_log (actor_id, created_at desc);

create index if not exists audit_log_action_idx
  on public.audit_log (action);

-- No foreign key to workspace_id as a NOT NULL constraint — some events
-- (e.g. failed login) are not workspace-scoped.

