-- Activity real dates fix: board-discovered received/due dates, SQL-side counts.
-- Apply in Supabase SQL Editor.

create or replace function public._activity_text(p_value jsonb, p_value_text text)
returns text language sql immutable as $$
  select nullif(trim(coalesce(
    p_value->>'label', p_value->>'name', p_value->>'value', p_value->>'id',
    case when jsonb_typeof(p_value) = 'array'
      then (select string_agg(value, ', ') from jsonb_array_elements_text(p_value)) else null end,
    nullif(p_value_text, ''),
    case when jsonb_typeof(p_value) = 'string' then trim(both '"' from p_value::text) else null end
  )), '');
$$;

create or replace function public._activity_date(p_value jsonb, p_value_text text)
returns date language plpgsql immutable as $$
declare v text;
begin
  v := coalesce(p_value->>'end', p_value->>'date', p_value->>'to', p_value->>'start',
                public._activity_text(p_value, p_value_text));
  if v is null or lower(trim(v)) in ('', 'null', 'undefined', '-') then return null; end if;
  return public._client_360_parse_date(v);
exception when others then return null;
end;
$$;

drop function if exists public.get_activity_items(text, date, text[], text[], boolean);
drop function if exists public.get_activity_items(text, date, boolean);
drop function if exists public.get_activity_items(text, date, text[], text[], boolean, uuid);
drop function if exists public.get_activity_items(text, date, text[], text[], boolean, uuid, int, int);
drop function if exists public.get_activity_counts(text, date, date, text[], text[], boolean, uuid);

create or replace function public.get_activity_items(
  p_mode text default 'received',
  p_day date default ((now() at time zone 'Asia/Kolkata')::date),
  p_from date default null,
  p_to date default null,
  p_workspace_ids text[] default null,
  p_board_ids text[] default null,
  p_only_mine boolean default false,
  p_user_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  item_id text, job_name text, client text, workspace_id text, workspace_name text,
  board_id text, board_slug text, board_name text, group_name text, job_type text, status text,
  assignee_id uuid, assignee_name text, received_at timestamptz, due_date date,
  days_from_today integer, bucket text, priority text, quantity text,
  received_column text, due_column text, client_column text, type_column text,
  status_column text, assignee_column text, is_finished boolean, received_date date
)
language sql security definer set search_path = public stable as $$
with accessible as (
  select w.id from workspaces w
  where (p_workspace_ids is null or w.id = any(p_workspace_ids))
    and exists (select 1 from workspace_members wm where wm.workspace_id = w.id and wm.user_id = coalesce(auth.uid(), p_user_id))
  union
  select w.id from workspaces w where p_workspace_ids is null and w.owner_id = coalesce(auth.uid(), p_user_id)
),
board_fields as (
  select b.id board_id,
    -- received: COALESCE across priority list; use first filled handled in raw via multiple ids
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('received date','date received','received on','received','inward date','inwards','inward','inward date/time','upload date','uploaded on','uploaded','date uploaded','job date','order date','date') order by array_position(array['received date','date received','received on','received','inward date','inwards','inward','inward date/time','upload date','uploaded on','uploaded','date uploaded','job date','order date','date'], lower(trim(c.label))) limit 1) received_id,
    (select c.label from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('received date','date received','received on','received','inward date','inwards','inward','inward date/time','upload date','uploaded on','uploaded','date uploaded','job date','order date','date') order by array_position(array['received date','date received','received on','received','inward date','inwards','inward','inward date/time','upload date','uploaded on','uploaded','date uploaded','job date','order date','date'], lower(trim(c.label))) limit 1) received_label,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('due date','due','deadline','delivery date','target date','expected delivery','return date') order by array_position(array['due date','due','deadline','delivery date','target date','expected delivery','return date'], lower(trim(c.label))) limit 1) due_id,
    (select c.label from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('due date','due','deadline','delivery date','target date','expected delivery','return date') order by array_position(array['due date','due','deadline','delivery date','target date','expected delivery','return date'], lower(trim(c.label))) limit 1) due_label,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('client','client name','customer','party') order by array_position(array['client','client name','customer','party'], lower(trim(c.label))) limit 1) client_id,
    (select c.label from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('client','client name','customer','party') order by array_position(array['client','client name','customer','party'], lower(trim(c.label))) limit 1) client_label,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('type','job type','type of job','job category') order by array_position(array['type','job type','type of job','job category'], lower(trim(c.label))) limit 1) type_id,
    (select c.label from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('type','job type','type of job','job category') order by array_position(array['type','job type','type of job','job category'], lower(trim(c.label))) limit 1) type_label,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('status','state') order by array_position(array['status','state'], lower(trim(c.label))) limit 1) status_id,
    (select c.label from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('status','state') order by array_position(array['status','state'], lower(trim(c.label))) limit 1) status_label,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('assignee','assigned to','owner') order by array_position(array['assignee','assigned to','owner'], lower(trim(c.label))) limit 1) assignee_id,
    (select c.label from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('assignee','assigned to','owner') order by array_position(array['assignee','assigned to','owner'], lower(trim(c.label))) limit 1) assignee_label,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('priority','urgency') order by array_position(array['priority','urgency'], lower(trim(c.label))) limit 1) priority_id,
    (select c.id from columns c where c.board_id=b.id and c.deleted_at is null and lower(trim(c.label)) in ('quantity','volume','qty','images','image count') order by array_position(array['quantity','volume','qty','images','image count'], lower(trim(c.label))) limit 1) quantity_id
  from boards b
),
raw as (
  select r.id item_id, r.title job_name, r.workspace_id, w.name workspace_name,
    r.board_id, b.slug, b.name board_name, g.name group_name, r.created_at received_at,
    f.received_label, f.received_id, f.due_label, f.due_id,
    f.client_label, f.client_id, f.type_label, f.type_id,
    f.status_label, f.status_id, f.assignee_label, f.assignee_id,
    f.priority_id, f.quantity_id,
    public._activity_text(cv_client.value, cv_client.value_text) client_value,
    public._activity_text(cv_type.value, cv_type.value_text) type_value,
    public._activity_text(cv_status.value, cv_status.value_text) status_value,
    public._activity_text(cv_assignee.value, cv_assignee.value_text) assignee_value,
    public._activity_text(cv_priority.value, cv_priority.value_text) priority_value,
    public._activity_text(cv_quantity.value, cv_quantity.value_text) quantity_value,
    public._activity_date(cv_received.value, cv_received.value_text) received_date_value,
    public._activity_date(cv_due.value, cv_due.value_text) due_date_value
  from records r
  join workspaces w on w.id = r.workspace_id
  join boards b on b.id = r.board_id
  left join groups g on g.id = r.group_id
  join board_fields f on f.board_id = r.board_id
  left join cell_values cv_client on cv_client.record_id=r.id and cv_client.column_id=f.client_id
  left join cell_values cv_type on cv_type.record_id=r.id and cv_type.column_id=f.type_id
  left join cell_values cv_status on cv_status.record_id=r.id and cv_status.column_id=f.status_id
  left join cell_values cv_assignee on cv_assignee.record_id=r.id and cv_assignee.column_id=f.assignee_id
  left join cell_values cv_priority on cv_priority.record_id=r.id and cv_priority.column_id=f.priority_id
  left join cell_values cv_quantity on cv_quantity.record_id=r.id and cv_quantity.column_id=f.quantity_id
  left join cell_values cv_received on cv_received.record_id=r.id and cv_received.column_id=f.received_id
  left join cell_values cv_due on cv_due.record_id=r.id and cv_due.column_id=f.due_id
  where r.archived_at is null
    and (p_workspace_ids is null or r.workspace_id = any(p_workspace_ids))
    and (p_board_ids is null or r.board_id = any(p_board_ids))
    and (not p_only_mine or cv_assignee.value_text = coalesce(auth.uid(), p_user_id)::text
         or lower(cv_assignee.value_text) = lower(coalesce((select email from auth.users where id = coalesce(auth.uid(), p_user_id)), '')))
    and (exists (select 1 from accessible a where a.id = r.workspace_id) or coalesce(auth.uid(), p_user_id) is null)
),
normal as (
  select raw.*,
    coalesce(received_date_value, received_at::date) received_day,
    lower(trim(coalesce(status_value, ''))) in ('done','completed','delivered','closed','cancelled','archived') finished,
    case when due_date_value is null then 'No due date'
      when due_date_value < p_day then 'Overdue'
      when due_date_value = p_day then 'Due today'
      when due_date_value = p_day + 1 then 'Tomorrow'
      when due_date_value <= p_day + 7 then 'This week' else 'Later' end due_bucket
  from raw
)
select n.item_id, n.job_name, n.client_value, n.workspace_id, n.workspace_name,
  n.board_id, n.slug, n.board_name, n.group_name, n.type_value, n.status_value,
  null::uuid, n.assignee_value, n.received_at, n.due_date_value,
  case when n.due_date_value is null then null else n.due_date_value - p_day end,
  n.due_bucket, n.priority_value, n.quantity_value, n.received_label, n.due_label,
  n.client_label, n.type_label, n.status_label, n.assignee_label, n.finished,
  coalesce(n.received_date_value, n.received_at::date) received_date
from normal n
where (p_mode = 'received' and n.received_day between coalesce(p_from, p_day - 59) and coalesce(p_to, p_day))
   or (p_mode = 'due' and not n.finished and (n.due_date_value is null or n.due_date_value <= p_day + 7))
order by n.due_date_value nulls last, n.received_at
limit p_limit offset p_offset;
$$;

create or replace function public.get_activity_counts(
  p_mode text default 'received',
  p_from date default null,
  p_to date default null,
  p_workspace_ids text[] default null,
  p_board_ids text[] default null,
  p_only_mine boolean default false,
  p_user_id uuid default null
)
returns table(day date, total bigint)
language sql security definer set search_path = public stable as $$
  select received_day::date as day, count(distinct item_id)::bigint as total
  from (
    select r.id item_id, coalesce(public._activity_date(cv.value, cv.value_text), r.created_at::date) received_day
    from records r
    join boards b on b.id = r.board_id
    left join columns c on c.board_id = b.id and c.deleted_at is null
      and lower(trim(c.label)) in ('received date','date received','received on','received','inward date','inwards','inward','inward date/time','upload date','uploaded on','uploaded','date uploaded','job date','order date','date')
    left join cell_values cv on cv.record_id = r.id and cv.column_id = c.id
    where r.archived_at is null
  ) x
  where received_day between coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date - 59)
                          and coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date)
  group by received_day;
$$;

grant execute on function public.get_activity_items(text, date, date, date, text[], text[], boolean, uuid, int, int) to authenticated;
grant execute on function public.get_activity_counts(text, date, date, text[], text[], boolean, uuid) to authenticated;
