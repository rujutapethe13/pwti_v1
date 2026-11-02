/**
 * Automations & Triggers System Data Model
 * Modeled after monday.com's automation center with plain-language sentence recipes.
 */

export type PaymentTerms =
  | "Immediate"
  | "15 days"
  | "30 days"
  | "45 days"
  | "Custom";

export type PaymentStatus = "Unpaid" | "Partially paid" | "Paid";

export interface PaymentJobItem {
  id: string;
  jobTitle: string;
  clientId: string;
  clientName: string;
  boardId: string;
  boardName: string;
  amount: number;
  paidAmount?: number;
  jobBookedDate: string; // ISO date YYYY-MM-DD
  paymentTerms: PaymentTerms;
  customPaymentDays?: number;
  paymentDueDate: string; // auto-calculated: booked date + terms
  paymentStatus: PaymentStatus;
  assignee: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  boardOwner: {
    id: string;
    name: string;
    email: string;
  };
  daysOverdue?: number;
  paidAt?: string;
  overdueAlertFired?: boolean;
  overdueAlertFiredAt?: string;
  overdueAlertResolved?: boolean;
  resolvedAt?: string;
}

export type AutomationCategory =
  | "Featured"
  | "Status & Movement"
  | "Due Dates & Overdue"
  | "Notifications & Team"
  | "Billing & Payments"
  | "Custom";

export type TriggerType =
  | "column_change"
  | "status_change"
  | "item_created"
  | "item_moved_group"
  | "item_archived_deleted"
  | "person_assigned"
  | "date_arrives"
  | "recurring_schedule"
  | "subitem_event"
  | "comment_posted"
  | "button_clicked"
  | "dependency_change"
  | "date_inputted"
  | "payment_overdue"; // Custom built-in trigger

export interface TriggerDefinition {
  type: TriggerType;
  label: string;
  columnId?: string;
  columnName?: string;
  fromValue?: string;
  toValue?: string;
  dateField?: string;
  timing?: string; // e.g. "is_inputted", "on_date", "1_day_before"
  daysOffset?: number; // negative for before, positive for after
  scheduleCadence?: "daily" | "weekly" | "monthly";
  scheduleTime?: string;
  paymentOverdueSettings?: {
    gracePeriodDays?: number;
    repeatReminderDays?: number;
    escalateDays?: number;
  };
}

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

export interface AutomationCondition {
  id: string;
  columnId: string;
  columnName: string;
  operator: ConditionOperator;
  value: string;
  logicalOperator?: "AND" | "OR"; // For grouping multiple conditions
}

export type ActionType =
  | "send_email"
  | "send_notification"
  | "change_status"
  | "assign_person"
  | "set_date"
  | "create_item"
  | "move_item"
  | "post_update"
  | "create_task"
  | "call_webhook";

export interface AutomationAction {
  id: string;
  type: ActionType;
  label: string;
  targetColumnId?: string;
  targetColumnName?: string;
  targetValue?: string;
  recipientRole?: "top_admins" | "board_owner" | "assignee" | "custom_email" | "client_contact";
  customEmail?: string;
  emailSubjectTemplate?: string;
  emailBodyTemplate?: string;
  notificationMessage?: string;
  webhookUrl?: string;
  dateShiftDays?: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  category: AutomationCategory;
  boardId?: string;
  boardName?: string;
  enabled: boolean;
  isBuiltIn?: boolean;
  owner: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
  trigger: TriggerDefinition;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  safeguards: {
    maxDailyRuns: number;
    dailyRunsCount: number;
    dryRun: boolean;
    loopPreventionKey: string;
  };
  paymentOverdueConfig?: {
    gracePeriodDays: number;
    repeatReminderDays: number;
    escalateDays: number;
    timezone: string;
    topAdminEmails: string[];
    includeBoardOwner: boolean;
    includeAssignee: boolean;
    emailSubject: string;
    emailBody: string;
  };
}

export type AutomationRunStatus = "success" | "warning" | "error" | "skipped";

export interface AutomationRunLog {
  id: string;
  automationId: string;
  automationName: string;
  boardName: string;
  itemId: string;
  itemName: string;
  triggeredAt: string;
  triggerReason: string;
  status: AutomationRunStatus;
  latencyMs: number;
  details: {
    recipientsSent?: string[];
    warnings?: string[];
    actionsExecuted?: string[];
    mergeValues?: Record<string, string>;
    errorMessage?: string;
  };
}

export interface AutomationTemplate {
  id: string;
  title: string;
  description: string;
  category: AutomationCategory;
  popular?: boolean;
  trigger: TriggerDefinition;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  sentenceParts: {
    triggerText: string;
    conditionText?: string;
    actionText: string;
  };
}

export interface WorkspaceAdminUser {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarUrl?: string;
  isPinned?: boolean;
}

export type AutomationAuditLog = AutomationRunLog;
