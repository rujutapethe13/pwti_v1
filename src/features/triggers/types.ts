/**
 * Custom Trigger System data model.
 *
 * One trigger record can apply to all or selected boards/workspaces, evaluates
 * conditions over board items, and runs a list of actions (email first, more
 * action types can be added without redesign).
 */

export type TriggerScopeMode = "all" | "selected";
export type TriggerRunMode = "manual" | "automatic" | "both";
export type EmailFormat = "per_item" | "summary";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "is_before"
  | "is_after"
  | "greater_than"
  | "less_than";

export interface TriggerCondition {
  id: string;
  columnId?: string;
  columnName: string;
  operator: ConditionOperator;
  value: string;
}

export interface TriggerConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: (TriggerCondition | TriggerConditionGroup)[];
}

export type ActionType = "send_email";

export interface TriggerActionConfig {
  // send_email config
  subject?: string;
  body?: string;
  toType?: "static" | "field";
  to?: string[];
  toField?: string;
  cc?: string[];
}

export interface TriggerAction {
  id: string;
  type: ActionType;
  enabled: boolean;
  label: string;
  config: TriggerActionConfig;
}

export interface TriggerEmailSettings {
  enabled: boolean;
  toType: "static" | "field";
  to: string[];
  toField: string;
  cc: string[];
  subject: string;
  body: string;
  format: EmailFormat;
  frequencyHours: number;
}

export interface Trigger {
  id: string;
  organizationId?: string;
  workspaceId?: string;
  name: string;
  description: string;
  enabled: boolean;
  scopeMode: TriggerScopeMode;
  scopeWorkspaces: string[];
  scopeBoards: string[];
  runMode: TriggerRunMode;
  conditions: TriggerConditionGroup;
  actions: TriggerAction[];
  emailSettings: TriggerEmailSettings;
  lastRunAt?: string;
  runCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerLog {
  id: string;
  triggerId: string;
  boardId?: string;
  startedBy: string;
  runMode: TriggerRunMode;
  matchedCount: number;
  emailedCount: number;
  failedCount: number;
  skippedCount: number;
  status: "ok" | "partial" | "failed";
  error?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface TriggerItemAlert {
  id: string;
  triggerId: string;
  recordId: string;
  boardId: string;
  lastAlertedAt: string;
  alertCount: number;
}

export interface RunTriggerResult {
  triggerId: string;
  matched: number;
  sent: number;
  failed: number;
  skipped: number;
  status: "ok" | "partial" | "failed";
  error?: string;
  items: Array<{
    recordId: string;
    boardId: string;
    boardName: string;
    title: string;
    sent: boolean;
    skipped: boolean;
    error?: string;
  }>;
}

export interface CheckChangeTriggerInput {
  boardId: string;
  recordId: string;
  boardName: string;
  columnId?: string;
  columnName?: string;
  oldValue: unknown;
  newValue: unknown;
  startedBy: string;
}

export interface ResolvedRecipient {
  email: string;
  label?: string;
}
