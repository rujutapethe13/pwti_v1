-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20260924010000: activity_logs table for event-bus-driven audit trail
--
-- Creates the `activity_logs` table that the ActivityLogRepository writes to
-- (see src/features/boards/engine/repository/activity-log-repository.ts).
--
-- This table is populated by the event-bus subscriber initialized in
-- src/features/boards/engine/events/activity-log-subscriber.ts, which listens
-- for *.create:after / *.update:after / etc. domain events published from
-- RecordService, CellService, BoardService, etc.
--
-- Without this table and subscriber, new records never appear in the
-- Overview page's activity feed.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.activity_logs (
    id             text primary key default gen_random_uuid()::text,
    organization_id text           not null references public.organizations(id) on delete cascade,
    workspace_id    text           references public.workspaces(id) on delete set null,
    board_id        text           references public.boards(id) on delete set null,
    record_id       text           references public.records(id) on delete set null,
    actor_user_id   text,
    action          text           not null,  -- e.g. 'record.create', 'record.update'
    payload         jsonb          not null default '{}'::jsonb,
    created_at      timestamptz    not null default now()
);

-- Indexes for efficient querying
create index if not exists activity_logs_org_created_idx
    on public.activity_logs (organization_id, created_at desc);
create index if not exists activity_logs_workspace_created_idx
    on public.activity_logs (workspace_id, created_at desc);
create index if not exists activity_logs_record_idx
    on public.activity_logs (record_id);
create index if not exists activity_logs_action_idx
    on public.activity_logs (action);
create index if not exists activity_logs_actor_idx
    on public.activity_logs (actor_user_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────
-- Read access: workspace members (via organization membership chain)
-- Write access: any authenticated user (system services write these)
-- Append-only: no UPDATE or DELETE policies

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_organization_member" on public.activity_logs;
create policy "activity_logs_select_organization_member" on public.activity_logs
    for select
    using (
        exists (
            select 1
            from public.workspace_members wm
            inner join public.workspaces w on w.id = wm.workspace_id
            where w.organization_id = activity_logs.organization_id
              and wm.user_id = auth.uid()
        )
    );

drop policy if exists "activity_logs_insert_authenticated" on public.activity_logs;
create policy "activity_logs_insert_authenticated" on public.activity_logs
    for insert
    with check (auth.uid() is not null);

-- No UPDATE or DELETE — audit log is append-only.
-- Grants
grant select, insert, update, delete on public.activity_logs to anon, authenticated;
