-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: _client_360_cell_to_text — opt -> elem
-- ═══════════════════════════════════════════════════════════════════════════════
-- The function at line 295 of migration 20260909000000 references `opt`
-- but the alias is `elem`. This causes:
--   ERROR: column "opt" does not exist
-- which aborts refresh_client_360_snapshot(), leaving the snapshot empty.
--
-- Copy this whole block into the Supabase Dashboard SQL Editor and run it.
-- Then run: SELECT refresh_client_360_snapshot();
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public._client_360_cell_to_text(
    p_column_id   text,
    p_value       jsonb,
    p_value_text  text
) returns text
language plpgsql
stable
as $$
declare
    v_col_type   text;
    v_settings   jsonb;
    v_raw_value  text;
    v_resolved   text;
begin
    if p_value is null then
        return coalesce(p_value_text, '');
    end if;

    select type, settings into v_col_type, v_settings
    from public.columns
    where id = p_column_id;

    case jsonb_typeof(p_value)
        when 'string'  then v_raw_value := trim(both '"' from p_value::text);
        when 'number'  then v_raw_value := p_value::text;
        when 'boolean' then v_raw_value := p_value::text;
        when 'object'  then
            if v_col_type = 'timeline' then
                v_raw_value := p_value ->> 'start';
            end if;
            if v_raw_value is null then
                v_raw_value := coalesce(
                    p_value ->> 'label',
                    p_value ->> 'name',
                    p_value ->> 'text',
                    p_value ->> 'title',
                    p_value ->> 'value'
                );
            end if;
            if v_raw_value is null then
                v_raw_value := p_value::text;
            end if;
        when 'array'   then
            v_raw_value := (
                select string_agg(
                    case
                        when jsonb_typeof(elem) = 'object' then
                            coalesce(elem ->> 'label', elem ->> 'name', elem ->> 'text', elem::text)
                        when jsonb_typeof(elem) = 'string' then
                            trim(both '"' from elem::text)
                        else elem::text
                    end, ', '
                )
                from jsonb_array_elements(p_value) elem
            );
            if v_raw_value is null then
                v_raw_value := '';
            end if;
        else
            v_raw_value := p_value::text;
    end case;

    if v_col_type in ('status', 'priority', 'dropdown', 'multi_select')
       and v_settings is not null
       and v_settings ? 'options'
       and v_raw_value is not null
       and length(v_raw_value) > 0 then

        select elem ->> 'label'
        into v_resolved
        from jsonb_array_elements(v_settings -> 'options') elem
        where (elem ? 'id'   and elem ->> 'id'   = v_raw_value)
           or (elem ? 'value' and elem ->> 'value' = v_raw_value)
           or (elem ->> 'label' = v_raw_value and elem ? 'label')
        limit 1;

        if v_resolved is not null and length(v_resolved) > 0 then
            return v_resolved;
        end if;
    end if;

    if v_raw_value is not null and length(v_raw_value) > 0 then
        return v_raw_value;
    end if;

    return coalesce(p_value_text, '');
end;
$$;

-- Then trigger the refresh:
select refresh_client_360_snapshot();