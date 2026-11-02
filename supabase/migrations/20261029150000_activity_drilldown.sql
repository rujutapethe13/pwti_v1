-- Activity drill-down: one row per record, with board-specific column discovery.
-- Apply this file in the Supabase SQL editor after the existing migrations.

create or replace function public._activity_text(p_value jsonb, p_value_text text)
returns text
language sql immutable
as $$
  select nullif(trim(coalesce(
    p_value->>'label',
    p_value->>'name',
    p_value->>'value',
    p_value->>'id',
    case when jsonb_typeof(p_value) = 'array'
      then (select string_agg(value, ', ') from jsonb_array_elements_text(p_value))
      else null end,
    nullif(p_value_text, ''),
    case when jsonb_typeof(p_value) = 'string' then trim(both '"' from p_value::text) else null end
  )), '');
$$;

create or replace function public._activity_date(p_value jsonb, p_value_text text)
returns date
language plpgsql immutable
as $$
declare v text;
begin
  v := coalesce(p_value->>'end', p_value->>'date', p_value->>'to',
                public._activity_text(p_value, p_value_text));
  if v is null or lower(trim(v)) in ('', 'null', 'undefined', '-') then return null; end if;
  return public._client_360_parse_date(v);
exception when others then return null;
end;
$$;

drop function if exists public.get_activity_items(text, date, text[], text[], boolean);
drop function if exists public.get_activity_items(text, date, boolean);
drop function if exists public.get_activity_items(text, date, text[], text[], boolean, uuid);

create or replace function public.get_activity_items(
  p_mode text default 'received',
  p_day date default ((now() at time zone 'Asia/Kolkata')::date),
  p_workspace_ids text[] default null,
  p_board_ids text[] default null,
  p_only_mine boolean default false,
  p_user_id uuid default null
)
returns table(
  item_id text, job_name text, client text, workspace_id text, workspace_name text,
  board_id text, board_slug text, board_name text, group_name text, job_type text, status text,
  assignee_id uuid, assignee_name text, received_at timestamptz, due_date date,
  days_from_today integer, bucket text, priority text, quantity text,
  received_column text, due_column text, client_column text, type_column text,
  status_column text, assignee_column text, is_finished boolean
)
language sql
security definer
set search_path = public
stable
as $$
with accessible as (
  select w.id
  from workspaces w
  where (p_workspace_ids is null or w.id = any(p_workspace_ids))
    and exists (
      select 1 from workspace_members wm
      where wm.workspace_id = w.id and wm.user_id = coalesce(auth.uid(), p_user_id)
    )
  union
  select w.id from workspaces w
  where p_workspace_ids is null and w.owner_id = coalesce(auth.uid(), p_user_id)
),
board_fields as (
  select b.id board_id,
    max(c.label) filter (where lower(trim(c.label)) in ('received date','receive date','received','created date','job date','date')) received_label,
    max(c.id) filter (where lower(trim(c.label)) in ('received date','receive date','received','created date','job date','date')) received_id,
    max(c.label) filter (where lower(trim(c.label)) in ('due date','due','deadline','delivery date','target date')) due_label,
    max(c.id) filter (where lower(trim(c.label)) in ('due date','due','deadline','delivery date','target date')) due_id,
    max(c.label) filter (where lower(trim(c.label)) in ('client','client name','customer')) client_label,
    max(c.id) filter (where lower(trim(c.label)) in ('client','client name','customer')) client_id,
    max(c.label) filter (where lower(trim(c.label)) in ('type','job type','type of job','job category')) type_label,
    max(c.id) filter (where lower(trim(c.label)) in ('type','job type','type of job','job category')) type_id,
    max(c.label) filter (where lower(trim(c.label)) in ('status','state')) status_label,
    max(c.id) filter (where lower(trim(c.label)) in ('status','state')) status_id,
    max(c.label) filter (where lower(trim(c.label)) in ('assignee','assigned to','owner')) assignee_label,
    max(c.id) filter (where lower(trim(c.label)) in ('assignee','assigned to','owner')) assignee_id,
    max(c.label) filter (where lower(trim(c.label)) in ('priority','urgency')) priority_label,
    max(c.id) filter (where lower(trim(c.label)) in ('priority','urgency')) priority_id,
    max(c.label) filter (where lower(trim(c.label)) in ('quantity','volume','qty')) quantity_label,
    max(c.id) filter (where lower(trim(c.label)) in ('quantity','volume','qty')) quantity_id
  from boards b left join columns c on c.board_id = b.id and c.deleted_at is null
  group by b.id
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
  where r.archived_at is null and (p_workspace_ids is null or r.workspace_id = any(p_workspace_ids))
    and (p_board_ids is null or r.board_id = any(p_board_ids))
    and (not p_only_mine or cv_assignee.value_text = coalesce(auth.uid(), p_user_id)::text
      or lower(cv_assignee.value_text) = lower(coalesce((select email from auth.users where id = coalesce(auth.uid(), p_user_id)), '')))
    and (exists (select 1 from accessible a where a.id = r.workspace_id) or coalesce(auth.uid(), p_user_id) is null)
),
normal as (
  select raw.*, coalesce(received_date_value, received_at::date) received_day,
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
 null::uuid, n.assignee_value, n.received_at,
 n.due_date_value, case when n.due_date_value is null then null else n.due_date_value - p_day end,
 n.due_bucket, n.priority_value, n.quantity_value, n.received_label, n.due_label,
 n.client_label, n.type_label, n.status_label, n.assignee_label, n.finished
from normal n
where (p_mode = 'received' and n.received_day between p_day - 59 and p_day)
   or (p_mode = 'due' and not n.finished and (n.due_date_value is null or n.due_date_value <= p_day + 7))
order by n.due_date_value nulls last, n.received_at;
$$;

grant execute on function public.get_activity_items(text, date, text[], text[], boolean, uuid) to authenticated;
