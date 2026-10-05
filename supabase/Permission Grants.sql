-- ────────────────────────────────────────────────────────────
-- Migration 003: Permission Grants (metadata-driven)
-- Part of the Powerweave Studio OS authorization & org model
-- ────────────────────────────────────────────────────────────

-- ── Enums ──────────────────────────────────────────────────

do $$ begin
  create type public.resource_type as enum (
    'workspace',
    'board',
    'group',
    'column',
    'record',
    'view',
    'dashboard',
    'widget',
    'relationship',
    'formula',
    'automation',    -- stub: no enforcement logic yet; placeholder for future layers
    'ai'             -- stub: no enforcement logic yet; placeholder for future layers
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.permission_action as enum (
    'view',
    'create',
    'edit',
    'delete',
    'comment',
    'export',
    'share',
    'manage'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.grant_effect as enum (
    'allow',
    'deny'
  );
exception
  when duplicate_object then null;
end $$;

-- ── Permission Grants Table ────────────────────────────────
-- This is the single source of truth for all authorization decisions.
-- It replaces the legacy `public.permissions` table (now deprecated).
--
-- NOTE on `automation` and `ai` resource_type enum values:
-- These exist as placeholders for future layers (Automation Engine, AI Engine)
-- that don't have enforcement logic yet. This table simply stores grants
-- for them so the schema is ready when those engines come online.

drop table if exists public.permission_grants cascade;
create table if not exists public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  resource_type public.resource_type not null,
  resource_id text,  -- null means "applies to all resources of this type in this workspace"
  action public.permission_action not null,
  effect public.grant_effect not null default 'allow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- XOR constraint: exactly one of role_id or user_id must be set
  constraint permission_grants_xor_assignee
    check ((role_id is not null) <> (user_id is not null))
);

-- Fast lookup index — this table is queried on every permission check
create index if not exists permission_grants_lookup_idx
  on public.permission_grants (workspace_id, resource_type, resource_id, role_id, user_id);

drop index if exists permission_grants_role_id_idx;
create index if not exists permission_grants_role_id_idx on public.permission_grants (role_id);
drop index if exists permission_grants_user_id_idx;
create index if not exists permission_grants_user_id_idx on public.permission_grants (user_id);

-- ── Updated_at trigger ─────────────────────────────────────

create or replace function public.update_permission_grants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_permission_grants_updated_at on public.permission_grants;
create trigger trg_permission_grants_updated_at
  before update on public.permission_grants
  for each row
  execute function public.update_permission_grants_updated_at();

