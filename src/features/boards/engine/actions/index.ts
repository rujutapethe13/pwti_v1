/**
 * Server Actions — Barrel Export
 *
 * All CRUD Server Actions are exported from here.
 * Each action validates input with Zod, delegates to the service layer,
 * and returns typed ApiResponse.
 */

export {
  createBoard,
  renameBoard,
  updateBoardPrimaryLabel,
  updateBoardTitleColumnLabel,
  duplicateBoard,
  archiveBoard,
  deleteBoard,
  favoriteBoard,
} from "./board-actions";

export {
  createBoardWithDefaults,
  createBoardFromTemplate,
  createMultiLevelBoard,
  createDashboardBoard,
} from "./create";

export {
  createGroup,
  renameGroup,
  reorderGroups,
  moveGroup,
  duplicateGroup,
  collapseGroup,
  deleteGroup,
  updateGroupColor,
  updateGroupStatusOptions,
  updateGroupTitleColumnLabel,
} from "./group-actions";

export {
  addColumn,
  renameColumn,
  duplicateColumn,
  deleteColumn,
  reorderColumns,
  hideColumns,
  freezeColumn,
  changeColumnType,
  updateColumnOptions,
  deleteBoardColumns,
  loadBoardColumns,
} from "./column-actions";

export {
  upsertBoard,
  upsertBoardColumns,
  upsertBoardRecords,
  upsertBoardCellValues,
} from "./bulk-upsert-actions";

export {
  createRecord,
  editRecord,
  duplicateRecord,
  deleteRecord,
  archiveRecord,
  restoreRecord,
  moveRecord,
  bulkUpdateRecords,
  bulkDeleteRecords,
  bulkCreateRecords,
  loadRecordsPaginated,
} from "./record-actions";

export {
  createWorkspaceInDb,
  createOrganizationInDb,
  renameWorkspaceInDb,
  deleteWorkspaceInDb,
  purgeDeletedWorkspaces,
} from "./workspace-actions";

export {
  updateCell,
  bulkUpdateCells,
  clearCell,
} from "./cell-actions";

export {
  renameView,
  updateViewSettings,
  duplicateView,
  deleteView,
  ensureBoardViews,
} from "./view-actions";

export { repairDropdownColumnValues } from "./repair-actions";

export { importWithColumnCleanup } from "./import-actions";

