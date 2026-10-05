import {
  BarChart3,
  Blocks,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  ChevronDown,
  Clapperboard,
  Cog,
  FileCog,
  FileText,
  GanttChartSquare,
  LayoutDashboard,
  Map,
  PanelsTopLeft,
  ScanText,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";

import type { BoardDefinition, BoardTemplate, BoardView, ViewType } from "./types";

export interface BoardCatalogItem extends BoardDefinition {
  views: ViewType[];
  section: "primary" | "system";
  badge?: number;
}

export interface ViewCatalogItem {
  id: ViewType;
  label: string;
  description: string;
  icon: LucideIcon;
  placeholder: boolean;
}

export const boardTemplates: BoardTemplate[] = [
  {
    id: "creative-ops",
    name: "Creative Operations",
    category: "Operations",
    description: "A starting point for production-heavy service teams.",
    thumbnail: "/templates/creative-ops.png",
    seed: {
      groups: [{ name: "Inbox", color: "#64748b" }, { name: "In Progress", color: "#0ea5e9" }, { name: "Done", color: "#22c55e" }],
      columns: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "status", label: "Status", type: "status" },
        { key: "owner", label: "Owner", type: "person" },
        { key: "due", label: "Due Date", type: "date" },
      ],
      views: [{ type: "table", name: "Main Table", visibility: "shared", isDefault: true }],
    },
  },
  {
    id: "custom-board",
    name: "Custom Board",
    category: "Blank",
    description: "A blank metadata-first board with no domain assumptions.",
    seed: { groups: [], columns: [], views: [] },
  },
];

export const viewCatalog: ViewCatalogItem[] = [
  { id: "table", label: "Table", description: "Spreadsheet-style board view", icon: GanttChartSquare, placeholder: false },
  { id: "kanban", label: "Kanban", description: "Grouped card workflow", icon: LayoutDashboard, placeholder: false },
  { id: "calendar", label: "Calendar", description: "Date-based planning", icon: CalendarDays, placeholder: false },
  { id: "chart", label: "Chart", description: "Trend and performance summaries", icon: BarChart3, placeholder: false },
  { id: "dashboard", label: "Dashboard", description: "Operational overview", icon: PanelsTopLeft, placeholder: false },
  { id: "form", label: "Form", description: "Structured record capture", icon: FileText, placeholder: true },
  { id: "gallery", label: "Gallery", description: "Visual asset browsing", icon: Blocks, placeholder: false },
  { id: "timeline", label: "Timeline", description: "Sequenced work planning", icon: ChevronDown, placeholder: false },
  { id: "map", label: "Map", description: "Spatial board view", icon: Map, placeholder: true },
  { id: "gantt", label: "Gantt", description: "Cross-row dependency planning", icon: SquareCheckBig, placeholder: true },
  { id: "docs", label: "Docs", description: "Board-linked documentation", icon: ScanText, placeholder: true },
];

export const boardCatalog: BoardCatalogItem[] = [
  {
    id: "dashboard",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "dashboard",
    name: "Dashboard",
    description: "Operational overview and KPI surface",
    favorite: true,
    pinned: true,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: LayoutDashboard,
    views: ["dashboard", "table"],
    section: "primary",
  },
  {
    id: "production",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "production",
    name: "Production",
    description: "Metadata-driven production board",
    favorite: true,
    pinned: true,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "commenter", "viewer"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: Camera,
    badge: 24,
    views: ["table", "kanban", "calendar", "timeline"],
    section: "primary",
  },
  {
    id: "video",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "video",
    name: "Video",
    description: "Video production board",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: Clapperboard,
    badge: 5,
    views: ["table", "gallery", "timeline"],
    section: "primary",
  },
  {
    id: "cgi",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "cgi",
    name: "CGI",
    description: "3D and motion graphics board",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: Blocks,
    badge: 3,
    views: ["table", "gallery", "chart"],
    section: "primary",
  },
  {
    id: "retouching",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "retouching",
    name: "Retouching",
    description: "Image finishing workflow",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: FileCog,
    badge: 18,
    views: ["table", "form", "gallery"],
    section: "primary",
  },
  {
    id: "analytics",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "analytics",
    name: "Analytics Studio",
    description: "Performance and operational analytics",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor", "viewer"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: ChartNoAxesCombined,
    views: ["dashboard", "chart", "table"],
    section: "primary",
  },
  {
    id: "settings",
    organizationId: "org-main",
    workspaceId: "ws-main",
    slug: "settings",
    name: "Settings",
    description: "Workspace configuration and permissions",
    favorite: false,
    pinned: false,
    visibility: "workspace",
    status: "active",
    sharedWith: ["owner", "editor"],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    icon: Cog,
    views: ["docs"],
    section: "system",
  },
];

export const defaultBoardViews: BoardView[] = [
  {
    id: "view-table",
    boardId: "production",
    name: "Table",
    type: "table",
    visibility: "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visibleColumnIds: [],
    columnWidths: {},
    rowHeight: 44,
    settings: {},
    sharedWith: ["owner", "editor", "viewer"],
    isDefault: true,
    order: 0,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  },
];

export function getBoardDefinition(id: string): BoardCatalogItem | undefined {
  return boardCatalog.find((board) => board.id === id);
}

export function getBoardViews(boardId: string): ViewCatalogItem[] {
  const board = getBoardDefinition(boardId);
  if (!board) {
    return viewCatalog.filter((view) => view.id === "table");
  }

  return board.views
    .map((viewId) => viewCatalog.find((view) => view.id === viewId))
    .filter((view): view is ViewCatalogItem => Boolean(view));
}

export function getViewDefinition(id: ViewType): ViewCatalogItem | undefined {
  return viewCatalog.find((view) => view.id === id);
}
