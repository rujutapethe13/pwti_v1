import type { BoardDefinition, BoardRecord, ColumnDefinition, ColumnValue, BoardView, Group } from "./types";
import { columnTypeRegistry } from "./column-registry";

export interface DemoBoardPageData {
  board: BoardDefinition;
  description: string;
  metrics: Array<{ label: string; value: string; detail?: string }>;
  columns: ColumnDefinition[];
  records: BoardRecord[];
  cellValues: Array<[string, ColumnValue]>;
  views: BoardView[];
  groups: Group[];
  recordCount?: number;
  recordOffset?: number;
}

export function createColumn(
  boardId: string,
  id: string,
  key: string,
  label: string,
  type: ColumnDefinition["type"],
  order: number,
  defaultValue: ColumnValue,
  settings: Record<string, unknown> = {},
): ColumnDefinition {
  const typeDefaults = columnTypeRegistry[type]?.defaultOptions;
  const seededSettings =
    !settings.options && typeDefaults
      ? { ...settings, options: typeDefaults.map((opt) => ({ ...opt })) }
      : settings;
  return {
    id,
    boardId,
    key,
    label,
    type,
    required: false,
    hidden: false,
    frozen: false,
    defaultValue,
    settings: seededSettings,
    permissions: { view: ["owner", "editor", "commenter", "viewer"], edit: ["owner", "editor"], configure: ["owner"] },
    validation: [],
    version: 1,
    order,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

function createRecord(board: BoardDefinition, id: string, title: string, version: number): BoardRecord {
  return {
    id,
    organizationId: board.organizationId,
    workspaceId: board.workspaceId,
    boardId: board.id,
    groupId: null,
    title,
    status: "active",
    version,
    archivedAt: null,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

function createCellEntries(entries: Array<[string, ColumnValue]>): Array<[string, ColumnValue]> {
  return entries;
}

function createDefaultView(boardId: string, organizationId: string, workspaceId: string, viewType: BoardView["type"], order = 0): BoardView {
  const name = viewType.charAt(0).toUpperCase() + viewType.slice(1);
  return {
    id: `view-${boardId}-${viewType}-${order}`,
    boardId,
    organizationId,
    workspaceId,
    name,
    type: viewType,
    description: `${name} view`,
    visibility: "shared",
    filters: [],
    sorting: [],
    grouping: [],
    visibleColumnIds: [],
    columnWidths: {},
    rowHeight: 44,
    settings: {},
    sharedWith: ["owner", "editor", "viewer"],
    isDefault: order === 0,
    order,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

export function createGroup(boardId: string, organizationId: string, workspaceId: string, name = "All Tasks", order = 0): Group {
  return {
    id: `${boardId}-group-all`,
    boardId,
    organizationId,
    workspaceId,
    name,
    color: "#94a3b8",
    collapsed: false,
    order,
    status: "active",
    parentGroupId: null,
    permissions: undefined,
    statusOptions: [],
  };
}

export const demoBoardPageData: Record<string, DemoBoardPageData> = {
  production: {
    board: {
      id: "production",
      organizationId: "org-main",
      workspaceId: "ws-main",
      slug: "production",
      name: "Production",
      description: "Live production work",
      icon: undefined,
      favorite: false,
      pinned: false,
      visibility: "workspace",
      status: "active",
      sharedWith: ["owner", "editor", "viewer"],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    description: "Live production work, tracked through the metadata engine.",
    metrics: [
      { label: "Open items", value: "3" },
      { label: "At risk", value: "1" },
      { label: "In QA", value: "1" },
    ],
    columns: [
      createColumn("production", "production-status", "status", "Status", "status", 0, "To Do", { options: [
        { id: "opt-to-do", label: "To Do", color: "#94a3b8" },
        { id: "opt-in-progress", label: "In Progress", color: "#f59e0b" },
        { id: "opt-review", label: "Review", color: "#8b5cf6" },
        { id: "opt-blocked", label: "Blocked", color: "#ef4444" },
        { id: "opt-done", label: "Done", color: "#22c55e" },
      ] }),
      createColumn("production", "production-assigned-to", "assigned_to", "Assigned To", "person", 1, "Unassigned"),
      createColumn("production", "production-due-date", "due_date", "Due Date", "date", 2, null),
      createColumn("production", "production-job-type", "job_type", "Job Type", "dropdown", 3, "", { options: [
        { id: "opt-retouching", label: "Retouching" },
        { id: "opt-compositing", label: "Compositing" },
        { id: "opt-color-grade", label: "Color Grade" },
        { id: "opt-delivery", label: "Delivery" },
      ] }),
      createColumn("production", "production-priority", "priority", "Priority", "priority", 4, "Medium", { options: [
        { id: "opt-low", label: "Low" },
        { id: "opt-medium", label: "Medium" },
        { id: "opt-high", label: "High" },
        { id: "opt-critical", label: "Critical" },
      ] }),
    ],
    records: [
      createRecord({ id: "production", organizationId: "org-main", workspaceId: "ws-main", slug: "production", name: "Production", description: "Live production work", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "record-1", "Levis", 4),
      createRecord({ id: "production", organizationId: "org-main", workspaceId: "ws-main", slug: "production", name: "Production", description: "Live production work", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "record-2", "Wipro", 2),
      createRecord({ id: "production", organizationId: "org-main", workspaceId: "ws-main", slug: "production", name: "Production", description: "Live production work", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "record-3", "NSM", 1),
    ],
    cellValues: createCellEntries([
      ["record-1:production-status", "Done"],
      ["record-1:production-assigned-to", "Rujuta"],
      ["record-1:production-due-date", "2026-08-11"],
      ["record-1:production-job-type", "Retouching"],
      ["record-1:production-priority", "High"],
      ["record-2:production-status", "Review"],
      ["record-2:production-assigned-to", "Maya Chen"],
      ["record-2:production-due-date", "2026-08-18"],
      ["record-2:production-job-type", "Compositing"],
      ["record-2:production-priority", "Medium"],
      ["record-3:production-status", "In Progress"],
      ["record-3:production-assigned-to", "Alex Rivera"],
      ["record-3:production-due-date", "2026-08-25"],
      ["record-3:production-job-type", "Color Grade"],
      ["record-3:production-priority", "Critical"],
    ]),
    views: [
      createDefaultView("production", "org-main", "ws-main", "table", 0),
      createDefaultView("production", "org-main", "ws-main", "kanban", 1),
      createDefaultView("production", "org-main", "ws-main", "calendar", 2),
      createDefaultView("production", "org-main", "ws-main", "timeline", 3),
    ],
    groups: [createGroup("production", "org-main", "ws-main", "All Tasks", 0)],
  },
  analytics: {
    board: {
      id: "analytics",
      organizationId: "org-main",
      workspaceId: "ws-main",
      slug: "analytics",
      name: "Analytics Studio",
      description: "Performance and operational analytics",
      icon: undefined,
      favorite: false,
      pinned: false,
      visibility: "workspace",
      status: "active",
      sharedWith: ["owner", "editor", "viewer"],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    description: "Track backlog reduction, throughput, and delivery health across the studio.",
    metrics: [
      { label: "Backlog Burned", value: "18", detail: "+6 this week" },
      { label: "On-Time Delivery", value: "92%", detail: "+3 pts" },
      { label: "Blocked Items", value: "4", detail: "2 require review" },
    ],
    columns: [
      createColumn("analytics", "analytics-metric", "metric", "Metric", "text", 0, ""),
      createColumn("analytics", "analytics-value", "value", "Value", "number", 1, 0),
      createColumn("analytics", "analytics-trend", "trend", "Trend", "progress", 2, 0, { min: 0, max: 100 }),
    ],
    records: [
      createRecord({ id: "analytics", organizationId: "org-main", workspaceId: "ws-main", slug: "analytics", name: "Analytics Studio", description: "Performance and operational analytics", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "analytics-1", "Delivery Health", 3),
      createRecord({ id: "analytics", organizationId: "org-main", workspaceId: "ws-main", slug: "analytics", name: "Analytics Studio", description: "Performance and operational analytics", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "analytics-2", "Queue Velocity", 2),
      createRecord({ id: "analytics", organizationId: "org-main", workspaceId: "ws-main", slug: "analytics", name: "Analytics Studio", description: "Performance and operational analytics", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "analytics-3", "Backlog Reduction", 5),
    ],
    cellValues: createCellEntries([
      ["analytics-1:analytics-metric", "Delivery Health"],
      ["analytics-1:analytics-value", 92],
      ["analytics-1:analytics-trend", 92],
      ["analytics-2:analytics-metric", "Queue Velocity"],
      ["analytics-2:analytics-value", 18],
      ["analytics-2:analytics-trend", 68],
      ["analytics-3:analytics-metric", "Backlog Reduction"],
      ["analytics-3:analytics-value", 24],
      ["analytics-3:analytics-trend", 81],
    ]),
    views: [
      createDefaultView("analytics", "org-main", "ws-main", "dashboard", 0),
      createDefaultView("analytics", "org-main", "ws-main", "chart", 1),
      createDefaultView("analytics", "org-main", "ws-main", "table", 2),
    ],
    groups: [createGroup("analytics", "org-main", "ws-main", "All Tasks", 0)],
  },
  cgi: {
    board: {
      id: "cgi",
      organizationId: "org-main",
      workspaceId: "ws-main",
      slug: "cgi",
      name: "CGI",
      description: "3D and motion graphics board",
      icon: undefined,
      favorite: false,
      pinned: false,
      visibility: "workspace",
      status: "active",
      sharedWith: ["owner", "editor", "viewer"],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    description: "Track shots, render readiness, and final approval for CGI delivery.",
    metrics: [
      { label: "Renders Pending", value: "11" },
      { label: "Scenes Approved", value: "7" },
      { label: "Shot Revisions", value: "3" },
    ],
    columns: [
      createColumn("cgi", "cgi-shot", "shot", "Shot", "text", 0, ""),
      createColumn("cgi", "cgi-status", "status", "Status", "status", 1, "Queued", { options: [
        { id: "opt-queued", label: "Queued", color: "#94a3b8" },
        { id: "opt-rendering", label: "Rendering", color: "#3b82f6" },
        { id: "opt-review", label: "Review", color: "#f59e0b" },
        { id: "opt-approved", label: "Approved", color: "#22c55e" },
      ] }),
      createColumn("cgi", "cgi-assignee", "assignee", "Assignee", "person", 2, "Unassigned"),
      createColumn("cgi", "cgi-priority", "priority", "Priority", "priority", 3, "Medium", { options: [
        { id: "opt-low", label: "Low" },
        { id: "opt-medium", label: "Medium" },
        { id: "opt-high", label: "High" },
        { id: "opt-critical", label: "Critical" },
      ] }),
    ],
    records: [
      createRecord({ id: "cgi", organizationId: "org-main", workspaceId: "ws-main", slug: "cgi", name: "CGI", description: "3D and motion graphics board", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "cgi-1", "Trailer hero shot", 2),
      createRecord({ id: "cgi", organizationId: "org-main", workspaceId: "ws-main", slug: "cgi", name: "CGI", description: "3D and motion graphics board", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "cgi-2", "Environment matte", 4),
    ],
    cellValues: createCellEntries([
      ["cgi-1:cgi-shot", "Trailer hero shot"],
      ["cgi-1:cgi-status", "Rendering"],
      ["cgi-1:cgi-assignee", "Nina"],
      ["cgi-1:cgi-priority", "High"],
      ["cgi-2:cgi-shot", "Environment matte"],
      ["cgi-2:cgi-status", "Review"],
      ["cgi-2:cgi-assignee", "Omar"],
      ["cgi-2:cgi-priority", "Critical"],
    ]),
    views: [
      createDefaultView("cgi", "org-main", "ws-main", "table", 0),
      createDefaultView("cgi", "org-main", "ws-main", "gallery", 1),
      createDefaultView("cgi", "org-main", "ws-main", "chart", 2),
    ],
    groups: [createGroup("cgi", "org-main", "ws-main", "All Tasks", 0)],
  },
  retouching: {
    board: {
      id: "retouching",
      organizationId: "org-main",
      workspaceId: "ws-main",
      slug: "retouching",
      name: "Retouching",
      description: "Image finishing workflow",
      icon: undefined,
      favorite: false,
      pinned: false,
      visibility: "workspace",
      status: "active",
      sharedWith: ["owner", "editor", "viewer"],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    description: "Coordinate finishing passes, client review, and final export.",
    metrics: [
      { label: "In Retouch", value: "14" },
      { label: "Awaiting QC", value: "6" },
      { label: "Client Revisions", value: "3" },
    ],
    columns: [
      createColumn("retouching", "retouch-item", "item", "Item", "text", 0, ""),
      createColumn("retouching", "retouch-status", "status", "Status", "status", 1, "Queued", { options: [
        { id: "opt-queued", label: "Queued", color: "#94a3b8" },
        { id: "opt-retouching", label: "Retouching", color: "#3b82f6" },
        { id: "opt-qc", label: "QC", color: "#f59e0b" },
        { id: "opt-approved", label: "Approved", color: "#22c55e" },
      ] }),
      createColumn("retouching", "retouch-artist", "artist", "Artist", "person", 2, "Unassigned"),
      createColumn("retouching", "retouch-priority", "priority", "Priority", "priority", 3, "Medium", { options: [
        { id: "opt-low", label: "Low" },
        { id: "opt-medium", label: "Medium" },
        { id: "opt-high", label: "High" },
        { id: "opt-critical", label: "Critical" },
      ] }),
    ],
    records: [
      createRecord({ id: "retouching", organizationId: "org-main", workspaceId: "ws-main", slug: "retouching", name: "Retouching", description: "Image finishing workflow", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "retouch-1", "Campaign hero image", 5),
      createRecord({ id: "retouching", organizationId: "org-main", workspaceId: "ws-main", slug: "retouching", name: "Retouching", description: "Image finishing workflow", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "retouch-2", "Lifestyle composite", 2),
    ],
    cellValues: createCellEntries([
      ["retouch-1:retouch-item", "Campaign hero image"],
      ["retouch-1:retouch-status", "Retouching"],
      ["retouch-1:retouch-artist", "Mina"],
      ["retouch-1:retouch-priority", "High"],
      ["retouch-2:retouch-item", "Lifestyle composite"],
      ["retouch-2:retouch-status", "QC"],
      ["retouch-2:retouch-artist", "Leo"],
      ["retouch-2:retouch-priority", "Medium"],
    ]),
    views: [
      createDefaultView("retouching", "org-main", "ws-main", "table", 0),
      createDefaultView("retouching", "org-main", "ws-main", "form", 1),
      createDefaultView("retouching", "org-main", "ws-main", "gallery", 2),
    ],
    groups: [createGroup("retouching", "org-main", "ws-main", "All Tasks", 0)],
  },
  settings: {
    board: {
      id: "settings",
      organizationId: "org-main",
      workspaceId: "ws-main",
      slug: "settings",
      name: "Settings",
      description: "Workspace configuration and permissions",
      icon: undefined,
      favorite: false,
      pinned: false,
      visibility: "workspace",
      status: "active",
      sharedWith: ["owner", "editor", "viewer"],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    description: "Review workspace policy, security, and integration settings.",
    metrics: [
      { label: "Admins", value: "3" },
      { label: "Active Integrations", value: "6" },
      { label: "Pending Changes", value: "2" },
    ],
    columns: [
      createColumn("settings", "setting-area", "area", "Area", "text", 0, ""),
      createColumn("settings", "setting-status", "status", "Status", "status", 1, "Active", { options: [
        { id: "opt-active", label: "Active", color: "#22c55e" },
        { id: "opt-review", label: "Review", color: "#f59e0b" },
        { id: "opt-needs-attention", label: "Needs Attention", color: "#ef4444" },
      ] }),
      createColumn("settings", "setting-owner", "owner", "Owner", "person", 2, "System"),
      createColumn("settings", "setting-updated", "updated", "Updated", "date", 3, null),
    ],
    records: [
      createRecord({ id: "settings", organizationId: "org-main", workspaceId: "ws-main", slug: "settings", name: "Settings", description: "Workspace configuration and permissions", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "settings-1", "Permissions", 4),
      createRecord({ id: "settings", organizationId: "org-main", workspaceId: "ws-main", slug: "settings", name: "Settings", description: "Workspace configuration and permissions", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "settings-2", "Billing", 1),
    ],
    cellValues: createCellEntries([
      ["settings-1:setting-area", "Permissions"],
      ["settings-1:setting-status", "Review"],
      ["settings-1:setting-owner", "Ops"],
      ["settings-1:setting-updated", "2026-07-27"],
      ["settings-2:setting-area", "Billing"],
      ["settings-2:setting-status", "Active"],
      ["settings-2:setting-owner", "Finance"],
      ["settings-2:setting-updated", "2026-07-26"],
    ]),
    views: [
      createDefaultView("settings", "org-main", "ws-main", "docs", 0),
    ],
    groups: [createGroup("settings", "org-main", "ws-main", "All Tasks", 0)],
  },
  video: {
    board: {
      id: "video",
      organizationId: "org-main",
      workspaceId: "ws-main",
      slug: "video",
      name: "Video",
      description: "Video production board",
      icon: undefined,
      favorite: false,
      pinned: false,
      visibility: "workspace",
      status: "active",
      sharedWith: ["owner", "editor", "viewer"],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    description: "Track edits, reviews, and delivery for video projects.",
    metrics: [
      { label: "Active Cuts", value: "8" },
      { label: "Awaiting Review", value: "4" },
      { label: "Ready to Deliver", value: "2" },
    ],
    columns: [
      createColumn("video", "video-title", "title", "Title", "text", 0, ""),
      createColumn("video", "video-status", "status", "Status", "status", 1, "Queued", { options: [
        { id: "opt-queued", label: "Queued", color: "#94a3b8" },
        { id: "opt-editing", label: "Editing", color: "#3b82f6" },
        { id: "opt-review", label: "Review", color: "#f59e0b" },
        { id: "opt-approved", label: "Approved", color: "#22c55e" },
      ] }),
      createColumn("video", "video-editor", "editor", "Editor", "person", 2, "Unassigned"),
      createColumn("video", "video-asset", "asset", "Asset", "files", 3, []),
    ],
    records: [
      createRecord({ id: "video", organizationId: "org-main", workspaceId: "ws-main", slug: "video", name: "Video", description: "Video production board", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "video-1", "Launch trailer", 3),
      createRecord({ id: "video", organizationId: "org-main", workspaceId: "ws-main", slug: "video", name: "Video", description: "Video production board", favorite: false, pinned: false, visibility: "workspace", status: "active", sharedWith: ["owner", "editor", "viewer"], createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }, "video-2", "Social cutdown", 1),
    ],
    cellValues: createCellEntries([
      ["video-1:video-title", "Launch trailer"],
      ["video-1:video-status", "Editing"],
      ["video-1:video-editor", "Maya"],
      ["video-1:video-asset", ["trailer-v1.mov"]],
      ["video-2:video-title", "Social cutdown"],
      ["video-2:video-status", "Review"],
      ["video-2:video-editor", "Jordan"],
      ["video-2:video-asset", ["social-cutdown-v3.mp4"]],
    ]),
    views: [
      createDefaultView("video", "org-main", "ws-main", "table", 0),
      createDefaultView("video", "org-main", "ws-main", "gallery", 1),
      createDefaultView("video", "org-main", "ws-main", "timeline", 2),
    ],
    groups: [createGroup("video", "org-main", "ws-main", "All Tasks", 0)],
  },
};

export function getDemoBoardPageData(boardId: string): DemoBoardPageData | undefined {
  return demoBoardPageData[boardId];
}

export interface DashboardKpi {
  id: string;
  label: string;
  value: number;
  trend: string;
  trendDirection: "up" | "down";
  statusColor: string;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  type: "approval" | "qc" | "po" | "invoice";
}

export interface DashboardDeadline {
  id: string;
  task: string;
  due: string;
  priority: "high" | "medium" | "low";
}

export interface DashboardWorkloadItem {
  department: string;
  active: number;
  total: number;
}



export const dashboardActivity: DashboardActivityItem[] = [
  { id: "1", action: "Batch #B-024 approved", user: "Sarah", timestamp: "2 min ago", type: "approval" },
  { id: "2", action: "New QC pass for CGI-017", user: "Mike", timestamp: "15 min ago", type: "qc" },
  { id: "3", action: "PO received for Production batch", user: "System", timestamp: "1 hr ago", type: "po" },
  { id: "4", action: "Invoice #INV-042 raised", user: "Lisa", timestamp: "2 hr ago", type: "invoice" },
  { id: "5", action: "Retouching batch R-112 moved to Approved", user: "Alex", timestamp: "3 hr ago", type: "approval" },
];

export const dashboardDeadlines: DashboardDeadline[] = [
  { id: "1", task: "CGI render — Campaign A", due: "Today", priority: "high" },
  { id: "2", task: "Video rough cut review", due: "Tomorrow", priority: "medium" },
  { id: "3", task: "PO submission — Production batch #4", due: "In 3 days", priority: "medium" },
  { id: "4", task: "Invoice approval — Retouching Q1", due: "In 5 days", priority: "low" },
];

export const dashboardWorkload: DashboardWorkloadItem[] = [
  { department: "Production", active: 12, total: 18 },
  { department: "CGI", active: 5, total: 8 },
  { department: "Video", active: 7, total: 10 },
  { department: "Retouching", active: 14, total: 20 },
  { department: "QC", active: 4, total: 6 },
];

