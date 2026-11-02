-- Fix the add-member path's remaining text/uuid mismatch.
--
-- Workspace and board identifiers are text throughout the metadata and
-- membership tables. The notifications table was added with UUID identifier
-- columns, so inserting a workspace member invoked notify_workspace_invite()
-- and failed before the membership mutation could complete.

alter table public.notifications
  alter column workspace_id type text using workspace_id::text,
  alter column board_id type text using board_id::text;

-- Managers with the workspace permission are allowed to invite. Keep the
-- existing super-admin/service-role paths and add the same permission gate
-- used by the rest of the legacy workspace RLS.
drop policy if exists workspace_invites_select_admin on public.workspace_invites;
create policy workspace_invites_select_admin on public.workspace_invites
  for select
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or public.check_permission_manage(workspace_id, 'workspace'::public.resource_type)
  );

drop policy if exists workspace_invites_write_admin on public.workspace_invites;
create policy workspace_invites_write_admin on public.workspace_invites
  for all
  using (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or public.check_permission_manage(workspace_id, 'workspace'::public.resource_type)
  )
  with check (
    public.is_service_role()
    or public.is_super_admin()
    or public.current_role() = 'admin'
    or public.check_permission_manage(workspace_id, 'workspace'::public.resource_type)
  );