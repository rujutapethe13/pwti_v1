create table if not exists public.triggers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  scope jsonb not null default '{"workspaces":"all","boards":"all"}',
  conditions jsonb not null default '[]',
  condition_operator text not null default 'AND',
  run_mode text not null default 'manual',
  actions jsonb not null default '[]',
  email_settings jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trigger_logs (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid references public.triggers(id) on delete cascade,
  started_at timestamptz not null default now(),
  started_by text,
  items_matched integer not null default 0,
  email_sent boolean not null default false,
  error text
);

insert into public.triggers (name, enabled, scope, conditions, condition_operator, run_mode, actions, email_settings)
values (
  'Send Overdue Alert Email',
  true,
  '{"workspaces":"all","boards":"all"}',
  '[{"field":"payment_status","operator":"equals","value":"Overdue"},{"field":"due_date","operator":"before","value":"today"},{"field":"payment_status","operator":"not_equals","value":"Paid"}]',
  'OR',
  'manual',
  '[{"type":"email"}]',
  '{"send":true,"to":[{"type":"field","value":"client_email"}],"subject":"Overdue: {client} - {batch}","body":"Item {batch} is overdue. Due {due_date}. Amount {amount}.","format":"per_item","frequency_hours":24}'
)
on conflict do nothing;