"use client";

import * as React from "react";
import type { ColumnDefinition } from "@/features/boards/engine/types";
import {
  Sparkles,
  Zap,
  Play,
  Clock,
  History,
  Settings,
  Plus,
  Trash2,
  Copy,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Search,
  Filter,
  Mail,
  Send,
  Eye,
  ChevronRight,
  Shield,
  Layers,
  Calendar,
  DollarSign,
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  RefreshCw,
  Bell,
  Users,
  ExternalLink,
  Info,
  Folder,
  User,
  Tag,
  MessageSquare,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  AutomationRule,
  AutomationTemplate,
  AutomationRunLog,
  AutomationCategory,
  PaymentJobItem,
  WorkspaceAdminUser,
  TriggerType,
  ActionType,
  ConditionOperator,
} from "./types";
import {
  MOCK_AUTOMATION_TEMPLATES,
  INITIAL_AUTOMATION_RULES,
  MOCK_AUTOMATION_RUN_LOGS,
  MOCK_PAYMENT_JOBS,
} from "./automation-mock-data";
import {
  DEFAULT_WORKSPACE_ADMINS,
  DEFAULT_OVERDUE_EMAIL_SUBJECT,
  DEFAULT_OVERDUE_EMAIL_BODY,
  interpolateMergeFields,
  resolveOverdueRecipients,
} from "./payment-overdue-service";
import { executeAutomationRule } from "./automation-engine";
import { applyAutomationToBoard } from "./actions";
import {
  getBoardAutomations,
  saveBoardAutomations,
  toggleBoardAutomation,
  upsertBoardAutomation,
  deleteBoardAutomation,
  getAutomationLogs,
  recordAutomationLog,
} from "./automation-storage";

export interface BuilderConditionItem {
  id: string;
  column: string;
  op: ConditionOperator;
  value: string;
  logic: "AND" | "OR";
}

export interface BuilderActionItem {
  id: string;
  type: ActionType;
  label: string;
  targetColumn?: string;
  targetValue: string;
  recipientRole?: string;
  notificationMessage?: string;
  webhookUrl?: string;
}

const STATUS_COLUMNS = ["Status", "Payment Status", "Priority", "Review Status"];

const STATUS_VALUES_BY_COLUMN: Record<string, string[]> = {
  Status: ["Done", "In Progress", "At Risk", "Client Review", "Ready for Shoot", "Uploaded", "Archived"],
  "Payment Status": ["Paid", "Unpaid", "Partially paid", "Overdue"],
  Priority: ["Urgent", "High", "Medium", "Low"],
  "Review Status": ["Approved", "Pending Feedback", "Changes Requested"],
};

const DATE_COLUMNS = ["Date of Upload", "Receive Date", "Inward Date", "Due Date", "Payment Due Date"];

const DATE_TIMING_OPTIONS = [
  { value: "is_inputted", label: "is inputted in the data" },
  { value: "on_date", label: "On the date" },
  { value: "1_day_before", label: "1 day before" },
  { value: "2_days_before", label: "2 days before" },
  { value: "3_days_before", label: "3 days before" },
  { value: "1_day_after", label: "1 day after" },
  { value: "7_days_after", label: "7 days after" },
];

const CONDITION_COLUMNS = [
  "Status",
  "Payment Status",
  "Amount",
  "Priority",
  "Days Overdue",
  "Client Name",
  "Board Name",
];

const CONDITION_OPERATORS: Array<{ value: ConditionOperator; label: string; symbol: string }> = [
  { value: "equals", label: "equals", symbol: "=" },
  { value: "not_equals", label: "not equals", symbol: "≠" },
  { value: "contains", label: "contains", symbol: "∋" },
  { value: "not_contains", label: "does not contain", symbol: "∌" },
  { value: "greater_than", label: "greater than", symbol: ">" },
  { value: "less_than", label: "less than", symbol: "<" },
  { value: "is_empty", label: "is empty", symbol: "∅" },
  { value: "is_not_empty", label: "is not empty", symbol: "∃" },
];

const ACTION_TYPE_OPTIONS: Array<{ type: ActionType; label: string }> = [
  { type: "change_status", label: "Change status to" },
  { type: "move_item", label: "Move item to group" },
  { type: "assign_person", label: "Assign person" },
  { type: "send_email", label: "Send email" },
  { type: "send_notification", label: "Send in-app notification" },
  { type: "set_date", label: "Set date to" },
  { type: "post_update", label: "Post update on item" },
  { type: "create_task", label: "Create follow-up task" },
  { type: "call_webhook", label: "Call webhook" },
];

const GROUP_OPTIONS = [
  "Completed",
  "Active Production",
  "October (Group Title)",
  "Client Review",
  "Backlog",
  "Archive",
];

const ASSIGNEE_OPTIONS = [
  "Rujuta Pethe",
  "Studio Lead",
  "Board Owner",
  "Top 3 Workspace Admins",
  "Current User",
];

const EMAIL_RECIPIENT_OPTIONS = [
  "Top 3 Admins, Board Owner & Assignee",
  "Assigned Person Only",
  "Board Owner Only",
  "Top 3 Admins Only",
  "Client Billing Contact",
];

const NOTIFICATION_TARGETS = [
  "Board Channel",
  "Assigned Person",
  "Studio Lead",
];

const DATE_SET_OPTIONS = [
  "Today",
  "Today + 3 days",
  "Today + 7 days",
  "Today + 14 days",
  "Date of Upload",
];

export interface AutomationCenterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId?: string;
  boardName?: string;
  columns?: ColumnDefinition[];
  groups?: any[];
  initialTab?: "templates" | "my-automations" | "builder" | "logs" | "overdue-settings";
  onAutomationsChanged?: () => void;
}

export function AutomationCenterModal({
  open,
  onOpenChange,
  boardId = "board-october-2026",
  boardName = "October 2026",
  columns,
  groups,
  initialTab = "my-automations",
  onAutomationsChanged,
}: AutomationCenterModalProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = React.useState<
    "templates" | "my-automations" | "builder" | "logs" | "overdue-settings"
  >(initialTab);

  React.useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // State: Rules
  const [rules, setRules] = React.useState<AutomationRule[]>(() =>
    getBoardAutomations(boardId || "default")
  );
  // State: Logs
  const [logs, setLogs] = React.useState<AutomationRunLog[]>(MOCK_AUTOMATION_RUN_LOGS);

  // Sync stored rules and logs when modal opens
  React.useEffect(() => {
    if (open) {
      const storedRules = getBoardAutomations(boardId || "default");
      setRules(storedRules);
      const storedLogs = getAutomationLogs(boardId || "default");
      if (storedLogs.length > 0) {
        setLogs([...(storedLogs as any[]), ...MOCK_AUTOMATION_RUN_LOGS]);
      }
    }
  }, [open, boardId]);

  // Listen to external automation updates (from board or other tabs)
  React.useEffect(() => {
    const handleUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.boardId || detail.boardId === boardId) {
        setRules(getBoardAutomations(boardId || "default"));
      }
    };
    window.addEventListener("automations:updated", handleUpdated);
    return () => window.removeEventListener("automations:updated", handleUpdated);
  }, [boardId]);
  // State: Jobs for testing
  const [jobs, setJobs] = React.useState<PaymentJobItem[]>(MOCK_PAYMENT_JOBS);


  // Dynamic columns and groups from live board
  const actualDateColumns = React.useMemo(() => {
    if (columns && columns.length > 0) {
      const dates = columns.filter((c) => c.type === "date").map((c) => c.label || c.key);
      if (dates.length > 0) return dates;
    }
    return DATE_COLUMNS;
  }, [columns]);

  const actualStatusColumns = React.useMemo(() => {
    if (columns && columns.length > 0) {
      const statuses = columns
        .filter((c) => c.type === "status" || c.type === "dropdown")
        .map((c) => c.label || c.key);
      if (statuses.length > 0) return statuses;
    }
    return STATUS_COLUMNS;
  }, [columns]);

  const actualGroups = React.useMemo(() => {
    if (groups && groups.length > 0) {
      const grpNames = groups.map((g) => g.name).filter(Boolean);
      if (grpNames.length > 0) return grpNames;
    }
    return ["Completed", "Done", "In Production", "Backlog"];
  }, [groups]);

  // 1-Click direct install of recipe on board
  const handleQuickAddTemplate = (template: AutomationTemplate) => {
    let triggerColName = template.trigger.columnName || "Date of Upload";
    if (template.trigger.type === "date_inputted" || template.trigger.type === "date_arrives") {
      const foundDate = actualDateColumns.find(
        (c) => c.toLowerCase().includes("upload") || c.toLowerCase().includes("date")
      );
      if (foundDate) triggerColName = foundDate;
    }

    let actionColName = "Status";
    const foundStatus = actualStatusColumns.find(
      (c) => c.toLowerCase().includes("status") || c.toLowerCase() === "tat"
    );
    if (foundStatus) actionColName = foundStatus;

    const newRule: AutomationRule = {
      id: `rule-${template.id}-${Date.now()}`,
      name: template.title,
      description: template.description,
      category: template.category,
      boardId: boardId || "default",
      boardName: boardName || "Current Board",
      enabled: true,
      owner: {
        id: "usr-current",
        name: "Rujuta Pethe",
        email: "rujutapethe@gmail.com",
      },
      createdAt: new Date().toISOString(),
      runCount: 0,
      trigger: {
        ...template.trigger,
        columnName: triggerColName,
      },
      conditions: template.conditions || [],
      actions: template.actions.map((a) => ({
        ...a,
        targetColumnName: a.targetColumnName || actionColName,
      })),
      safeguards: {
        maxDailyRuns: 1000,
        dailyRunsCount: 0,
        dryRun: false,
        loopPreventionKey: `lock-${Date.now()}`,
      },
    };

    const updated = upsertBoardAutomation(boardId || "default", newRule);
    setRules(updated);
    toast.success(`⚡ Added to ${boardName}: "${newRule.name}"`, {
      description: "Automation is now active. Any matching edits will apply automatically.",
    });
    onAutomationsChanged?.();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("board:run-automations"));
    }
  };

  // Template Search & Category Filter
  const [templateSearch, setTemplateSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("All");

  // Selected Log for detail modal / drawer
  const [selectedLog, setSelectedLog] = React.useState<AutomationRunLog | null>(null);

  // Overdue Settings state
  const [workspaceAdmins, setWorkspaceAdmins] = React.useState<WorkspaceAdminUser[]>(DEFAULT_WORKSPACE_ADMINS);
  const [gracePeriod, setGracePeriod] = React.useState(0);
  const [reminderCadence, setReminderCadence] = React.useState(7);
  const [escalationCadence, setEscalationCadence] = React.useState(14);
  const [includeOwner, setIncludeOwner] = React.useState(true);
  const [includeAssignee, setIncludeAssignee] = React.useState(true);
  const [overdueSubject, setOverdueSubject] = React.useState(DEFAULT_OVERDUE_EMAIL_SUBJECT);
  const [overdueBody, setOverdueBody] = React.useState(DEFAULT_OVERDUE_EMAIL_BODY);

  // Test Email Modal
  const [testEmailOpen, setTestEmailOpen] = React.useState(false);

  // Custom Builder State (monday.com plain-language recipe)
  const [builderTriggerType, setBuilderTriggerType] = React.useState<TriggerType>("date_arrives");
  const [builderTriggerLabel, setBuilderTriggerLabel] = React.useState("Date is inputted");
  const [builderTriggerColumn, setBuilderTriggerColumn] = React.useState("Date of Upload");
  const [builderTriggerValue, setBuilderTriggerValue] = React.useState("Done");
  const [builderTriggerTiming, setBuilderTriggerTiming] = React.useState("is_inputted");
  const [builderConditions, setBuilderConditions] = React.useState<BuilderConditionItem[]>([]);
  const [builderActions, setBuilderActions] = React.useState<BuilderActionItem[]>([
    {
      id: "a-1",
      type: "change_status",
      label: "Change Status to Done",
      targetColumn: "Status",
      targetValue: "Done",
    },
  ]);
  const [isTitleManual, setIsTitleManual] = React.useState(false);
  const [builderRuleName, setBuilderRuleName] = React.useState("When Date of Upload is inputted in the data, change Status to Done");
  const [builderDryRun, setBuilderDryRun] = React.useState(false);

  // Auto-sync builder title with recipe whenever tokens change, unless user typed a custom title
  React.useEffect(() => {
    if (!isTitleManual) {
      let whenPart = "";
      if (builderTriggerTiming === "is_inputted" || builderTriggerType === "date_inputted") {
        whenPart = `When ${builderTriggerColumn} is inputted in the data`;
      } else if (builderTriggerType === "date_arrives") {
        const timingLabel = DATE_TIMING_OPTIONS.find((t) => t.value === builderTriggerTiming)?.label ?? "On the date";
        whenPart = `When ${builderTriggerColumn} arrives (${timingLabel})`;
      } else if (builderTriggerType === "status_change") {
        whenPart = `When ${builderTriggerColumn} changes to ${builderTriggerValue}`;
      } else if (builderTriggerType === "payment_overdue") {
        whenPart = "When Payment is Overdue";
      } else {
        whenPart = `When ${builderTriggerLabel}`;
      }

      const firstAction = builderActions[0];
      let actionPart = "take action";
      if (firstAction) {
        if (firstAction.type === "change_status") {
          actionPart = `change ${firstAction.targetColumn || "Status"} to ${firstAction.targetValue || "Done"}`;
        } else if (firstAction.type === "move_item") {
          actionPart = `move item to ${firstAction.targetValue || "Completed"} group`;
        } else if (firstAction.type === "send_email") {
          actionPart = `send email to ${firstAction.targetValue || "Admins & Assignee"}`;
        } else if (firstAction.type === "send_notification") {
          actionPart = `send notification to ${firstAction.targetValue || "Board Channel"}`;
        } else {
          actionPart = firstAction.label.toLowerCase();
        }
      }

      setBuilderRuleName(`${whenPart}, ${actionPart}`);
    }
  }, [
    isTitleManual,
    builderTriggerType,
    builderTriggerLabel,
    builderTriggerColumn,
    builderTriggerValue,
    builderTriggerTiming,
    builderActions,
  ]);

  // Handlers for Builder Tokens
  const handleActionTypeChange = (actionId: string, newType: ActionType) => {
    setBuilderActions((prev) =>
      prev.map((a) => {
        if (a.id !== actionId) return a;
        if (newType === "change_status") {
          return {
            ...a,
            type: newType,
            targetColumn: "Status",
            targetValue: "Done",
            label: "Change Status to Done",
          };
        }
        if (newType === "move_item") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "Completed",
            label: "Move item to Completed group",
          };
        }
        if (newType === "assign_person") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "Rujuta Pethe", label: "Assign to Rujuta Pethe",
          };
        }
        if (newType === "send_email") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "Top 3 Admins, Board Owner & Assignee",
            recipientRole: "top_admins",
            label: "Send Overdue Alert Email",
          };
        }
        if (newType === "send_notification") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "Board Channel",
            label: "Send In-App Notification",
          };
        }
        if (newType === "set_date") {
          return {
            ...a,
            type: newType,
            targetColumn: "Due Date",
            targetValue: "Today",
            label: "Set Due Date to Today",
          };
        }
        if (newType === "post_update") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "Status updated automatically.",
            label: "Post update on item",
          };
        }
        if (newType === "create_task") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "Follow up with client",
            label: "Create follow-up task",
          };
        }
        if (newType === "call_webhook") {
          return {
            ...a,
            type: newType,
            targetColumn: undefined,
            targetValue: "https://api.powerweave.studio/hooks",
            label: "Call webhook",
          };
        }
        return { ...a, type: newType };
      })
    );
  };

  const handleActionColumnChange = (actionId: string, col: string) => {
    setBuilderActions((prev) =>
      prev.map((a) => {
        if (a.id !== actionId) return a;
        const availableValues = STATUS_VALUES_BY_COLUMN[col] || ["Done"];
        const nextVal = availableValues[0];
        return {
          ...a,
          targetColumn: col,
          targetValue: nextVal,
          label: `Change ${col} to ${nextVal}`,
        };
      })
    );
  };

  const handleActionTargetValueChange = (actionId: string, val: string) => {
    setBuilderActions((prev) =>
      prev.map((a) => {
        if (a.id !== actionId) return a;
        let newLabel = a.label;
        if (a.type === "change_status") {
          newLabel = `Change ${a.targetColumn || "Status"} to ${val}`;
        } else if (a.type === "move_item") {
          newLabel = `Move item to ${val} group`;
        } else if (a.type === "assign_person") {
          newLabel = `Assign to ${val}`;
        }
        return {
          ...a,
          targetValue: val,
          label: newLabel,
        };
      })
    );
  };

  const handleAddAction = () => {
    setBuilderActions((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        type: "change_status",
        label: "Change Status to Done",
        targetColumn: "Status",
        targetValue: "Done",
      },
    ]);
  };

  const handleConditionColumnChange = (condId: string, col: string) => {
    setBuilderConditions((prev) =>
      prev.map((c) => {
        if (c.id !== condId) return c;
        const defaultVal =
          col === "Status"
            ? "Done"
            : col === "Payment Status"
            ? "Paid"
            : col === "Priority"
            ? "Urgent"
            : col === "Amount"
            ? "10000"
            : col === "Days Overdue"
            ? "7"
            : "Safari";
        return { ...c, column: col, value: defaultVal };
      })
    );
  };

  const handleConditionOpChange = (condId: string, op: ConditionOperator) => {
    setBuilderConditions((prev) =>
      prev.map((c) => (c.id === condId ? { ...c, op } : c))
    );
  };

  const handleConditionValueChange = (condId: string, val: string) => {
    setBuilderConditions((prev) =>
      prev.map((c) => (c.id === condId ? { ...c, value: val } : c))
    );
  };

  const handleAddCondition = () => {
    setBuilderConditions((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        column: "Status",
        op: "equals",
        value: "Done",
        logic: "AND",
      },
    ]);
  };

  const recipeSentencePreview = React.useMemo(() => {
    let whenText = "";
    if (builderTriggerType === "payment_overdue") {
      whenText = "When Payment is Overdue";
    } else if (builderTriggerType === "status_change") {
      whenText = `When ${builderTriggerColumn} changes to ${builderTriggerValue}`;
    } else if (builderTriggerType === "date_arrives" || builderTriggerType === "date_inputted") {
      if (builderTriggerTiming === "is_inputted" || builderTriggerType === "date_inputted") {
        whenText = `When ${builderTriggerColumn} is inputted in the data`;
      } else {
        const timingLabel = DATE_TIMING_OPTIONS.find((t) => t.value === builderTriggerTiming)?.label ?? "On the date";
        whenText = `When ${builderTriggerColumn} arrives (${timingLabel})`;
      }
    } else if (builderTriggerType === "person_assigned") {
      whenText = `When Person is assigned`;
    } else if (builderTriggerType === "button_clicked") {
      whenText = `When Button is clicked`;
    } else {
      whenText = `When ${builderTriggerLabel}`;
    }

    let condText = "";
    if (builderConditions.length > 0) {
      condText =
        " and if " +
        builderConditions
          .map(
            (c, i) =>
              `${i > 0 ? ` ${c.logic} ` : ""}${c.column} ${c.op.replace("_", " ")} "${c.value}"`
          )
          .join("");
    }

    const actionText =
      " then " +
      builderActions
        .map((a) => {
          if (a.type === "change_status") {
            return `change ${a.targetColumn || "Status"} to ${a.targetValue || "Done"}`;
          }
          if (a.type === "move_item") {
            return `move item to ${a.targetValue || "Completed"} group`;
          }
          if (a.type === "assign_person") {
            return `assign to ${a.targetValue || "Rujuta Pethe"}`;
          }
          if (a.type === "send_email") {
            return `send email to ${a.targetValue || "Admins & Assignee"}`;
          }
          if (a.type === "send_notification") {
            return `send notification to ${a.targetValue || "Board Channel"}`;
          }
          if (a.type === "set_date") {
            return `set ${a.targetColumn || "Due Date"} to ${a.targetValue || "Today"}`;
          }
          return a.label || a.type;
        })
        .join(" and ");

    return `${whenText}${condText}${actionText}`;
  }, [
    builderTriggerType,
    builderTriggerColumn,
    builderTriggerValue,
    builderTriggerTiming,
    builderTriggerLabel,
    builderConditions,
    builderActions,
  ]);

  // Handlers
  const toggleRule = (ruleId: string) => {
    const target = rules.find((r) => r.id === ruleId);
    const next = !target?.enabled;
    const updated = toggleBoardAutomation(boardId || "default", ruleId, next);
    setRules(updated);
    toast.success(`Automation "${target?.name}" turned ${next ? "ON" : "OFF"}`);
    onAutomationsChanged?.();
  };

  const deleteRule = (ruleId: string) => {
    const target = rules.find((r) => r.id === ruleId);
    if (target?.isBuiltIn) {
      toast.error("Built-in system automations cannot be deleted. You can toggle them OFF instead.");
      return;
    }
    const updated = deleteBoardAutomation(boardId || "default", ruleId);
    setRules(updated);
    toast.success("Automation deleted");
    onAutomationsChanged?.();
  };

  const duplicateRule = (rule: AutomationRule) => {
    const clone: AutomationRule = {
      ...rule,
      id: `rule-copy-${Date.now()}`,
      name: `${rule.name} (Copy)`,
      isBuiltIn: false,
      runCount: 0,
      createdAt: new Date().toISOString(),
      lastRunAt: undefined,
    };
    const updated = upsertBoardAutomation(boardId || "default", clone);
    setRules(updated);
    toast.success("Automation cloned to board");
    onAutomationsChanged?.();
  };

  const handleEditRule = (rule: AutomationRule) => {
    setIsTitleManual(true);
    setBuilderRuleName(rule.name);
    setBuilderTriggerType(rule.trigger.type);
    setBuilderTriggerLabel(rule.trigger.label);
    setBuilderTriggerColumn(rule.trigger.columnName || (rule.trigger.type === "payment_overdue" ? "Payment Status" : "Date of Upload"));
    setBuilderTriggerValue(rule.trigger.toValue ?? (rule.trigger.type === "payment_overdue" ? "Unpaid" : "Done"));
    setBuilderTriggerTiming(rule.trigger.timing || "is_inputted");
    setBuilderConditions(
      rule.conditions.map((c, i) => ({
        id: `c-${i}`,
        column: c.columnName,
        op: c.operator,
        value: c.value,
        logic: c.logicalOperator ?? "AND",
      }))
    );
    setBuilderActions(
      rule.actions.map((a, i) => ({
        id: `a-${i}`,
        type: a.type,
        label: a.label,
        targetColumn: a.targetColumnName || (a.type === "change_status" ? "Status" : undefined),
        targetValue: a.targetValue ?? (a.type === "change_status" ? "Done" : a.recipientRole ?? "Top 3 Admins, Board Owner & Assignee"),
        recipientRole: a.recipientRole,
        notificationMessage: a.notificationMessage,
        webhookUrl: a.webhookUrl,
      }))
    );
    setActiveTab("builder");
    toast.info(`Editing recipe "${rule.name}" in Recipe Builder`);
  };

  // Run Now (Execution on item and board)
  const handleRunNow = async (rule: AutomationRule) => {
    // Pick the most relevant test job (overdue job if payment rule, or first job)
    const targetJob =
      rule.trigger.type === "payment_overdue"
        ? jobs.find((j) => j.daysOverdue && j.daysOverdue > 0) ?? jobs[0]
        : jobs[0];

    const result = executeAutomationRule(rule, targetJob);

    // 1. Mutate test job state so the modal UI updates immediately
    if (result.updatedJob) {
      setJobs((prev) =>
        prev.map((j) => (j.id === result.updatedJob!.id ? result.updatedJob! : j))
      );
    }

    let boardRes: any = null;

    // 2. If boardId is provided, apply the change to the actual board in Supabase!
    if (boardId) {
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("board:run-automations", { detail: { ruleId: rule.id } })
          );
        }

        boardRes = await applyAutomationToBoard({
          boardId,
          rule,
        });

        // Dispatch live event to update any active board views on screen
        if (typeof window !== "undefined") {
          if (boardRes.appliedCellUpdates && boardRes.appliedCellUpdates.length > 0) {
            boardRes.appliedCellUpdates.forEach((up: any) => {
              window.dispatchEvent(
                new CustomEvent("board:apply-cell-update", { detail: up })
              );
            });
          }
          window.dispatchEvent(
            new CustomEvent("board-data-changed", { detail: { boardId } })
          );
        }
      } catch (err) {
        console.warn("[handleRunNow] Board action note:", err);
      }
    }

    if (result.log) {
      setLogs((prev) => [result.log!, ...prev]);
    }

    // Update rule run counter
    setRules((prev) =>
      prev.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              runCount: r.runCount + 1,
              lastRunAt: new Date().toISOString(),
              safeguards: {
                ...r.safeguards,
                dailyRunsCount: r.safeguards.dailyRunsCount + 1,
              },
            }
          : r
      )
    );

    if (result.status === "success" || (boardRes && boardRes.success)) {
      if (boardId) {
        toast.success(
          `⚡ Applied "${rule.name}" on ${boardName || "Board"}.`,
          {
            description: boardRes?.message || result.appliedSummary || result.actionsExecuted.join(" · "),
          }
        );
      } else {
        toast.success(
          `Applied "${rule.name}" on "${targetJob.jobTitle}".`,
          {
            description: result.appliedSummary || result.actionsExecuted.join(" · "),
          }
        );
      }
      onAutomationsChanged?.();
    } else if (result.status === "warning") {
      toast.warning(`Executed with warnings: ${result.warnings?.[0]}`);
    } else if (result.status === "skipped") {
      toast.info(`Rule skipped: ${result.reason}`);
    } else {
      toast.error(`Rule failed: ${result.errorMessage ?? result.reason}`);
    }
  };

  // Load template into builder
  const handleUseTemplate = (template: AutomationTemplate) => {
    setIsTitleManual(true);
    setBuilderRuleName(template.title);
    setBuilderTriggerType(template.trigger.type);
    setBuilderTriggerLabel(template.trigger.label);
    setBuilderTriggerColumn(template.trigger.columnName || (template.trigger.type === "payment_overdue" ? "Payment Status" : "Date of Upload"));
    setBuilderTriggerValue(template.trigger.toValue ?? (template.trigger.type === "payment_overdue" ? "Unpaid" : "Done"));
    setBuilderTriggerTiming(template.trigger.timing || "is_inputted");
    setBuilderConditions(
      template.conditions.map((c, i) => ({
        id: `c-${i}`,
        column: c.columnName,
        op: c.operator,
        value: c.value,
        logic: c.logicalOperator ?? "AND",
      }))
    );
    setBuilderActions(
      template.actions.map((a, i) => ({
        id: `a-${i}`,
        type: a.type,
        label: a.label,
        targetColumn: a.targetColumnName || (a.type === "change_status" ? "Status" : undefined),
        targetValue: a.targetValue ?? (a.type === "change_status" ? "Done" : a.recipientRole ?? "Top 3 Admins, Board Owner & Assignee"),
        recipientRole: a.recipientRole,
        notificationMessage: a.notificationMessage,
        webhookUrl: a.webhookUrl,
      }))
    );
    setActiveTab("builder");
    toast.info(`Loaded "${template.title}" into Recipe Builder`);
  };

  // Preset helpers for 1-click builder loading
  const handleApplyPreset = (preset: "upload_done" | "status_done_move" | "status_risk" | "payment_overdue") => {
    setIsTitleManual(false);
    if (preset === "upload_done") {
      setBuilderTriggerType("date_arrives");
      setBuilderTriggerLabel("Date is inputted");
      setBuilderTriggerColumn("Date of Upload");
      setBuilderTriggerTiming("is_inputted");
      setBuilderConditions([]);
      setBuilderActions([
        {
          id: "a-1",
          type: "change_status",
          label: "Change Status to Done",
          targetColumn: "Status",
          targetValue: "Done",
        },
      ]);
      setBuilderRuleName("When Date of Upload is inputted in the data, change Status to Done");
      toast.info("Loaded recipe: Date of Upload inputted → Status Done");
    } else if (preset === "status_done_move") {
      setBuilderTriggerType("status_change");
      setBuilderTriggerLabel("Status changes to");
      setBuilderTriggerColumn("Status");
      setBuilderTriggerValue("Done");
      setBuilderConditions([]);
      setBuilderActions([
        {
          id: "a-1",
          type: "move_item",
          label: "Move item to Completed group",
          targetValue: "Completed",
        },
      ]);
      setBuilderRuleName("When Status changes to Done, move item to Completed group");
      toast.info("Loaded recipe: Status Done → Move to Completed");
    } else if (preset === "status_risk") {
      setBuilderTriggerType("status_change");
      setBuilderTriggerLabel("Status changes to");
      setBuilderTriggerColumn("Status");
      setBuilderTriggerValue("At Risk");
      setBuilderConditions([]);
      setBuilderActions([
        {
          id: "a-1",
          type: "send_notification",
          label: "Send urgent notification",
          targetValue: "Board Channel",
        },
      ]);
      setBuilderRuleName("When Status changes to At Risk, send notification");
      toast.info("Loaded recipe: Status At Risk → Alert Team");
    } else if (preset === "payment_overdue") {
      setBuilderTriggerType("payment_overdue");
      setBuilderTriggerLabel("Payment is Overdue");
      setBuilderTriggerColumn("Payment Status");
      setBuilderTriggerValue("Unpaid");
      setBuilderConditions([]);
      setBuilderActions([
        {
          id: "a-1",
          type: "send_email",
          label: "Send Overdue Alert Email",
          targetValue: "Top 3 Admins & Board Owner",
        },
      ]);
      setBuilderRuleName("When Payment is Overdue, send email to Admins & Assignee");
      toast.info("Loaded recipe: Payment Overdue → Email Admins");
    }
  };

  const handleTestRunOnBoard = async () => {
    const draftRule: AutomationRule = {
      id: "rule-test-" + Date.now(),
      name: builderRuleName.trim() || ("When " + builderTriggerLabel + ", " + (builderActions[0]?.label || "take action")),
      description: recipeSentencePreview,
      category: "Custom",
      boardId,
      boardName,
      enabled: true,
      owner: {
        id: "usr-current",
        name: "Rujuta Pethe", email: "rujutapethe@gmail.com",
      },
      createdAt: new Date().toISOString(),
      runCount: 0,
      trigger: {
        type: builderTriggerType,
        label: builderTriggerLabel,
        columnName: builderTriggerColumn,
        toValue: builderTriggerValue,
        timing: builderTriggerTiming,
      },
      conditions: builderConditions.map((c) => ({
        id: c.id,
        columnId: c.column.toLowerCase().replace(/\s+/g, "_"),
        columnName: c.column,
        operator: c.op,
        value: c.value,
        logicalOperator: c.logic,
      })),
      actions: builderActions.map((a) => ({
        id: a.id,
        type: a.type,
        label:
          a.type === "change_status"
            ? ("Change " + (a.targetColumn || "Status") + " to " + (a.targetValue || "Done"))
            : a.label,
        targetColumnName: a.targetColumn,
        targetValue: a.targetValue,
        recipientRole: a.recipientRole as any,
        notificationMessage: a.notificationMessage,
        webhookUrl: a.webhookUrl,
      })),
      safeguards: {
        maxDailyRuns: 1000,
        dailyRunsCount: 0,
        dryRun: false,
        loopPreventionKey: "lock-" + Date.now(),
      },
    };

    await handleRunNow(draftRule);
  };

  // Save custom automation from builder
  const handleSaveCustomAutomation = () => {
    const newRule: AutomationRule = {
      id: `rule-custom-${Date.now()}`,
      name: builderRuleName.trim() || `When ${builderTriggerLabel}, ${builderActions[0]?.label || "take action"}`,
      description: recipeSentencePreview,
      category: "Custom",
      boardId,
      boardName,
      enabled: true,
      owner: {
        id: "usr-current",
        name: "Rujuta Pethe", email: "rujutapethe@gmail.com",
      },
      createdAt: new Date().toISOString(),
      runCount: 0,
      trigger: {
        type: builderTriggerType,
        label: builderTriggerLabel,
        columnName: builderTriggerColumn,
        toValue: builderTriggerValue,
        timing: builderTriggerTiming,
      },
      conditions: builderConditions.map((c) => ({
        id: c.id,
        columnId: c.column.toLowerCase().replace(/\s+/g, "_"),
        columnName: c.column,
        operator: c.op,
        value: c.value,
        logicalOperator: c.logic,
      })),
      actions: builderActions.map((a) => ({
        id: a.id,
        type: a.type,
        label:
          a.type === "change_status"
            ? `Change ${a.targetColumn || "Status"} to ${a.targetValue || "Done"}`
            : a.label,
        targetColumnName: a.targetColumn,
        targetValue: a.targetValue,
        recipientRole: a.recipientRole as any,
        notificationMessage: a.notificationMessage,
        webhookUrl: a.webhookUrl,
      })),
      safeguards: {
        maxDailyRuns: 1000,
        dailyRunsCount: 0,
        dryRun: builderDryRun,
        loopPreventionKey: `lock-${Date.now()}`,
      },
    };

    const updated = upsertBoardAutomation(boardId || "default", newRule);
    setRules(updated);
    setActiveTab("my-automations");
    toast.success(`Created automation "${newRule.name}"! Active on board.`);
    onAutomationsChanged?.();
  };

  // Filter templates
  const categories: AutomationCategory[] = [
    "Featured",
    "Status & Movement",
    "Due Dates & Overdue",
    "Notifications & Team",
    "Billing & Payments",
    "Custom",
  ];

  const filteredTemplates = MOCK_AUTOMATION_TEMPLATES.filter((tmpl) => {
    const matchesCategory =
      selectedCategory === "All" || tmpl.category === selectedCategory;
    const matchesSearch =
      templateSearch === "" ||
      tmpl.title.toLowerCase().includes(templateSearch.toLowerCase()) ||
      tmpl.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
      tmpl.category.toLowerCase().includes(templateSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate quick metrics
  const activeCount = rules.filter((r) => r.enabled).length;
  const totalRuns = rules.reduce((acc, r) => acc + r.runCount, 0);

  // Sample overdue job for live previews
  const sampleOverdueJob = jobs.find((j) => j.daysOverdue && j.daysOverdue > 0) ?? jobs[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border">
        {/* ── Dialog Header ────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  Automation Center
                </DialogTitle>
                <Badge variant="secondary" className="text-xs font-normal">
                  {boardName}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Build plain-language recipes to automate status changes, email alerts, notifications, and payment reminders.
              </DialogDescription>
            </div>
          </div>

          {/* Quick Metrics & Safeguard pill */}
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-foreground">{activeCount} active</span>
              <span className="text-muted-foreground">({totalRuns} runs)</span>
            </div>
            <div
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Built-in loop prevention & 1,000 runs/day rate limit active"
            >
              <Shield className="size-3.5 text-blue-500" />
              <span className="text-[11px]">Safeguards on</span>
            </div>
          </div>
        </div>

        {/* ── Sub Navigation Tabs ──────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 bg-card">
          <div className="flex gap-1 py-2">
            <Button
              variant={activeTab === "templates" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("templates")}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <Layers className="size-3.5" />
              Templates
            </Button>
            <Button
              variant={activeTab === "my-automations" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("my-automations")}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <Zap className="size-3.5" />
              Board Automations ({rules.length})
            </Button>
            <Button
              variant={activeTab === "builder" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("builder")}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <Plus className="size-3.5" />
              Create Custom Automation
            </Button>
            <Button
              variant={activeTab === "logs" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("logs")}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <History className="size-3.5" />
              Activity History ({logs.length})
            </Button>
            <Button
              variant={activeTab === "overdue-settings" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("overdue-settings")}
              className="h-8 gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
            >
              <DollarSign className="size-3.5" />
              Overdue Trigger Settings
            </Button>
          </div>

          <Button
            size="sm"
            onClick={() => {
              setBuilderRuleName("Custom Studio Automation");
              setActiveTab("builder");
            }}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Plus className="size-3.5" />
            Add Automation
          </Button>
        </div>

        {/* ── Tab Content Container ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: TEMPLATES */}
          {activeTab === "templates" && (
            <div className="space-y-6">
              {/* Search & Category Pills */}
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates (e.g. overdue, move, email)..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="h-9 pl-9 text-xs"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={selectedCategory === "All" ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedCategory("All")}
                  >
                    All
                  </Badge>
                  {categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant={selectedCategory === cat ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Template Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <Card
                    key={template.id}
                    className="flex flex-col justify-between hover:border-primary/50 transition-colors shadow-sm"
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge variant="secondary" className="text-[10px] font-medium">
                          {template.category}
                        </Badge>
                        {template.popular && (
                          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                            <Sparkles className="size-2.5 mr-1" />
                            Popular
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-sm font-semibold leading-snug">
                        {template.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </CardDescription>
                    </CardHeader>

                    {/* Monday.com Recipe preview */}
                    <div className="px-4 py-2 my-2 mx-4 rounded-md bg-muted/40 border border-border/50 text-xs font-mono space-y-1">
                      <div className="text-primary font-semibold">
                        {template.sentenceParts.triggerText}
                      </div>
                      {template.sentenceParts.conditionText && (
                        <div className="text-amber-600 dark:text-amber-400 font-medium">
                          {template.sentenceParts.conditionText}
                        </div>
                      )}
                      <div className="text-foreground/80">
                        {template.sentenceParts.actionText}
                      </div>
                    </div>

                    <div className="p-4 pt-2 flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleUseTemplate(template)}
                        className="h-7 text-xs gap-1.5"
                      >
                        Use Recipe
                        <ArrowRight className="size-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: MY AUTOMATIONS */}
          {activeTab === "my-automations" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Active Board Automations
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    These recipes run automatically on items within {boardName}.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("builder")}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Plus className="size-3.5" />
                  New Recipe
                </Button>
              </div>

              <div className="space-y-3">
                {rules.map((rule) => (
                  <Card
                    key={rule.id}
                    className={cn(
                      "p-4 transition-all border",
                      rule.enabled
                        ? "bg-card border-border shadow-sm"
                        : "bg-muted/20 border-border/40 opacity-70"
                    )}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Recipe Sentence (monday.com style) */}
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {rule.name}
                          </span>
                          {rule.isBuiltIn && (
                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                              Built-in
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {rule.category}
                          </Badge>
                        </div>

                        {/* Interactive Plain-language sentence tokens */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/90 font-medium">
                          <span className="text-muted-foreground">When</span>
                          <span className="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-primary font-semibold">
                            {rule.trigger.label}
                          </span>

                          {rule.conditions.length > 0 && (
                            <>
                              <span className="text-muted-foreground">and if</span>
                              {rule.conditions.map((cond, idx) => (
                                <span
                                  key={cond.id}
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-amber-700 dark:text-amber-300 font-semibold"
                                >
                                  {cond.columnName} {cond.operator.replace("_", " ")} &quot;{cond.value}&quot;
                                  {idx < rule.conditions.length - 1 && (
                                    <span className="text-muted-foreground ml-1">
                                      {cond.logicalOperator ?? "AND"}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </>
                          )}

                          <span className="text-muted-foreground">then</span>
                          {rule.actions.map((act) => (
                            <span
                              key={act.id}
                              className="inline-flex items-center rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-700 dark:text-emerald-300 font-semibold"
                            >
                              {act.label}
                            </span>
                          ))}
                        </div>

                        {/* Metadata Strip */}
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            Created by {rule.owner.name}
                          </span>
                          <span>•</span>
                          <span>Ran {rule.runCount} times</span>
                          {rule.lastRunAt && (
                            <>
                              <span>•</span>
                              <span>
                                Last run: {new Date(rule.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Controls (Toggle, Run Now, Actions) */}
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRunNow(rule)}
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          title="Run now on sample item"
                        >
                          <Play className="size-3 text-emerald-500 fill-emerald-500" />
                          Run now
                        </Button>

                        <div className="flex items-center gap-2 pl-2 border-l border-border">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggleRule(rule.id)}
                            aria-label={`Toggle ${rule.name}`}
                          />
                          <span className="text-xs font-medium w-8">
                            {rule.enabled ? "ON" : "OFF"}
                          </span>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <Edit2 className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleEditRule(rule)}>
                              <Edit2 className="size-3.5 mr-2" />
                              Edit Recipe
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateRule(rule)}>
                              <Copy className="size-3.5 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => deleteRule(rule.id)}
                              disabled={rule.isBuiltIn}
                            >
                              <Trash2 className="size-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CREATE CUSTOM AUTOMATION (monday.com RECIPE BUILDER) */}
          {activeTab === "builder" && (
            <div className="max-w-3xl mx-auto space-y-5">
              {/* Header with Title and Presets */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                <div>
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-500" />
                    Automation Recipe Builder
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Build plain-language automations by clicking on the colored tokens below.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-medium w-fit bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                  Target: {boardName}
                </Badge>
              </div>

              {/* 1-Click Popular Presets */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-muted/40 border border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  Popular Presets:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("upload_done")}
                  className="h-7 text-xs rounded-full bg-card hover:border-emerald-500 hover:text-emerald-600 gap-1.5"
                >
                  <Calendar className="size-3 text-blue-500" />
                  Date of Upload → Done
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("status_done_move")}
                  className="h-7 text-xs rounded-full bg-card hover:border-emerald-500 hover:text-emerald-600 gap-1.5"
                >
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  Status Done → Move Group
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("status_risk")}
                  className="h-7 text-xs rounded-full bg-card hover:border-emerald-500 hover:text-emerald-600 gap-1.5"
                >
                  <AlertTriangle className="size-3 text-amber-500" />
                  Status At Risk → Alert Team
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset("payment_overdue")}
                  className="h-7 text-xs rounded-full bg-card hover:border-emerald-500 hover:text-emerald-600 gap-1.5"
                >
                  <DollarSign className="size-3 text-amber-500" />
                  Payment Overdue → Email Admins
                </Button>
              </div>

              {/* THE HERO INTERACTIVE RECIPE CARD */}
              <Card className="p-6 bg-card border-border/80 shadow-sm space-y-6">
                {/* 1. WHEN TRIGGER ROW */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                    1. When this happens:
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium bg-muted/20 p-3 rounded-lg border border-border/40">
                    <span className="text-muted-foreground font-semibold">When</span>

                    {/* Trigger Type / Category Pill */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 px-3 gap-1.5 bg-primary/10 border-primary/30 text-primary font-bold shadow-sm"
                        >
                          <Zap className="size-3.5" />
                          {builderTriggerTiming === "is_inputted" || builderTriggerType === "date_inputted"
                            ? "Date is inputted"
                            : builderTriggerLabel}
                          <ChevronDown className="size-3.5 opacity-60 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel className="text-xs">Choose Trigger Event</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setBuilderTriggerType("date_arrives");
                            setBuilderTriggerLabel("Date is inputted");
                            setBuilderTriggerColumn("Date of Upload");
                            setBuilderTriggerTiming("is_inputted");
                          }}
                        >
                          <Calendar className="size-3.5 mr-2 text-blue-500" />
                          Date is inputted in the data
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setBuilderTriggerType("status_change");
                            setBuilderTriggerLabel("Status changes to");
                            setBuilderTriggerColumn("Status");
                            setBuilderTriggerValue("Done");
                          }}
                        >
                          <CheckCircle2 className="size-3.5 mr-2 text-emerald-500" />
                          Status changes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setBuilderTriggerType("date_arrives");
                            setBuilderTriggerLabel("Date arrives");
                            setBuilderTriggerColumn("Due Date");
                            setBuilderTriggerTiming("on_date");
                          }}
                        >
                          <Calendar className="size-3.5 mr-2 text-blue-500" />
                          Date arrives (deadline)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setBuilderTriggerType("payment_overdue");
                            setBuilderTriggerLabel("Payment is Overdue");
                            setBuilderTriggerColumn("Payment Status");
                            setBuilderTriggerValue("Unpaid");
                          }}
                        >
                          <DollarSign className="size-3.5 mr-2 text-amber-500" />
                          Payment is Overdue (Custom)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setBuilderTriggerType("person_assigned");
                            setBuilderTriggerLabel("Person is assigned");
                          }}
                        >
                          <Users className="size-3.5 mr-2 text-purple-500" />
                          Person is assigned
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setBuilderTriggerType("button_clicked");
                            setBuilderTriggerLabel("Button is clicked");
                          }}
                        >
                          <Play className="size-3.5 mr-2 text-orange-500" />
                          Button is clicked
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* If trigger is status_change */}
                    {builderTriggerType === "status_change" && (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-9 px-3 gap-1 font-semibold border-border">
                              {builderTriggerColumn}
                              <ChevronDown className="size-3.5 ml-1 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {actualStatusColumns.map((col) => (
                              <DropdownMenuItem
                                key={col}
                                onClick={() => {
                                  setBuilderTriggerColumn(col);
                                  const vals = STATUS_VALUES_BY_COLUMN[col] || ["Done"];
                                  setBuilderTriggerValue(vals[0]);
                                }}
                              >
                                {col}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <span className="text-muted-foreground font-semibold">to</span>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-9 px-3 gap-1 font-bold border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              {builderTriggerValue}
                              <ChevronDown className="size-3.5 ml-1 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {(STATUS_VALUES_BY_COLUMN[builderTriggerColumn] || ["Done", "In Progress", "At Risk"]).map((val) => (
                              <DropdownMenuItem key={val} onClick={() => setBuilderTriggerValue(val)}>
                                {val}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}

                    {/* If trigger is date_arrives or date_inputted */}
                    {(builderTriggerType === "date_arrives" || builderTriggerType === "date_inputted") && (
                      <>
                        {builderTriggerTiming !== "is_inputted" && (
                          <span className="text-muted-foreground font-semibold">on</span>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-9 px-3 gap-1 font-semibold border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                              <Calendar className="size-3.5 mr-1 text-blue-500" />
                              {builderTriggerColumn}
                              <ChevronDown className="size-3.5 ml-1 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {actualDateColumns.map((col) => (
                              <DropdownMenuItem key={col} onClick={() => setBuilderTriggerColumn(col)}>
                                {col}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-9 px-3 gap-1 font-semibold border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                              {DATE_TIMING_OPTIONS.find((t) => t.value === builderTriggerTiming)?.label ?? "is inputted in the data"}
                              <ChevronDown className="size-3.5 ml-1 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {DATE_TIMING_OPTIONS.map((t) => (
                              <DropdownMenuItem key={t.value} onClick={() => setBuilderTriggerTiming(t.value)}>
                                {t.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>

                {/* 2. THEN ACTION ROW */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                    2. Then do this:
                  </span>
                  <div className="space-y-2 bg-muted/20 p-3 rounded-lg border border-border/40">
                    {builderActions.map((act) => (
                      <div key={act.id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="text-muted-foreground font-semibold">Then</span>

                        {/* Action Type Token */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 px-3 bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold gap-1.5"
                            >
                              <RefreshCw className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                              {ACTION_TYPE_OPTIONS.find((t) => t.type === act.type)?.label ?? act.label}
                              <ChevronDown className="size-3 opacity-60 ml-0.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuLabel className="text-xs">Choose Action</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleActionTypeChange(act.id, "change_status")}>
                              <RefreshCw className="size-3.5 mr-2 text-emerald-500" />
                              Change status to
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleActionTypeChange(act.id, "move_item")}>
                              <Layers className="size-3.5 mr-2 text-blue-500" />
                              Move item to group
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleActionTypeChange(act.id, "send_notification")}>
                              <Bell className="size-3.5 mr-2 text-indigo-500" />
                              Send in-app notification
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleActionTypeChange(act.id, "send_email")}>
                              <Mail className="size-3.5 mr-2 text-amber-500" />
                              Send email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleActionTypeChange(act.id, "assign_person")}>
                              <Users className="size-3.5 mr-2 text-purple-500" />
                              Assign person
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleActionTypeChange(act.id, "set_date")}>
                              <Calendar className="size-3.5 mr-2 text-cyan-500" />
                              Set date to
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* If change_status: column + value */}
                        {act.type === "change_status" && (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 px-3 font-semibold border-border">
                                  {act.targetColumn || "Status"}
                                  <ChevronDown className="size-3 opacity-60 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {STATUS_COLUMNS.map((col) => (
                                  <DropdownMenuItem key={col} onClick={() => handleActionColumnChange(act.id, col)}>
                                    {col}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <span className="text-muted-foreground font-semibold">to</span>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 px-3 font-bold border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                  <Check className="size-3.5 mr-1" />
                                  {act.targetValue || "Done"}
                                  <ChevronDown className="size-3 opacity-60 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {(STATUS_VALUES_BY_COLUMN[act.targetColumn || "Status"] || ["Done", "Working on it", "At Risk", "Not Started"]).map((val) => (
                                  <DropdownMenuItem key={val} onClick={() => handleActionTargetValueChange(act.id, val)}>
                                    {val}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}

                        {/* If move_item: group */}
                        {act.type === "move_item" && (
                          <>
                            <span className="text-muted-foreground font-semibold">to</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 px-3 font-semibold border-border">
                                  {act.targetValue || "Completed"}
                                  <ChevronDown className="size-3 opacity-60 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {GROUP_OPTIONS.map((grp) => (
                                  <DropdownMenuItem key={grp} onClick={() => handleActionTargetValueChange(act.id, grp)}>
                                    {grp}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}

                        {/* If send_notification: target */}
                        {act.type === "send_notification" && (
                          <>
                            <span className="text-muted-foreground font-semibold">to</span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 px-3 font-semibold border-border">
                                  {act.targetValue || "Board Channel"}
                                  <ChevronDown className="size-3 opacity-60 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {NOTIFICATION_TARGETS.map((t) => (
                                  <DropdownMenuItem key={t} onClick={() => handleActionTargetValueChange(act.id, t)}>
                                    {t}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. OPTIONAL FILTER CONDITION (Collapsible) */}
                <div className="pt-1">
                  {builderConditions.length === 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddCondition}
                      className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-8"
                    >
                      <Plus className="size-3" />
                      Add filter condition (optional)
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          Conditions:
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleAddCondition} className="h-6 text-xs text-primary">
                          <Plus className="size-3 mr-1" /> Add condition
                        </Button>
                      </div>
                      {builderConditions.map((cond, idx) => (
                        <div key={cond.id} className="flex items-center gap-2 bg-muted/30 p-2 rounded-md border border-border/40 text-xs">
                          <span className="text-muted-foreground font-semibold">{idx > 0 ? cond.logic : "and if"}</span>
                          <span className="font-semibold">{cond.column}</span>
                          <span className="text-muted-foreground">{cond.op}</span>
                          <span className="font-semibold text-primary">&quot;{cond.value}&quot;</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setBuilderConditions((prev) => prev.filter((c) => c.id !== cond.id))}
                            className="size-6 text-muted-foreground hover:text-destructive ml-auto"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RECIPE SUMMARY */}
                <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-500 shrink-0" />
                    <span className="text-xs text-foreground font-medium">
                      &ldquo;{recipeSentencePreview}&rdquo;
                    </span>
                  </div>
                </div>
              </Card>

              {/* SAVE / TEST ACTION BAR */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestRunOnBoard}
                  className="h-9 gap-1.5 text-xs font-medium"
                >
                  <Play className="size-3 text-emerald-500 fill-emerald-500" />
                  Test Run on Board
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab("my-automations")}
                    className="h-9 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveCustomAutomation}
                    className="h-9 px-5 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    <Check className="size-4" />
                    Save &amp; Activate Recipe
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVITY LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Execution Activity Log
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Real-time audit trail of every trigger firing, recipient delivery, and safeguard decision.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.success("Activity logs refreshed")}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RefreshCw className="size-3.5" />
                  Refresh
                </Button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border text-left font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Automation</th>
                      <th className="py-2.5 px-4">Item / Job</th>
                      <th className="py-2.5 px-4">Trigger Reason</th>
                      <th className="py-2.5 px-4">Time</th>
                      <th className="py-2.5 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          {log.status === "success" && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                              <CheckCircle2 className="size-2.5 mr-1" />
                              Success
                            </Badge>
                          )}
                          {log.status === "warning" && (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                              <AlertTriangle className="size-2.5 mr-1" />
                              Warning
                            </Badge>
                          )}
                          {log.status === "error" && (
                            <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px]">
                              <XCircle className="size-2.5 mr-1" />
                              Failed
                            </Badge>
                          )}
                          {log.status === "skipped" && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Skipped
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {log.automationName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate" title={log.itemName}>
                          {log.itemName}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[240px] truncate" title={log.triggerReason}>
                          {log.triggerReason}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {new Date(log.triggeredAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                            className="h-7 text-xs text-primary"
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: OVERDUE TRIGGER SETTINGS */}
          {activeTab === "overdue-settings" && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="size-4 text-amber-500" />
                  Built-in Overdue Payment Trigger Configuration
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fires automatically when current date is after payment due date and status is not Paid.
                </p>
              </div>

              {/* Recipient Configuration Card */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    1. Target Recipients (Deduplicated)
                  </h4>
                  <Badge variant="secondary" className="text-[10px]">
                    Automatic Deduplication Active
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-medium text-foreground">
                    Top 3 Workspace Admins (Pick by role or pin specific people)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {workspaceAdmins.map((adm, i) => (
                      <div
                        key={adm.id}
                        className="p-2.5 rounded-md border border-border bg-card flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{adm.name}</span>
                            <Badge variant="outline" className="text-[9px]">Admin #{i + 1}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{adm.role}</p>
                          <p className="text-[10px] text-primary truncate mt-1">{adm.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={includeOwner} onCheckedChange={setIncludeOwner} />
                      <span>Include Board Owner (Rujuta Pethe)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={includeAssignee} onCheckedChange={setIncludeAssignee} />
                      <span>Include Job Assignee (Producer / Lead)</span>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Trigger Frequency, Cadence & Grace Period */}
              <Card className="p-5 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Timing, Grace Period & Escalation
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-medium text-foreground">Grace Period (Days)</label>
                    <Input
                      type="number"
                      min={0}
                      value={gracePeriod}
                      onChange={(e) => setGracePeriod(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Delays alert by N days past due date (default: 0).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-medium text-foreground">Reminder Cadence</label>
                    <Input
                      type="number"
                      min={0}
                      value={reminderCadence}
                      onChange={(e) => setReminderCadence(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Repeat every N days (0 = single alert, no repeat).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-medium text-foreground">Escalate After (Days)</label>
                    <Input
                      type="number"
                      min={0}
                      value={escalationCadence}
                      onChange={(e) => setEscalationCadence(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Auto-elevates priority to Urgent after N days overdue.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Email Template Customizer */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    3. Email Content & Merge Fields
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTestEmailOpen(true)}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Eye className="size-3" />
                    Preview & Send Test Email
                  </Button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-medium text-foreground">Subject Line Template</label>
                    <Input
                      value={overdueSubject}
                      onChange={(e) => setOverdueSubject(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-foreground">Email Body Template</label>
                    <Textarea
                      rows={6}
                      value={overdueBody}
                      onChange={(e) => setOverdueBody(e.target.value)}
                      className="text-xs font-mono leading-relaxed"
                    />
                  </div>

                  {/* Merge tags list chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <span className="text-muted-foreground font-medium">Merge fields:</span>
                    {[
                      "{client_name}",
                      "{job_title}",
                      "{amount}",
                      "{due_date}",
                      "{days_overdue}",
                      "{assignee}",
                      "{board_name}",
                      "{payment_terms}",
                      "{item_url}",
                    ].map((tag) => (
                      <code
                        key={tag}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-primary cursor-pointer hover:bg-primary/10"
                        onClick={() => {
                          navigator.clipboard.writeText(tag);
                          toast.info(`Copied ${tag} to clipboard`);
                        }}
                        title="Click to copy tag"
                      >
                        {tag}
                      </code>
                    ))}
                  </div>
                </div>
              </Card>

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => toast.success("Overdue trigger settings updated successfully")}
                  className="h-8 text-xs"
                >
                  Save Settings
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Email Preview & Send Test Modal ──────────────────────── */}
        <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
          <DialogContent className="max-w-lg bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Mail className="size-4 text-primary" />
                Overdue Payment Email Preview
              </DialogTitle>
              <DialogDescription className="text-xs">
                Rendered with live test data from &quot;{sampleOverdueJob.jobTitle}&quot;.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              <div className="rounded-md border border-border p-3 bg-muted/20 space-y-1.5 font-sans">
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">To: </span>
                  {workspaceAdmins.map((a) => a.email).join(", ")}, {sampleOverdueJob.assignee.email}
                </div>
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Subject: </span>
                  <span className="text-foreground font-medium">
                    {interpolateMergeFields(
                      overdueSubject,
                      sampleOverdueJob,
                      "Team",
                      sampleOverdueJob.daysOverdue ?? 13
                    )}
                  </span>
                </div>
              </div>

              {/* HTML Mail Body Card */}
              <div className="rounded-lg border border-border p-4 bg-card whitespace-pre-wrap font-sans text-xs text-foreground/90 leading-relaxed shadow-sm">
                {interpolateMergeFields(
                  overdueBody,
                  sampleOverdueJob,
                  "Rujuta Pethe",
                  sampleOverdueJob.daysOverdue ?? 13
                )}

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <Button size="sm" className="h-8 gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white">
                    <ExternalLink className="size-3.5" />
                    Review Overdue Item
                  </Button>
                  <span className="text-[10px] text-muted-foreground">Powerweave Automations Engine</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTestEmailOpen(false)}
                className="h-8 text-xs"
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  toast.success("Test email sent to s.jenkins@powerweave.studio!");
                  setTestEmailOpen(false);
                }}
                className="h-8 gap-1.5 text-xs"
              >
                <Send className="size-3.5" />
                Send Test Email Now
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Log Detail Modal ─────────────────────────────────────── */}
        {selectedLog && (
          <Dialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
            <DialogContent className="max-w-md bg-background border-border">
              <DialogHeader>
                <DialogTitle className="text-sm font-semibold">
                  Execution Details: {selectedLog.automationName}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Run ID: {selectedLog.id} • Latency: {selectedLog.latencyMs}ms
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-foreground">Trigger Reason:</span>
                  <p className="text-muted-foreground mt-0.5">{selectedLog.triggerReason}</p>
                </div>

                {selectedLog.details.recipientsSent && (
                  <div>
                    <span className="font-semibold text-foreground">Recipients Dispatched:</span>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                      {selectedLog.details.recipientsSent.map((rcp, i) => (
                        <li key={i}>{rcp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedLog.details.warnings && (
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
                    <span className="font-semibold">Warnings Logged:</span>
                    <ul className="list-disc pl-4 mt-1">
                      {selectedLog.details.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedLog.details.actionsExecuted && (
                  <div>
                    <span className="font-semibold text-foreground">Actions Executed:</span>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-muted-foreground">
                      {selectedLog.details.actionsExecuted.map((act, i) => (
                        <li key={i}>{act}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
