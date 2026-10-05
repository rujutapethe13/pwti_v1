export function openImportWizard() {
  window.dispatchEvent(new CustomEvent("board:open-import"));
}

export function exportBoardToExcel() {
  window.dispatchEvent(new CustomEvent("board:export-excel"));
}
