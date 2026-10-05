-- ────────────────────────────────────────────────────────────
-- Cleanup script: identify and remove incorrectly-propagated columns
-- ────────────────────────────────────────────────────────────
--
-- This script helps identify columns that may have been incorrectly
-- propagated across boards due to a scoping bug. It does NOT delete
-- anything automatically — it only reports findings.
--
-- Run the SELECT queries first to review, then run the DELETE queries
-- only after confirming the results.

-- ── 1. Orphaned columns (board_id does not exist in boards table) ──
-- These columns are completely detached from any board and should
-- either be reassigned or deleted.

select
  c.id,
  c.board_id,
  c.workspace_id,
  c.organization_id,
  c.key,
  c.label,
  c.type,
  c.created_at,
  'orphaned: board_id does not exist' as issue
from public.columns c
left join public.boards b on b.id = c.board_id
where b.id is null
order by c.created_at desc;

-- ── 2. Columns with board_id matching a workspace_id ──
-- This would indicate columns were saved with workspace scope instead
-- of board scope.

select
  c.id,
  c.board_id,
  c.workspace_id,
  c.organization_id,
  c.key,
  c.label,
  c.type,
  c.created_at,
  'suspicious: board_id matches a workspace_id' as issue
from public.columns c
where exists (
  select 1 from public.workspaces w where w.id = c.board_id
)
order by c.created_at desc;

-- ── 3. Columns with board_id matching an organization_id ──
-- This would indicate columns were saved with org scope instead
-- of board scope.

select
  c.id,
  c.board_id,
  c.workspace_id,
  c.organization_id,
  c.key,
  c.label,
  c.type,
  c.created_at,
  'suspicious: board_id matches an organization_id' as issue
from public.columns c
where exists (
  select 1 from public.organizations o where o.id = c.board_id
)
order by c.created_at desc;

-- ── 4. Duplicate column IDs across boards ──
-- Each column should have a unique ID. If the same ID appears on
-- multiple boards, one of them is likely a propagation artifact.

select
  id,
  count(*) as board_count,
  string_agg(board_id, ', ' order by board_id) as boards,
  string_agg(label, ', ' order by board_id) as labels
from public.columns
group by id
having count(*) > 1
order by board_count desc;

-- ── 5. Columns created within the same minute on multiple boards ──
-- Temporal clustering can indicate batch propagation.

select
  c.id,
  c.board_id,
  c.workspace_id,
  c.key,
  c.label,
  c.type,
  c.created_at,
  date_trunc('minute', c.created_at) as created_minute
from public.columns c
where date_trunc('minute', c.created_at) in (
  select date_trunc('minute', created_at)
  from public.columns
  group by date_trunc('minute', created_at)
  having count(distinct board_id) > 1
)
order by created_minute desc, board_id;

-- ── 6. Columns on boards that share the same workspace but have
--     identical labels and types (potential copy-paste propagation) ──
select
  c1.id as column_a_id,
  c1.board_id as board_a,
  c1.label,
  c1.type,
  c1.created_at as created_a,
  c2.id as column_b_id,
  c2.board_id as board_b,
  c2.created_at as created_b,
  extract(epoch from (c2.created_at - c1.created_at)) as seconds_apart
from public.columns c1
join public.columns c2
  on c1.label = c2.label
  and c1.type = c2.type
  and c1.board_id <> c2.board_id
  and c1.workspace_id = c2.workspace_id
  and c1.organization_id = c2.organization_id
  and abs(extract(epoch from (c2.created_at - c1.created_at))) < 5
order by seconds_apart asc;

-- ── 7. Summary: count of columns per board to spot outliers ──
select
  b.id as board_id,
  b.name as board_name,
  b.workspace_id,
  count(c.id) as column_count
from public.boards b
left join public.columns c on c.board_id = b.id
group by b.id, b.name, b.workspace_id
order by column_count desc;
