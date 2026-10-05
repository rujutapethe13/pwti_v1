export interface DatabaseTableDefinition {
  name: string;
  scope: "organization" | "workspace" | "board" | "global";
  primaryKey: string;
  scopedBy: string[];
  description: string;
}

export const databaseSchema: DatabaseTableDefinition[] = [
  { name: "organizations", scope: "organization", primaryKey: "id", scopedBy: [], description: "Top-level tenant entity." },
  { name: "subscriptions", scope: "organization", primaryKey: "id", scopedBy: ["organization_id"], description: "Plan and limit enforcement." },
  { name: "workspaces", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id"], description: "Workspace container within an organization." },
  { name: "memberships", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "User membership and tenant role links." },
  { name: "users", scope: "global", primaryKey: "id", scopedBy: [], description: "Global user directory." },
  { name: "boards", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "Metadata-driven boards." },
  { name: "board_templates", scope: "global", primaryKey: "id", scopedBy: [], description: "Reusable board templates with seed schema." },
  { name: "groups", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Hierarchical board groups." },
  { name: "columns", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Column definitions and metadata." },
  { name: "column_permissions", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "column_id"], description: "Role-based field permissions." },
  { name: "column_dependencies", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Dependency graph for formulas and references." },
  { name: "column_definition_history", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "column_id"], description: "Version history for column definitions." },
  { name: "records", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Generic records on a board." },
  { name: "cell_values", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "record_id", "column_id"], description: "EAV-shaped cell values." },
  { name: "views", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Board view metadata." },
  { name: "comments", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "record_id"], description: "Record discussions." },
  { name: "attachments", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "record_id"], description: "Signed-url backed attachments." },
  { name: "notifications", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "Notification stream." },
  { name: "activity_logs", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "Structured mutation logging." },
  { name: "permissions", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "Org, workspace, board, and column overrides." },
  { name: "connected_boards", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Connected board relationships." },
  { name: "mirror_fields", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Mirror / lookup / rollup fields." },
  { name: "automations", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id"], description: "Automation definitions." },
  { name: "automation_actions", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "automation_id"], description: "Automation action graph." },
  { name: "automation_runs", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "automation_id"], description: "Automation execution logs." },
  { name: "webhooks", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "Outbound event webhooks." },
  { name: "api_keys", scope: "workspace", primaryKey: "id", scopedBy: ["organization_id", "workspace_id"], description: "Workspace and org scoped API keys." },
  { name: "search_index", scope: "board", primaryKey: "id", scopedBy: ["organization_id", "workspace_id", "board_id", "record_id"], description: "Denormalized search text for indexed queries." },
  { name: "sessions", scope: "global", primaryKey: "id", scopedBy: [], description: "User sessions and collaboration presence." },
];
