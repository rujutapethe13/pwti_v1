-- Per-job payment term override for Client 360 invoicing.
-- NULL means "inherit the client's payment_term_days". A value sets the term
-- for that single job only.
alter table if exists public.records
  add column if not exists payment_term_days integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'records_payment_term_days_check'
      and conrelid = 'public.records'::regclass
  ) then
    alter table public.records
      add constraint records_payment_term_days_check
      check (payment_term_days is null or payment_term_days >= 0);
  end if;
end $$;

comment on column public.records.payment_term_days is
  'Optional per-job invoice term override in days. NULL = inherit the client payment_term_days.';

do $$
begin
  raise notice '[client-360] records.payment_term_days column ready';
end $$;
