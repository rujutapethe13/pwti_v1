-- Rollback for 20261020000001_fix_client_write_policies.sql
-- Restore original policies (best-effort)
DROP POLICY IF EXISTS groups_client_write ON public.groups;
CREATE POLICY groups_client_write ON public.groups FOR ALL USING (can_view_board(board_id)) WITH CHECK (can_view_board(board_id));
DROP POLICY IF EXISTS cell_values_client_write ON public.cell_values;
CREATE POLICY cell_values_client_write ON public.cell_values FOR ALL USING (can_view_board(board_id)) WITH CHECK (can_view_board(board_id));
