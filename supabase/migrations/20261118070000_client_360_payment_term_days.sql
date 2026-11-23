-- Add per-client invoice clearance payment term for alert reminders.
-- NULL = reminders disabled, 0 = same day, >0 = days after counted-from date.
alter table if exists public.client_360_clients
  add column if not exists payment_term_days integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_360_clients_payment_term_days_check'
      and conrelid = 'public.client_360_clients'::regclass
  ) then
    alter table public.client_360_clients
      add constraint client_360_clients_payment_term_days_check
      check (payment_term_days is null or payment_term_days >= 0);
  end if;
end $$;

comment on column public.client_360_clients.payment_term_days is
  'Client-agreed invoice clearance period in days. NULL disables invoice reminders; 0 means same day.';

do $$
begin
  raise notice '[client-360] payment_term_days column ready on client_360_clients';
end $$;
