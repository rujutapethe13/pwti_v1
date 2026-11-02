-- Upload Date -> status automation.
-- Safe to run once in the Supabase SQL editor. No existing data is deleted or
-- changed by installing this migration.

create table if not exists public.automations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  trigger_type text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_actions (
  id text primary key default gen_random_uuid()::text,
  automation_id text not null references public.automations(id) on delete cascade,
  action_type text not null,
  configuration jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0
);

create table if not exists public.automation_runs (
  id text primary key default gen_random_uuid()::text,
  automation_id text references public.automations(id) on delete set null,
  board_id text references public.boards(id) on delete set null,
  record_id text references public.records(id) on delete set null,
  status text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.automations (id, name, trigger_type)
values (
  'upload-date-status-automation',
  'Set status fields when Upload Date is first filled',
  'cell_value_transition'
)
on conflict (id) do update
set name = excluded.name,
    trigger_type = excluded.trigger_type,
    updated_at = now();

insert into public.automation_actions (automation_id, action_type, configuration)
select
  'upload-date-status-automation',
  'set_matching_status_columns_done',
  '{"source_column":"Upload Date","target_columns":["Status","TAT","Upload Status"]}'::jsonb
where not exists (
  select 1
  from public.automation_actions
  where automation_id = 'upload-date-status-automation'
    and action_type = 'set_matching_status_columns_done'
);

create or replace function public.run_upload_date_status_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  upload_column boolean;
  old_filled boolean;
  new_filled boolean;
  target_count integer := 0;
  done_count integer := 0;
  updated_count integer := 0;
  skipped_reason text := null;
  target_details jsonb := '[]'::jsonb;
begin
  select lower(trim(c.label)) = 'upload date'
    into upload_column
  from public.columns c
  where c.id = new.column_id
    and c.board_id = new.board_id
    and c.deleted_at is null;

  if coalesce(upload_column, false) is not true then
    return new;
  end if;

  old_filled := TG_OP <> 'INSERT'
    and coalesce(nullif(btrim(coalesce(old.value_text, '')), ''), null) is not null;
  new_filled := coalesce(nullif(btrim(coalesce(new.value_text, '')), ''), null) is not null;

  -- Only the empty -> filled transition is meaningful.
  if old_filled or not new_filled then
    return new;
  end if;

  with target_columns as (
    select c.id, c.label, c.settings
    from public.columns c
    where c.board_id = new.board_id
      and c.deleted_at is null
      and lower(trim(c.label)) in ('status', 'tat', 'upload status')
  ),
  targets_with_done as (
    select tc.id, tc.label,
      coalesce(
        (
          select coalesce(nullif(elem->>'id', ''), elem->>'value', elem->>'label')
          from jsonb_array_elements(
            case
              when jsonb_typeof(tc.settings->'labels') = 'array' then tc.settings->'labels'
              when jsonb_typeof(tc.settings->'options') = 'array' then tc.settings->'options'
              else '[]'::jsonb
            end
          ) elem
          where lower(trim(coalesce(elem->>'label', elem->>'value', elem #>> '{}'))) = 'done'
          limit 1
        ),
        ''
      ) as done_value
    from target_columns tc
  )
  select count(*)::integer,
         count(*) filter (where done_value <> '')::integer,
         coalesce(jsonb_agg(jsonb_build_object('column_id', id, 'label', label, 'done_value', done_value)), '[]'::jsonb)
    into target_count, done_count, target_details
  from targets_with_done;

  if target_count = 0 then
    skipped_reason := 'no_matching_status_columns';
  end if;

  with target_columns as (
    select c.id, c.settings
    from public.columns c
    where c.board_id = new.board_id
      and c.deleted_at is null
      and lower(trim(c.label)) in ('status', 'tat', 'upload status')
  ),
  target_values as (
    select tc.id,
      coalesce(
        (
          select coalesce(nullif(elem->>'id', ''), elem->>'value', elem->>'label')
          from jsonb_array_elements(
            case
              when jsonb_typeof(tc.settings->'labels') = 'array' then tc.settings->'labels'
              when jsonb_typeof(tc.settings->'options') = 'array' then tc.settings->'options'
              else '[]'::jsonb
            end
          ) elem
          where lower(trim(coalesce(elem->>'label', elem->>'value', elem #>> '{}'))) = 'done'
          limit 1
        ),
        ''
      ) as done_value
    from target_columns tc
  )
  insert into public.cell_values (
    id, organization_id, workspace_id, board_id, record_id, column_id,
    value, value_text, version, updated_at
  )
  select
    new.board_id || ':' || new.record_id || ':' || tv.id,
    new.organization_id, new.workspace_id, new.board_id, new.record_id, tv.id,
    to_jsonb(tv.done_value), tv.done_value, 1, now()
  from target_values tv
  where tv.done_value <> ''
    and not exists (
      select 1
      from public.cell_values existing
      where existing.record_id = new.record_id
        and existing.column_id = tv.id
        and lower(trim(existing.value_text)) = 'done'
    )
  on conflict (board_id, record_id, column_id) do update
    set value = excluded.value,
        value_text = excluded.value_text,
        updated_at = now()
    where lower(trim(public.cell_values.value_text)) <> 'done';

  get diagnostics updated_count = row_count;

  if updated_count > 0 then
    skipped_reason := null;
  elsif target_count > 0 then
    skipped_reason := 'all_matching_statuses_already_done_or_missing_done_label';
  end if;

  insert into public.automation_runs (
    automation_id, board_id, record_id, status, details
  )
  values (
    'upload-date-status-automation',
    new.board_id,
    new.record_id,
    case
      when updated_count > 0 then 'fired'
      when target_count > 0 and done_count = 0 then 'warning'
      else 'skipped'
    end,
    jsonb_build_object(
      'source_column_id', new.column_id,
      'target_columns', target_details,
      'updated_count', updated_count,
      'reason', skipped_reason
    )
  );

  return new;
end;
$$;

drop trigger if exists cell_values_upload_date_status_automation on public.cell_values;
create trigger cell_values_upload_date_status_automation
after insert or update of value, value_text on public.cell_values
for each row
execute function public.run_upload_date_status_automation();

create index if not exists automation_runs_board_created_idx
  on public.automation_runs (board_id, created_at desc);
