-- One-time repair for Mirror columns created without a valid Connect Boards
-- source. The first block is deliberately a dry run: its notices are the
-- inventory to review in the SQL editor before the repair statements run.

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.columns m
  left join public.columns source
    on source.id = m.settings->>'source_connect_column_id'
   and source.board_id = m.board_id
   and source.type = 'connected_board'
   and source.deleted_at is null
  where m.type = 'mirror'
    and m.deleted_at is null
    and source.id is null;
  raise notice 'dry-run: would remove % orphan mirror column(s)', v_count;
end
$$;

do $$
declare
  v_id text;
begin
  for v_id in
    select m.id
    from public.columns m
    left join public.columns source
      on source.id = m.settings->>'source_connect_column_id'
     and source.board_id = m.board_id
     and source.type = 'connected_board'
     and source.deleted_at is null
    where m.type = 'mirror'
      and m.deleted_at is null
      and source.id is null
  loop
    perform public.cleanup_column_dependents(v_id);
    delete from public.columns where id = v_id;
  end loop;
end
$$;

do $$
begin
  raise notice 'orphan Mirror cleanup complete';
end
$$;
