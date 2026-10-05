-- ────────────────────────────────────────────────────────────
-- Migration 004: Column Visibility Rules (field-level security)
-- Part of the Powerweave Studio OS authorization & org model
-- ────────────────────────────────────────────────────────────

do $$ begin
  create type public.column_visibility as enum (
    'hidden',
    'read_only',
    'editable'
  );
exception
  when duplicate_object then null;
end $$;

-- ── Column Visibility Rules ────────────────────────────────
-- Defines overrides for column-level visibility on a per-role or per-user basis.
-- The default visibility for a column is determined by the column's own settings;
-- these rules override that default for specific roles/users.

drop table if exists public.column_visibility_rules cascade;
create table if not exists public.column_visibility_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  column_id text not null references public.columns(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  visibility public.column_visibility not null,

  -- Reserved for future conditional visibility logic (e.g. "hide if status = 'archived'").
  -- Store the condition definition here now; the evaluator will be built later.
  visibility_condition jsonb,

  created_at timestamptz not null default now(),

  -- XOR constraint: exactly one of role_id or user_id must be set
  constraint column_visibility_xor_assignee
    check ((role_id is not null) <> (user_id is not null)),

  -- Prevent duplicate rules for the same (column, assignee) pair
  unique (column_id, role_id, user_id)
);

create index if not exists column_visibility_rules_board_idx
  on public.column_visibility_rules (board_id, column_id);

create index if not exists column_visibility_rules_workspace_idx
  on public.column_visibility_rules (workspace_id);

