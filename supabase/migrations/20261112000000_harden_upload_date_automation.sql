-- Harden Upload Date -> Status automation trigger.
-- Replaces run_upload_date_status_automation() so it fires ONLY on the
-- empty -> valid-date transition for the Upload Date column.
--
-- Treats null / "" / whitespace / placeholder formats
--   (dd-mm-yyyy, mm-dd-yyyy, yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy, yyyy/mm/dd)
-- as empty, and rejects any value that is not a real calendar date
-- (NaN / Invalid Date / 0001-01-01 / 1970-01-01 placeholders included).
-- Applies in the Supabase SQL Editor. Safe to re-run.

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
  new_text text;
  old_text text;
  new_date date;
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

  -- Normalize both sides: trim, coerce to text, treat placeholders as empty.
  new_text := nullif(btrim(coalesce(new.value_text, '')), '');
  old_text := case
    when tg_op = 'INSERT' then null
    else nullif(btrim(coalesce(old.value_text, '')), '')
  end;

  if lower(new_text) in ('dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd','dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd','')
  then new_text := null; end if;
  if lower(old_text) in ('dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd','dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd','')
  then old_text := null; end if;

  old_filled := old_text is not null;
  new_filled := new_text is not null;

  -- Only the empty -> valid date transition is meaningful. An actual value
  -- change is required (old !== new); re-saves and empty writes are ignored.
  if old_filled or not new_filled then
    return new;
  end if;

  -- Reject anything that is not a real calendar date.
  begin
    new_date := new_text::date;
  exception when others then
    return new;
  end;

  if new_date is null then
    return new;
  end if;

  -- Reject placeholder/epoch sentinel dates.
  if new_date = date '1970-01-01' or new_date = date '0001-01-01' then
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
