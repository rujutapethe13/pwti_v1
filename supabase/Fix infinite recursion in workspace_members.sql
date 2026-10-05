-- ────────────────────────────────────────────────────────────
-- Migration: Fix infinite recursion in workspace_members RLS
-- ────────────────────────────────────────────────────────────
--
-- ROOT CAUSE
--   Policies such as workspaces_select_member / boards_select_member call
--   is_workspace_member(), which was declared `security invoker` and executes:
--       SELECT 1 FROM public.workspace_members WHERE user_id = auth.uid() ...
--   That subquery re-enters RLS on workspace_members, whose SELECT policy
--   (`workspace_members_select`) self-references workspace_members:
--       workspace_id IN (SELECT workspace_id FROM public.workspace_members ...)
--   Postgres detects this self-reference and aborts with:
--       "infinite recursion detected in policy for relation 'workspace_members'"
--
-- FIX
--   1. Make is_workspace_member() SECURITY DEFINER (read-only, like the existing
--      check_permission_manage() helper) so it reads workspace_members WITHOUT
--      re-entering its RLS policy. Safe: it only READS and only checks the
--      calling user's own memberships.
--   2. Replace the self-referential workspace_members_select policy with a
--      non-recursive one: a user sees their own membership rows, or any
--      membership in a workspace they belong to (checked via the definer helper).

-- ── 1. Convert is_workspace_member to SECURITY DEFINER ─────────────────────
create or replace function public.is_workspace_member(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where user_id = auth.uid() and workspace_id = p_workspace_id
  );
$$;

-- ── 2. Replace the recursive SELECT policy on workspace_members ────────────
drop policy if exists "workspace_members_select" on public.workspace_members;

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members
  for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );
    
