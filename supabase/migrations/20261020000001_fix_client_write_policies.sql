-- Fix client write policies: require can_edit_board + client_board_access create/delete
DROP POLICY IF EXISTS groups_client_write ON public.groups;
CREATE POLICY groups_client_write ON public.groups
  FOR ALL
  USING (can_edit_board(board_id) AND EXISTS (
    SELECT 1 FROM public.client_board_access cba
    WHERE cba.board_id = groups.board_id
      AND cba.can_create = true
  ))
  WITH CHECK (can_edit_board(board_id));

DROP POLICY IF EXISTS cell_values_client_write ON public.cell_values;
CREATE POLICY cell_values_client_write ON public.cell_values
  FOR ALL
  USING (can_edit_board(board_id) AND EXISTS (
    SELECT 1 FROM public.client_board_access cba
    WHERE cba.board_id = cell_values.board_id
      AND cba.can_create = true
  ))
  WITH CHECK (can_edit_board(board_id) AND client_can_edit_column(board_id, column_id));
