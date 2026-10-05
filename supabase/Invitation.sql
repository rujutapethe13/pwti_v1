-- ────────────────────────────────────────────────────────────
-- Migration 005: Invitations
-- Part of the Powerweave Studio OS authorization & org model
-- ────────────────────────────────────────────────────────────

do $$ begin
  create type public.invitation_status as enum (
    'pending',
    'accepted',
    'revoked',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

-- ── Invitations Table ──────────────────────────────────────
-- Tracks invitations sent to email addresses for workspace access.

drop table if exists public.invitations cascade;
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  token text not null,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

drop index if exists invitations_token_idx;
create unique index if not exists invitations_token_idx on public.invitations (token);
drop index if exists invitations_email_idx;
create index if not exists invitations_email_idx on public.invitations (lower(email));
drop index if exists invitations_workspace_idx;
create index if not exists invitations_workspace_idx on public.invitations (workspace_id);
drop index if exists invitations_status_idx;
create index if not exists invitations_status_idx on public.invitations (status);

-- Ensure token is always provided
alter table public.invitations drop constraint if exists invitations_token_not_null;
alter table public.invitations add constraint invitations_token_not_null
  check (token is not null and token <> '');

