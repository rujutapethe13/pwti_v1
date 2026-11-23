-- Hide job/product names from the Client 360 selector without deleting data.

update public.client_360_clients
set needs_confirmation = true,
    updated_at = now()
where lower(regexp_replace(trim(canonical_name), '\s+', ' ', 'g')) in (
  'a', 'apperals', 'backpack', 'bag', 'bottle', 'flatlay',
  'footwear', 'product', 'trolley bag'
)
or length(trim(canonical_name)) <= 2;

create or replace function public._client_360_preserve_confirmation()
returns trigger
language plpgsql
as $$
declare
  v_name text := lower(regexp_replace(trim(new.canonical_name), '\s+', ' ', 'g'));
begin
  if v_name in (
    'a', 'apperals', 'backpack', 'bag', 'bottle', 'flatlay',
    'footwear', 'product', 'trolley bag'
  ) or length(v_name) <= 2 then
    new.needs_confirmation := true;
  elsif tg_op = 'UPDATE' and old.needs_confirmation then
    new.needs_confirmation := true;
  end if;
  return new;
end;
$$;

drop trigger if exists client_360_preserve_confirmation
  on public.client_360_clients;

create trigger client_360_preserve_confirmation
before insert or update of canonical_name, needs_confirmation
on public.client_360_clients
for each row
execute function public._client_360_preserve_confirmation();
