-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20261030010000: Activity Tasks RPC (get_activity_tasks)
--
-- Additive RPC for the Activity page Due-date / Task view and inline Day details
-- panel. Guarantees:
--   1. 1 task = 1 distinct record row (COUNT(DISTINCT r.id)), never SKU sum or
--      cell fan-out.
--   2. Column discovery per board by normalized label (collapsing newlines/spaces):
--      - Due date: 'due date', 'due', 'deadline', 'delivery date', 'target date', 'date'
--      - Received date: 'receive date post production', 'receive date', 'received date',
--        'inward date', 'received', 'created date', 'job date'
--      - Client: 'client / company name', 'client name', 'client', 'customer'
--      - Type of job: 'type of job', 'job type', 'type', 'job category'
--      - Status: 'status', 'tat', 'upload status', 'state'
--      - Assignee: 'assigned to', 'assignee', 'owner', 'artist name'
--      - Priority: 'priority', 'urgency'
--   3. Option IDs in dropdown/status/priority columns are resolved against
--      columns.settings->'options' via _client_360_cell_to_text.
--   4. Calendar date math in Asia/Kolkata: days_from_today = due_date - today_ist.
--   5. Explicit TEXT vs UUID casts (workspaces.id / boards.id = text; user_id = uuid).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public._activity_norm_label(p_label text)
returns text
language sql immutable
as $$
  select regexp_replace(lower(trim(coalesce(p_label, ''))), '\s+', ' ', 'g');
$$;

create or replace function public._activity_resolve_cell_text(
  p_column_id text,
  p_value jsonb,
  p_value_text text
) returns text
language plpgsql stable
as $$
declare
  v_text text;
begin
  if p_column_id is null then
    return null;
  end if;
  v_text := nullif(trim(coalesce(
    public._client_360_cell_to_text(p_column_id, p_value, p_value_text),
    ''
  )), '');
  if v_text is not null and lower(v_text) not in ('null', 'undefined', '-') then
    return v_text;
  end if;
  return null;
exception when others then
  return nullif(trim(coalesce(p_value_text, '')), '');
end;
$$;

create or replace function public._activity_resolve_date(
  p_column_id text,
  p_value jsonb,
  p_value_text text
) returns date
language plpgsql immutable
as $$
declare
  v_raw text;
begin
  if p_column_id is null then
    return null;
  end if;
  if p_value is not null and jsonb_typeof(p_value) = 'object' then
    v_raw := coalesce(
      p_value ->> 'end',
      p_value ->> 'to',
      p_value ->> 'date',
      p_value ->> 'start',
      p_value ->> 'value'
    );
  end if;
  if v_raw is null then
    v_raw := coalesce(
      nullif(trim(p_value_text), ''),
      case
        when p_value is not null and jsonb_typeof(p_value) = 'string'
        then trim(both '"' from p_value::text)
        else null
      end
    );
  end if;
  if v_raw is null or lower(trim(v_raw)) in ('', 'null', 'undefined', '-') then
    return null;
  end if;
  return public._client_360_parse_date(v_raw);
exception when others then
  return null;
end;
$$;

drop function if exists public.get_activity_tasks(text, date, text[], text[], boolean);
drop function if exists public.get_activity_tasks(text, date, text[], text[], boolean, uuid);

create or replace function public.get_activity_tasks(
  p_mode text default 'received',
  p_day date default ((now() at time zone 'Asia/Kolkata')::date),
  p_workspace_ids text[] default null,
  p_board_ids text[] default null,
  p_only_mine boolean default false,
  p_user_id uuid default null
)
returns table(
  item_id text,
  job_name text,
  client text,
  workspace_id text,
  workspace_name text,
  board_id text,
  board_slug text,
  board_name text,
  group_name text,
  job_type text,
  status text,
  assignee_id uuid,
  assignee_name text,
  received_at date,
  due_date date,
  days_from_today integer,
  bucket text,
  priority text,
  due_column text,
  is_finished boolean
)
language sql
security definer
set search_path = public
stable
as $$
with caller as (
  select
    coalesce(auth.uid(), p_user_id) as uid,
    (now() at time zone 'Asia/Kolkata')::date as today_ist
),
accessible_workspaces as (
  select w.id
  from public.workspaces w
  cross join caller c
  where (p_workspace_ids is null or w.id = any(p_workspace_ids))
    and (
      c.uid is null
      or w.owner_id = c.uid
      or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = w.id
          and wm.user_id = c.uid
      )
    )
),
col_stats as (
  select
    c.board_id,
    c.id as column_id,
    c.label,
    public._activity_norm_label(c.label) as norm_label,
    c.type,
    c.sort_order,
    count(cv.record_id) as pop_count
  from public.columns c
  left join public.cell_values cv
    on cv.board_id = c.board_id
   and cv.column_id = c.id
   and (cv.value is not null or nullif(trim(cv.value_text), '') is not null)
  where c.deleted_at is null
  group by c.board_id, c.id, c.label, c.type, c.sort_order
),
board_fields as (
  select
    b.id as board_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('due date', 'due', 'deadline', 'delivery date', 'target date', 'date')
      order by
        case cs.norm_label
          when 'due date' then 1
          when 'deadline' then 2
          when 'delivery date' then 3
          when 'target date' then 4
          when 'due' then 5
          when 'date' then 6
          else 9
        end,
        cs.pop_count desc,
        cs.sort_order asc
      limit 1
    ) as due_col_id,
    (
      select regexp_replace(trim(cs.label), '\s+', ' ', 'g')
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('due date', 'due', 'deadline', 'delivery date', 'target date', 'date')
      order by
        case cs.norm_label
          when 'due date' then 1
          when 'deadline' then 2
          when 'delivery date' then 3
          when 'target date' then 4
          when 'due' then 5
          when 'date' then 6
          else 9
        end,
        cs.pop_count desc,
        cs.sort_order asc
      limit 1
    ) as due_col_label,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in (
          'receive date post production',
          'receive date',
          'received date',
          'inward date',
          'received',
          'created date',
          'job date'
        )
      order by cs.pop_count desc, cs.sort_order asc
      limit 1
    ) as received_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('client / company name', 'client name', 'client', 'customer', 'company')
      order by cs.pop_count desc, cs.sort_order asc
      limit 1
    ) as client_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('item name', 'files name', 'batch details (pfm1_no)')
      order by
        case cs.norm_label
          when 'item name' then 1
          when 'files name' then 2
          else 3
        end,
        cs.pop_count desc,
        cs.sort_order asc
      limit 1
    ) as item_name_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('batch details (pfm1_no)', 'saleno.')
      order by cs.pop_count desc, cs.sort_order asc
      limit 1
    ) as batch_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('type of job', 'job type', 'type', 'job category', 'requirement')
      order by cs.pop_count desc, cs.sort_order asc
      limit 1
    ) as type_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('status', 'tat', 'upload status', 'state')
      order by
        case cs.norm_label
          when 'status' then 1
          when 'upload status' then 2
          when 'tat' then 3
          else 4
        end,
        cs.pop_count desc,
        cs.sort_order asc
      limit 1
    ) as status_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('assigned to', 'assignee', 'owner', 'artist name')
      order by cs.pop_count desc, cs.sort_order asc
      limit 1
    ) as assignee_col_id,
    (
      select cs.column_id
      from col_stats cs
      where cs.board_id = b.id
        and cs.norm_label in ('priority', 'urgency')
      order by cs.pop_count desc, cs.sort_order asc
      limit 1
    ) as priority_col_id
  from public.boards b
),
resolved_rows as (
  select distinct on (r.id)
    r.id as item_id,
    r.title as raw_title,
    r.workspace_id,
    w.name as workspace_name,
    r.board_id,
    b.slug as board_slug,
    b.name as board_name,
    g.name as group_name,
    bf.due_col_label as due_column,
    public._activity_resolve_cell_text(bf.client_col_id, cv_client.value, cv_client.value_text) as raw_client,
    public._activity_resolve_cell_text(bf.item_name_col_id, cv_item.value, cv_item.value_text) as raw_item_name,
    public._activity_resolve_cell_text(bf.batch_col_id, cv_batch.value, cv_batch.value_text) as raw_batch,
    public._activity_resolve_cell_text(bf.type_col_id, cv_type.value, cv_type.value_text) as job_type,
    public._activity_resolve_cell_text(bf.status_col_id, cv_status.value, cv_status.value_text) as status,
    public._activity_resolve_cell_text(bf.assignee_col_id, cv_assignee.value, cv_assignee.value_text) as assignee_name,
    public._activity_resolve_cell_text(bf.priority_col_id, cv_priority.value, cv_priority.value_text) as priority,
    coalesce(
      snap.job_date,
      public._activity_resolve_date(bf.received_col_id, cv_rec.value, cv_rec.value_text)
    ) as received_at,
    coalesce(
      public._activity_resolve_date(bf.due_col_id, cv_due.value, cv_due.value_text),
      snap.due_date
    ) as due_date,
    cl.canonical_name as snapshot_client_name
  from public.records r
  join public.workspaces w on w.id = r.workspace_id
  join public.boards b on b.id = r.board_id
  join accessible_workspaces aw on aw.id = r.workspace_id
  join board_fields bf on bf.board_id = r.board_id
  left join public.groups g on g.id = r.group_id
  left join public.client_360_daily_snapshot snap on snap.record_id = r.id
  left join public.client_360_clients cl on cl.id = snap.client_id
  left join public.cell_values cv_client
    on cv_client.record_id = r.id and cv_client.column_id = bf.client_col_id
  left join public.cell_values cv_item
    on cv_item.record_id = r.id and cv_item.column_id = bf.item_name_col_id
  left join public.cell_values cv_batch
    on cv_batch.record_id = r.id and cv_batch.column_id = bf.batch_col_id
  left join public.cell_values cv_type
    on cv_type.record_id = r.id and cv_type.column_id = bf.type_col_id
  left join public.cell_values cv_status
    on cv_status.record_id = r.id and cv_status.column_id = bf.status_col_id
  left join public.cell_values cv_assignee
    on cv_assignee.record_id = r.id and cv_assignee.column_id = bf.assignee_col_id
  left join public.cell_values cv_priority
    on cv_priority.record_id = r.id and cv_priority.column_id = bf.priority_col_id
  left join public.cell_values cv_rec
    on cv_rec.record_id = r.id and cv_rec.column_id = bf.received_col_id
  left join public.cell_values cv_due
    on cv_due.record_id = r.id and cv_due.column_id = bf.due_col_id
  where r.archived_at is null
    and r.status = 'active'
    and b.status <> 'archived'
    and (p_board_ids is null or r.board_id = any(p_board_ids))
  order by r.id
),
enriched as (
  select
    rr.item_id,
    case
      when rr.raw_title is null or rr.raw_title ~* '^imported row \d+$' then
        coalesce(
          nullif(concat_ws(' — ', coalesce(rr.raw_client, rr.raw_item_name), rr.raw_batch), ''),
          rr.job_type,
          rr.raw_title,
          'Untitled task'
        )
      else rr.raw_title
    end as job_name,
    coalesce(rr.raw_client, rr.snapshot_client_name, rr.raw_item_name) as client,
    rr.workspace_id,
    rr.workspace_name,
    rr.board_id,
    rr.board_slug,
    rr.board_name,
    rr.group_name,
    rr.job_type,
    rr.status,
    null::uuid as assignee_id,
    rr.assignee_name,
    rr.received_at,
    rr.due_date,
    case
      when rr.due_date is null then null
      else (rr.due_date - c.today_ist)::integer
    end as days_from_today,
    case
      when rr.due_date is null then 'No due date'
      when rr.due_date < c.today_ist then 'Overdue'
      when rr.due_date = c.today_ist then 'Due today'
      when rr.due_date = c.today_ist + 1 then 'Tomorrow'
      when rr.due_date <= c.today_ist + 7 then 'This week'
      else 'Later'
    end as bucket,
    rr.priority,
    rr.due_column,
    lower(trim(coalesce(rr.status, ''))) in (
      'done', 'completed', 'complete', 'delivered', 'closed', 'cancelled', 'archived'
    ) as is_finished
  from resolved_rows rr
  cross join caller c
  where not p_only_mine
     or (
       c.uid is not null
       and (
         rr.assignee_name = c.uid::text
         or lower(coalesce(rr.assignee_name, '')) = lower(coalesce((select u.email from auth.users u where u.id = c.uid), ''))
       )
     )
)
select
  e.item_id,
  e.job_name,
  e.client,
  e.workspace_id,
  e.workspace_name,
  e.board_id,
  e.board_slug,
  e.board_name,
  e.group_name,
  e.job_type,
  e.status,
  e.assignee_id,
  e.assignee_name,
  e.received_at,
  e.due_date,
  e.days_from_today,
  e.bucket,
  e.priority,
  e.due_column,
  e.is_finished
from enriched e
where (
    p_mode = 'received'
    and e.received_at is not null
    and e.received_at between (p_day - 59) and p_day
  )
  or (
    p_mode = 'due'
    and not e.is_finished
  )
order by
  case when e.due_date is null then 1 else 0 end asc,
  e.due_date asc,
  e.received_at desc nulls last,
  e.job_name asc;
$$;

grant execute on function public.get_activity_tasks(text, date, text[], text[], boolean, uuid) to authenticated, service_role;
