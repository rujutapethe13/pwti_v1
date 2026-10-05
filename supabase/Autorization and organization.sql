-- ════════════════════════════════════════════════════════════════════════════════
-- Powerweave Studio OS — Authorization & Organization Model
-- ════════════════════════════════════════════════════════════════════════════════
--
-- ╔═══════════════════════════════════════════════════════════════════════════════╗
-- ║                           SCHEMA CATALOG                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════════╝
--
-- TABLES CREATED (8 new tables across 7 migration files):
--
-- Migration 001 (containment):
--   * teams              -- belongs to workspace (org -> ws -> team -> dept)
--   * departments        -- belongs to team
--
-- Migration 002 (roles & assignments):
--   * roles              -- system roles (null org_id) + custom roles (org_id set)
--   * workspace_members  -- user has ONE role per workspace (PK: user_id + workspace_id)
--   * team_members       -- user can belong to multiple teams (PK: user_id + team_id)
--
-- Migration 003 (permission grants):
--   * permission_grants  -- single source of truth for auth decisions
--
-- Migration 004 (column visibility):
--   * column_visibility_rules -- field-level security overrides per role/user
--
-- Migration 005 (invitations):
--   * invitations        -- email-based workspace invites with token-based acceptance
--
-- Migration 006 (audit log):
--   * audit_log          -- immutable append-only security event log
--
-- ENUMS CREATED:
--   * resource_type      -- workspace, board, group, column, record, view, dashboard,
--                           widget, relationship, formula, automation, ai
--   * permission_action  -- view, create, edit, delete, comment, export, share, manage
--   * grant_effect       -- allow, deny
--   * column_visibility  -- hidden, read_only, editable
--   * invitation_status  -- pending, accepted, revoked, expired
--
-- STUB-ONLY COLUMNS (no enforcement logic yet):
--   * resource_type enum values 'automation' and 'ai' -- placeholders for
--     future Automation Engine and AI Engine layers. The permission_grants
--     table can store grants for them now, but no enforcement code exists.
--   * column_visibility_rules.visibility_condition (jsonb) -- reserved for
--     future conditional visibility logic (e.g. "hide if status = X").
--     The storage column exists; the evaluator is not built.
--
-- DEPRECATED TABLE:
--   * public.permissions (from core metadata engine migration) -- No application
--     code queries this table. It is superseded by permission_grants.
--     Left in place for backward compatibility; do not write new code against it.
--
-- MIGRATION ORDERING (apply sequentially):
--   001 -> 002 -> 003 -> 004 -> 005 -> 006 -> 007 -> (seed.sql for test data)
--
-- ────────────────────────────────────────────────────────────────────────────────
-- Migration 001: Containment Hierarchy
-- teams & departments (children of workspaces)
-- Part of the Powerweave Studio OS authorization & org model
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Teams ──────────────────────────────────────────────────
-- A team belongs to exactly one workspace. Teams are the next
-- level in the containment chain: organizations → workspaces → teams → departments.

drop table if exists public.teams cascade;
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Departments ────────────────────────────────────────────
-- A department belongs to exactly one team.

drop table if exists public.departments cascade;
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────

drop index if exists teams_workspace_id_idx;
create index if not exists teams_workspace_id_idx on public.teams (workspace_id);
drop index if exists teams_organization_id_idx;
create index if not exists teams_organization_id_idx on public.teams (organization_id);
drop index if exists departments_team_id_idx;
create index if not exists departments_team_id_idx on public.departments (team_id);
drop index if exists departments_workspace_id_idx;
create index if not exists departments_workspace_id_idx on public.departments (workspace_id);

-- ── Denormalized sync trigger ──────────────────────────────
-- organization_id and workspace_id are denormalized on teams and departments
-- for performant RLS queries. This trigger keeps them in sync if the
-- parent workspace_id ever changes on a team (or team_id on a department).
-- The application layer must set these on INSERT; this trigger only handles
-- UPDATE scenarios where the parent FK changes.

create or replace function public.sync_team_containment()
returns trigger as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    new.organization_id := (select organization_id from public.workspaces where id = new.workspace_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.sync_department_containment()
returns trigger as $$
begin
  if new.team_id is distinct from old.team_id then
    new.workspace_id := (select workspace_id from public.teams where id = new.team_id);
    new.organization_id := (select organization_id from public.workspaces where id = new.workspace_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_teams_sync_containment on public.teams;
create trigger trg_teams_sync_containment
  before update on public.teams
  for each row
  when (old.workspace_id is distinct from new.workspace_id)
  execute function public.sync_team_containment();

drop trigger if exists trg_departments_sync_containment on public.departments;
create trigger trg_departments_sync_containment
  before update on public.departments
  for each row
  when (old.team_id is distinct from new.team_id)
  execute function public.sync_department_containment();

