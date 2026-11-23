-- Confirmed Client 360 aliases. This never deletes or merges client rows.

do $$
declare
  v_org text;
  v_canonical text;
  v_alias text;
  v_client_id text;
  v_aliases jsonb := '{
    "nasher miles": ["nasher mile"],
    "bioweaves": ["bioweave"],
    "labbada": ["labada"],
    "papa don''t preach": ["papa don,t peach", "papa dont peach"],
    "levis": ["levi''s", "levi strauss & co", "levis strauss & co"],
    "safari": ["safari select", "safari-genie"]
  }'::jsonb;
  v_group jsonb;
begin
  for v_org in
    select distinct organization_id
    from public.client_360_clients
  loop
    for v_canonical, v_group in
      select key, value
      from jsonb_each(v_aliases)
    loop
      insert into public.client_360_clients
        (organization_id, canonical_name, needs_confirmation)
      values
        (v_org, v_canonical, false)
      on conflict (organization_id, canonical_name) do update
        set needs_confirmation = false,
            updated_at = now();

      select id
        into v_client_id
        from public.client_360_clients
       where organization_id = v_org
         and canonical_name = v_canonical;

      insert into public.client_360_client_aliases
        (client_id, organization_id, alias_text)
      select
        v_client_id,
        v_org,
        value
      from jsonb_array_elements_text(v_group)
      on conflict (organization_id, alias_text) do update
        set client_id = excluded.client_id;
    end loop;
  end loop;
end;
$$;
