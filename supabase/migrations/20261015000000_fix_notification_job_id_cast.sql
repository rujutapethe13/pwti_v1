-- =============================================================================
-- Fix for bulk delete bug: cast record id to uuid in notification triggers
-- =============================================================================

-- Update notify_due_date_change function to cast record id to uuid when comparing to job_id
create or replace function public.notify_due_date_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if public.is_record_completed(NEW.status) then
      delete from public.notifications
       where job_id = NEW.id::uuid
         and type in ('due_soon', 'overdue')
         and is_read = false;
    end if;

    if NEW.due_date is distinct from OLD.due_date then
      if NEW.due_date is null or NEW.due_date > now() + interval '48 hours' then
        delete from public.notifications
         where job_id = NEW.id::uuid
           and type = 'due_soon'
           and is_read = false;
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

-- The trigger will automatically use the updated function; no need to recreate.
-- However, to ensure the trigger uses the latest function, we can drop and recreate it.
drop trigger if exists notify_due_date_change on public.records;
create trigger notify_due_date_change
  after update of due_date, status on public.records
  for each row execute function public.notify_due_date_change();