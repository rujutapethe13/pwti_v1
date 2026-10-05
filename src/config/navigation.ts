import type { LucideIcon } from "lucide-react";

import {
  boardCatalog,
  boardTemplates,
  defaultBoardViews,
  getBoardDefinition,
  getBoardViews,
  getViewDefinition,
  viewCatalog,
  type ViewCatalogItem,
} from "@/features/boards/engine";
import type { BoardDefinition } from "@/features/boards/engine";

export interface Board {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  href: string;
  isSystem?: boolean;
  badge?: number;
}

export interface ViewMode {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface WorkflowStage {
  id: string;
  label: string;
  statusColor: string;
  order: number;
}

export interface QuickCreateAction {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

function toLegacyBoard(board: BoardDefinition & { section: "primary" | "system"; badge?: number }): Board {
  return {
    id: board.id,
    label: board.name,
    icon: board.icon as LucideIcon,
    description: board.description,
    href: `/${board.slug}`,
    isSystem: board.section === "system",
    badge: board.badge,
  };
}

function toLegacyViewMode(view: ViewCatalogItem): ViewMode {
  return {
    id: view.id,
    label: view.label,
    icon: view.icon,
    description: view.description,
  };
}

export const boards: Board[] = boardCatalog.map(toLegacyBoard);
export const viewModes: ViewMode[] = viewCatalog.map(toLegacyViewMode);

export const workflowStages: WorkflowStage[] = [
  { id: "not-started", label: "Not Started", statusColor: "status-not-started", order: 0 },
  { id: "pre-production", label: "Pre Production", statusColor: "status-in-progress", order: 1 },
  { id: "deck-shared", label: "Deck Shared", statusColor: "status-in-progress", order: 2 },
  { id: "pi-shared", label: "PI Shared", statusColor: "status-in-progress", order: 3 },
  { id: "po-received", label: "PO Received", statusColor: "status-in-progress", order: 4 },
  { id: "shoot", label: "Shoot", statusColor: "status-in-progress", order: 5 },
  { id: "post-production", label: "Post Production", statusColor: "status-in-progress", order: 6 },
  { id: "qc", label: "QC", statusColor: "status-review", order: 7 },
  { id: "approval-pending", label: "Approval Pending", statusColor: "status-review", order: 8 },
  { id: "approved", label: "Approved", statusColor: "status-approved", order: 9 },
  { id: "invoice-raised", label: "Invoice Raised", statusColor: "status-done", order: 10 },
  { id: "done", label: "Done", statusColor: "status-done", order: 11 },
];

export const quickCreateActions: QuickCreateAction[] = [
  { id: "new-batch", label: "New Batch", icon: boardCatalog[1].icon!, description: "Create a new production record" },
  { id: "new-client", label: "New Client", icon: boardCatalog[4].icon!, description: "Add a new client" },
  { id: "new-board", label: "New Board", icon: boardCatalog[5].icon!, description: "Create a custom board" },
];

export const mockUser = {
  name: "Alex Chen",
  email: "alex@powerweave.studio",
  role: "Admin",
  avatar: "AC",
  avatarColor: "bg-gradient-to-br from-amber-500 to-orange-600",
};

export const mockWorkspaces = [
  { id: "pw-main", label: "Powerweave Studio", plan: "Enterprise" },
  { id: "pw-design", label: "Design Division", plan: "Pro" },
  { id: "pw-video", label: "Video Department", plan: "Pro" },
];

export const mockStorage = {
  used: 6.2,
  total: 15,
  unit: "GB" as const,
};

export function getBoard(id: string): Board | undefined {
  return boards.find((board) => board.id === id);
}

export function getWorkflowStage(id: string): WorkflowStage | undefined {
  return workflowStages.find((stage) => stage.id === id);
}

export { boardCatalog, boardTemplates, defaultBoardViews, getBoardDefinition, getBoardViews, getViewDefinition, viewCatalog };
