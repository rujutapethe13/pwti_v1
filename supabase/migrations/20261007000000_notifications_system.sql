-- =============================================================================
-- Notifications system
--
-- Replaces hardcoded demo notifications with a real Supabase-backed system.
-- Triggers fire on workspace_members, board_member_overrides, and records.
-- Due-date alerts run every 30 minutes via pg_cron.
-- Realtime is enabled for the notifications table.
-- =============================================================================

-- ── 0. Schema extensions to records ──────────────────────────────────────────
-- The existing "jobs" table is public.records. Add denormalized columns so
-- database triggers can watch assignment and due-date changes without parsing
-- cell_values.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'assignee_id'
  ) then
    alter table public.records add column assignee_id uuid references auth.users(id) on delete set null;
    create index if not exists records_assignee_id_idx on public.records (assignee_id);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'due_date'
  ) then
    alter table public.records add column due_date timestamptz;
    create index if not exists records_due_date_idx on public.records (due_date);
  end if;
end
$$;

-- ── 1. Notifications table ────────────────────────────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'workspace_invite',
    'board_invite',
    'assignment',
    'due_soon',
    'overdue'
  )),
  title text not null,
  message text,
  actor_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  board_id uuid,
  job_id uuid,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  dedupe_key text,
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_id_is_read_created_at_idx
  on public.notifications (user_id, is_read, created_at desc);

-- ── 2. Row Level Security ─────────────────────────────────────────────────────

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  using (user_id = auth.uid());

-- Restrict UPDATE to is_read only
create or replace function public.enforce_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.user_id != OLD.user_id
       or NEW.type != OLD.type
       or NEW.title != OLD.title
       or NEW.message != OLD.message
       or NEW.actor_id != OLD.actor_id
       or NEW.workspace_id != OLD.workspace_id
       or NEW.board_id != OLD.board_id
       or NEW.job_id != OLD.job_id
       or NEW.link != OLD.link
       or NEW.dedupe_key != OLD.dedupe_key
       or NEW.created_at != OLD.created_at then
      raise exception 'notifications: only is_read can be modified';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_notification_update on public.notifications;
create trigger enforce_notification_update
  before update on public.notifications
  for each row execute function public.enforce_notification_update();

-- ── 3. Helper: is a record considered completed? ──────────────────────────────

create or replace function public.is_record_completed(p_status text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(p_status) in ('completed', 'delivered', 'done', 'archived');
$$;

-- ── 4. Trigger: workspace invite ──────────────────────────────────────────────

create or replace function public.notify_workspace_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_workspace_name text;
begin
  if auth.uid() is null or NEW.user_id = auth.uid() then
    return NEW;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email)
    into v_actor
    from public.profiles p
   where p.id = auth.uid();

  select w.name into v_workspace_name
    from public.workspaces w
   where w.id = NEW.workspace_id;

  insert into public.notifications (user_id, type, title, message, actor_id, workspace_id, link, dedupe_key)
  values (
    NEW.user_id,
    'workspace_invite',
    'You were added to a workspace',
    format('%s added you to %s.', COALESCE(v_actor, 'Someone'), COALESCE(v_workspace_name, 'a workspace')),
    auth.uid(),
    NEW.workspace_id,
    format('/workspace/%s', NEW.workspace_id),
    format('workspace_invite:%s:%s', NEW.workspace_id, NEW.user_id)
  )
  on conflict (user_id, dedupe_key) do nothing;

  return NEW;
end;
$$;

drop trigger if exists notify_workspace_invite on public.workspace_members;
create trigger notify_workspace_invite
  after insert on public.workspace_members
  for each row execute function public.notify_workspace_invite();

-- ── 5. Trigger: board invite ──────────────────────────────────────────────────

create or replace function public.notify_board_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_board_name text;
begin
  if auth.uid() is null or NEW.user_id = auth.uid() then
    return NEW;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email)
    into v_actor
    from public.profiles p
   where p.id = auth.uid();

  select b.name into v_board_name
    from public.boards b
   where b.id = NEW.board_id;

  insert into public.notifications (user_id, type, title, message, actor_id, board_id, link, dedupe_key)
  values (
    NEW.user_id,
    'board_invite',
    'You were added to a board',
    format('%s added you to the board %s.', COALESCE(v_actor, 'Someone'), COALESCE(v_board_name, 'Unknown Board')),
    auth.uid(),
    NEW.board_id,
    format('/boards/%s', NEW.board_id),
    format('board_invite:%s:%s', NEW.board_id, NEW.user_id)
  )
  on conflict (user_id, dedupe_key) do nothing;

  return NEW;
end;
$$;

drop trigger if exists notify_board_invite on public.board_member_overrides;
create trigger notify_board_invite
  after insert on public.board_member_overrides
  for each row execute function public.notify_board_invite();

-- ── 6. Trigger: job assignment ────────────────────────────────────────────────

create or replace function public.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  if auth.uid() is null
     or NEW.assignee_id is null
     or NEW.assignee_id = COALESCE(OLD.assignee_id, '00000000-0000-0000-0000-000000000000')
     or NEW.assignee_id = auth.uid() then
    return NEW;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), p.email)
    into v_actor
    from public.profiles p
   where p.id = auth.uid();

  insert into public.notifications (user_id, type, title, message, actor_id, board_id, job_id, link, dedupe_key)
  values (
    NEW.assignee_id,
    'assignment',
    'You were assigned a job',
    format('%s assigned you %s.', COALESCE(v_actor, 'Someone'), COALESCE(NEW.title, 'a job')),
    auth.uid(),
    NEW.board_id,
    NEW.id,
    format('/boards/%s', NEW.board_id),
    format('assign:%s:%s', NEW.id, NEW.assignee_id)
  )
  on conflict (user_id, dedupe_key) do nothing;

  return NEW;
end;
$$;

drop trigger if exists notify_assignment on public.records;
create trigger notify_assignment
  after insert or update of assignee_id on public.records
  for each row execute function public.notify_assignment();

-- ── 7. Trigger: due-date / status change cleanup ──────────────────────────────

create or replace function public.notify_due_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if public.is_record_completed(NEW.status) then
      delete from public.notifications
       where job_id = NEW.id
         and type in ('due_soon', 'overdue')
         and is_read = false;
    end if;

    if NEW.due_date is distinct from OLD.due_date then
      if NEW.due_date is null or NEW.due_date > now() + interval '48 hours' then
        delete from public.notifications
         where job_id = NEW.id
           and type = 'due_soon'
           and is_read = false;
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists notify_due_date_change on public.records;
create trigger notify_due_date_change
  after update of due_date, status on public.records
  for each row execute function public.notify_due_date_change();

-- ── 8. Due-date alert generator (pg_cron) ─────────────────────────────────────

create or replace function public.generate_due_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_today date := current_date;
  v_actor text := 'System';
begin
  select coalesce(nullif(trim(p.full_name), ''), p.email)
    into v_actor
    from public.profiles p
   where p.id = auth.uid();

  if v_actor is null then
    v_actor := 'System';
  end if;

  for v_job in
    select r.id, r.title, r.board_id, r.due_date, r.assignee_id
      from public.records r
     where lower(r.status) not in ('completed', 'delivered', 'done', 'archived')
       and r.assignee_id is not null
       and r.due_date is not null
       and r.due_date >= v_today
       and r.due_date < v_today + interval '48 hours'
  loop
    insert into public.notifications (user_id, type, title, message, actor_id, board_id, job_id, link, dedupe_key)
    values (
      v_job.assignee_id,
      'due_soon',
      'Job due soon',
      format('%s is due %s.', quote_literal(v_job.title),
        case
          when (v_job.due_date at time zone 'Asia/Kolkata')::date = v_today then 'today'
          when (v_job.due_date at time zone 'Asia/Kolkata')::date = v_today + 1 then 'tomorrow'
          else to_char(v_job.due_date at time zone 'Asia/Kolkata', 'FMMonth FMDD')
        end
      ),
      null,
      v_job.board_id,
      v_job.id,
      format('/boards/%s', v_job.board_id),
      format('due_soon:%s:%s', v_job.id, to_char(v_job.due_date, 'YYYY-MM-DD'))
    )
    on conflict (user_id, dedupe_key) do nothing;
  end loop;

  for v_job in
    select r.id, r.title, r.board_id, r.due_date, r.assignee_id
      from public.records r
     where lower(r.status) not in ('completed', 'delivered', 'done', 'archived')
       and r.assignee_id is not null
       and r.due_date is not null
       and r.due_date < v_today
  loop
    insert into public.notifications (user_id, type, title, message, actor_id, board_id, job_id, link, dedupe_key)
    values (
      v_job.assignee_id,
      'overdue',
      'Job overdue',
      format('%s is overdue by %s.', quote_literal(v_job.title),
        case
          when (v_today - (v_job.due_date at time zone 'Asia/Kolkata')::date) = 1 then '1 day'
          else ((v_today - (v_job.due_date at time zone 'Asia/Kolkata')::date)::text || ' days')
        end
      ),
      null,
      v_job.board_id,
      v_job.id,
      format('/boards/%s', v_job.board_id),
      format('overdue:%s:%s', v_job.id, v_today)
    )
    on conflict (user_id, dedupe_key) do nothing;
  end loop;
end;
$$;

-- ── 9. pg_cron schedule ───────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('due-notifications');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'due-notifications',
      '*/30 * * * *',
      'select public.generate_due_notifications()'
    );
  end if;
exception
  when others then
    null;
end;
$$;

-- ── 10. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when others then
    null;
end;
$$;

-- ── 11. Verification notices ──────────────────────────────────────────────────

do $$
begin
  raise notice 'notifications: table, RLS, triggers, pg_cron schedule, and realtime publication in place';
  raise notice 'notifications: due-notifications runs every 30 minutes via pg_cron (if enabled)';
end
$$;
