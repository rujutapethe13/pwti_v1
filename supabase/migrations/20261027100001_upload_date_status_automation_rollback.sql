-- Rollback for 20261027100000_upload_date_status_automation.sql.
drop trigger if exists cell_values_upload_date_status_automation on public.cell_values;
drop function if exists public.run_upload_date_status_automation();
delete from public.automation_actions
where automation_id = 'upload-date-status-automation';
delete from public.automation_runs
where automation_id = 'upload-date-status-automation';
delete from public.automations
where id = 'upload-date-status-automation';
