create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  resend_id text unique not null,
  message_id text unique not null,
  from_address text not null,
  to_addresses text[] not null default '{}',
  subject text,
  html text,
  text text,
  received_at timestamptz,
  headers jsonb not null default '{}',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.inbound_emails enable row level security;

create index if not exists idx_inbound_emails_message_id on public.inbound_emails (message_id);
create index if not exists idx_inbound_emails_created_at on public.inbound_emails (created_at desc);
