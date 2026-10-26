/**
 * Fix the _client_360_cell_to_text function (opt -> elem bug) and trigger refresh.
 * Uses direct Postgres connection via pg module.
 * Run: node scripts\fix_and_refresh.cjs
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

  const connectionString = `postgresql://postgres.${projectRef}:${serviceRoleKey}@db.${projectRef}.supabase.co:5432/postgres`;

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('Connected to remote database');

  // Fix the _client_360_cell_to_text function
  const fixSql = `
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
  `;

  await client.query(fixSql);
  console.log('Fixed _client_360_cell_to_text (opt -> elem)');

  // Trigger snapshot refresh
  const result = await client.query('SELECT public.refresh_client_360_snapshot()');
  console.log('Refresh result:', JSON.stringify(result.rows));

  // Check snapshot
  const snapCount = await client.query('SELECT count(*) FROM public.client_360_daily_snapshot');
  console.log('Snapshot rows:', snapCount.rows[0].count);

  // Check field mappings
  const maps = await client.query("SELECT board_id, field_type, resolved_column_ref FROM client_360_field_mappings WHERE field_type = 'job_date'");
  console.log('job_date mappings:', JSON.stringify(maps.rows));

  await client.end();
  console.log('Done');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });