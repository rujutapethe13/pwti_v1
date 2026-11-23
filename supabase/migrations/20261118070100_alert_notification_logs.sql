-- Dedupe log for overdue job and invoice-clearance digest alerts.
-- One row represents that a specific alert was sent to a recipient for a record on a given day.

create table if not exists public.alert_notification_logs (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  record_id text not null,
  board_id text,
  client_id text,
  alert_type text not null check (alert_type in ('job_overdue', 'invoice_uncleared')),
  recipient_email text not null,
  sent_on date not null,
  sent_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (record_id, alert_type, recipient_email, sent_on)
);

create index if not exists alert_notification_logs_org_sent_on_idx
  on public.alert_notification_logs (organization_id, sent_on desc);
create index if not exists alert_notification_logs_record_idx
  on public.alert_notification_logs (record_id, alert_type);

alter table public.alert_notification_logs enable row level security;

drop policy if exists "alert_notification_logs_owner_all" on public.alert_notification_logs;
create policy "alert_notification_logs_owner_all" on public.alert_notification_logs
  for all using (auth.uid() is not null);

grant select, insert, update, delete on public.alert_notification_logs to anon, authenticated;

do $$
begin
  raise notice '[alerts] alert_notification_logs table ready';
end $$;
