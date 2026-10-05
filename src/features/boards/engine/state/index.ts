import type { BoardDefinition, BoardRecord, BoardView, ColumnDefinition, Group, Workspace } from "../types";

export interface WorkspaceStoreState {
  activeWorkspaceId: string | null;
  workspaces: Workspace[];
}

export interface BoardStoreState {
  activeBoardId: string | null;
  boards: BoardDefinition[];
  recordsByBoardId: Record<string, BoardRecord[]>;
  columnsByBoardId: Record<string, ColumnDefinition[]>;
}

export interface GroupStoreState {
  groupsByBoardId: Record<string, Group[]>;
}

export interface ViewStoreState {
  viewsByBoardId: Record<string, BoardView[]>;
  activeViewByBoardId: Record<string, string | null>;
}

export interface SelectionStoreState {
  activeBoardId: string | null;
  activeRecordId: string | null;
  activeColumnId: string | null;
}

export interface CommandPaletteStoreState {
  open: boolean;
  query: string;
}

export interface UiStoreState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  theme: "light" | "dark" | "system";
}

export interface RealtimeStoreState {
  activeBoardId: string | null;
  presence: Array<{ userId: string; name: string; color: string }>;
  lastEventId?: string | null;
}

export interface NotificationStoreState {
  unreadCount: number;
}

export interface UndoRedoStoreState {
  past: BoardAction[];
  future: BoardAction[];
}

export interface BoardAction {
  id: string;
  type: string;
  boardId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
}
