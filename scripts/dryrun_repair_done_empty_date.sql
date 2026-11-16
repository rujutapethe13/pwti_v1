-- DRY RUN: Step 6 - List items where Status = Done AND Date of Upload is empty/invalid.
-- Run in Supabase SQL Editor. SELECT only — nothing is changed.
--
-- Proposes resetting these Status values back to "Not Started". Do not apply
-- until you approve the list. Shows id, name, status, upload date, and who/what
-- last set the status (updated_by / last_edited_by).

with boards_cols as (
  select b.id as board_id,
    (select c.id from public.columns c where c.board_id=b.id and c.deleted_at is null
       and lower(trim(c.label))='upload date' limit 1) as upload_col_id,
    (select c.id from public.columns c where c.board_id=b.id and c.deleted_at is null
       and lower(trim(c.label))='status' limit 1) as status_col_id
  from public.boards b
),
status_vals as (
  select cv.record_id, cv.value_text as status_value, cv.updated_by as status_updated_by, cv.updated_at as status_updated_at
  from public.cell_values cv
  join boards_cols bc on bc.status_col_id = cv.column_id
),
date_vals as (
  select cv.record_id, cv.value_text as upload_date_value
  from public.cell_values cv
  join boards_cols bc on bc.upload_col_id = cv.column_id
)
select r.id, r.title as name, sv.status_value as status, dv.upload_date_value as upload_date,
       sv.status_updated_by as status_last_set_by, sv.status_updated_at as status_last_set_at,
       r.last_edited_by as record_last_edited_by, r.last_edited_at as record_last_edited_at
from public.records r
join boards_cols bc on bc.board_id = r.board_id
left join status_vals sv on sv.record_id = r.id
left join date_vals dv on dv.record_id = r.id
where r.status = 'active'
  and lower(coalesce(sv.status_value,'')) = 'done'
  and (
    dv.upload_date_value is null
    or dv.upload_date_value = ''
    or lower(dv.upload_date_value) in ('dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd','dd/mm/yyyy','mm/dd/yyyy','yyyy/mm/dd')
    or not (dv.upload_date_value ~ '^\d{4}-\d{2}-\d{2}$')
  )
order by r.title;
