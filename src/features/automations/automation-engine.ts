import type {
  AutomationRule,
  AutomationCondition,
  AutomationAction,
  AutomationRunLog,
  PaymentJobItem,
} from "./types";
import {
  evaluateJobOverdue,
  resolveOverdueRecipients,
  interpolateMergeFields,
} from "./payment-overdue-service";

export interface ExecutionContext {
  depth: number;
  maxDepth?: number;
  executedRuleIds: Set<string>;
  triggeredByRuleId?: string;
}

export interface EngineResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  status: "success" | "warning" | "error" | "skipped";
  reason: string;
  actionsExecuted: string[];
  recipientsSent?: string[];
  warnings?: string[];
  errorMessage?: string;
  log?: AutomationRunLog;
  updatedJob?: PaymentJobItem;
  appliedSummary?: string;
}

/**
 * Evaluates whether all conditions in a rule are met.
 * Supports logical AND / OR grouping.
 */
export function evaluateConditions(
  conditions: AutomationCondition[],
  itemValues: Record<string, any>
): boolean {
  if (!conditions || conditions.length === 0) return true;

  let currentResult = true;

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    const rawVal = itemValues[cond.columnId] ?? itemValues[cond.columnName] ?? "";
    const strVal = String(rawVal).toLowerCase().trim();
    const targetVal = String(cond.value).toLowerCase().trim();

    let condPassed = false;
    switch (cond.operator) {
      case "equals":
        condPassed = strVal === targetVal;
        break;
      case "not_equals":
        condPassed = strVal !== targetVal;
        break;
      case "contains":
        condPassed = strVal.includes(targetVal);
        break;
      case "not_contains":
        condPassed = !strVal.includes(targetVal);
        break;
      case "is_empty":
        condPassed = strVal === "" || rawVal === null || rawVal === undefined;
        break;
      case "is_not_empty":
        condPassed = strVal !== "" && rawVal !== null && rawVal !== undefined;
        break;
      case "greater_than":
        condPassed = Number(rawVal) > Number(cond.value);
        break;
      case "less_than":
        condPassed = Number(rawVal) < Number(cond.value);
        break;
      case "is_before":
        condPassed = new Date(strVal).getTime() < new Date(targetVal).getTime();
        break;
      case "is_after":
        condPassed = new Date(strVal).getTime() > new Date(targetVal).getTime();
        break;
      default:
        condPassed = true;
    }

    if (i === 0) {
      currentResult = condPassed;
    } else {
      const logicalOp = cond.logicalOperator ?? "AND";
      if (logicalOp === "AND") {
        currentResult = currentResult && condPassed;
      } else {
        currentResult = currentResult || condPassed;
      }
    }
  }

  return currentResult;
}

/**
 * Executes a single automation rule against an item with safeguards.
 */
export function executeAutomationRule(
  rule: AutomationRule,
  job: PaymentJobItem,
  context: ExecutionContext = { depth: 0, executedRuleIds: new Set() }
): EngineResult {
  const startTime = Date.now();

  // Safeguard 1: Enabled check
  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "skipped",
      reason: "Automation is currently disabled (OFF)",
      actionsExecuted: [],
    };
  }

  // Safeguard 2: Daily limit check
  if (rule.safeguards.dailyRunsCount >= rule.safeguards.maxDailyRuns) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "warning",
      reason: `Daily execution limit reached (${rule.safeguards.dailyRunsCount}/${rule.safeguards.maxDailyRuns}). Paused until midnight.`,
      actionsExecuted: [],
      warnings: ["Rate limit threshold met to prevent runaway execution."],
    };
  }

  // Safeguard 3: Loop & recursion protection (max cascade depth: 3)
  const maxDepth = context.maxDepth ?? 3;
  if (context.depth > maxDepth || context.executedRuleIds.has(rule.id)) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "error",
      reason: `Infinite cascade loop detected. Rule '${rule.name}' attempted to trigger cyclically at depth ${context.depth}.`,
      actionsExecuted: [],
      errorMessage: "Loop detected: execution suppressed by engine safeguard.",
    };
  }

  // Evaluate trigger
  let triggerMatched = false;
  let triggerReason = "";
  let daysOverdue = 0;

  if (rule.trigger.type === "payment_overdue") {
    const overdueResult = evaluateJobOverdue(job, {
      gracePeriodDays: rule.paymentOverdueConfig?.gracePeriodDays ?? 0,
    });
    triggerMatched = overdueResult.isOverdue;
    triggerReason = overdueResult.reason;
    daysOverdue = overdueResult.daysOverdue;
  } else if (rule.trigger.type === "status_change") {
    triggerMatched =
      !rule.trigger.toValue ||
      job.paymentStatus.toLowerCase() === rule.trigger.toValue.toLowerCase();
    triggerReason = `Status evaluated for '${rule.trigger.toValue ?? "Any"}'`;
  } else {
    // Other triggers match when invoked
    triggerMatched = true;
    triggerReason = `Trigger '${rule.trigger.label}' evaluated`;
  }

  if (!triggerMatched) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "skipped",
      reason: triggerReason || "Trigger conditions not satisfied",
      actionsExecuted: [],
    };
  }

  // Evaluate conditions
  const itemValues: Record<string, any> = {
    payment_status: job.paymentStatus,
    amount: job.amount,
    days_overdue: daysOverdue,
    client_name: job.clientName,
    board_name: job.boardName,
  };

  const conditionsPassed = evaluateConditions(rule.conditions, itemValues);
  if (!conditionsPassed) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "skipped",
      reason: "Rule conditions did not match item properties",
      actionsExecuted: [],
    };
  }

  // Execute actions and apply mutations to the target job
  const updatedJob: PaymentJobItem = { ...job };
  const actionsExecuted: string[] = [];
  const recipientsSent: string[] = [];
  const warnings: string[] = [];
  const appliedSummaries: string[] = [];

  for (const act of rule.actions) {
    if (act.type === "send_email") {
      const resolved = resolveOverdueRecipients(updatedJob, {
        includeBoardOwner: rule.paymentOverdueConfig?.includeBoardOwner ?? true,
        includeAssignee: rule.paymentOverdueConfig?.includeAssignee ?? true,
      });

      warnings.push(...resolved.warnings);

      resolved.recipients.forEach((rcp) => {
        recipientsSent.push(`${rcp.email} (${rcp.roleLabel})`);
      });

      actionsExecuted.push(
        `send_email: Dispatched to ${resolved.recipients.length} deduplicated recipient(s)`
      );
      appliedSummaries.push(`Email dispatched to ${resolved.recipients.length} recipient(s)`);
    } else if (act.type === "send_notification") {
      actionsExecuted.push(
        `send_notification: In-app notification delivered to board notifications channel`
      );
      appliedSummaries.push("In-app notification delivered");
    } else if (act.type === "move_item") {
      const targetGroup = act.targetValue ?? "Completed";
      (updatedJob as any).groupName = targetGroup;
      actionsExecuted.push(`move_item: Moved item to group '${targetGroup}'`);
      appliedSummaries.push(`Moved to group "${targetGroup}"`);
    } else if (act.type === "change_status") {
      const targetVal = act.targetValue ?? "Done";
      const oldVal = updatedJob.paymentStatus;
      // Mutate payment status and general status
      updatedJob.paymentStatus = targetVal as any;
      (updatedJob as any).status = targetVal;
      if (targetVal.toLowerCase() === "paid" || targetVal.toLowerCase() === "done") {
        updatedJob.daysOverdue = 0;
        updatedJob.overdueAlertResolved = true;
      }
      actionsExecuted.push(`change_status: Updated ${act.targetColumnName ?? "Status"} from '${oldVal}' to '${targetVal}'`);
      appliedSummaries.push(`Updated ${act.targetColumnName ?? "Status"} to "${targetVal}"`);
    } else if (act.type === "assign_person") {
      const targetAssignee = act.targetValue ?? "Current User";
      updatedJob.assignee = {
        ...updatedJob.assignee,
        name: targetAssignee,
      };
      actionsExecuted.push(`assign_person: Assigned item to '${targetAssignee}'`);
      appliedSummaries.push(`Assigned to "${targetAssignee}"`);
    } else if (act.type === "set_date") {
      const now = new Date().toISOString().slice(0, 10);
      updatedJob.paymentDueDate = now;
      actionsExecuted.push(`set_date: Set ${act.targetColumnName ?? "Due Date"} to '${now}'`);
      appliedSummaries.push(`Set ${act.targetColumnName ?? "Due Date"} to ${now}`);
    } else if (act.type === "post_update") {
      actionsExecuted.push(`post_update: Logged activity comment on item feed`);
      appliedSummaries.push("Update logged on item");
    } else if (act.type === "call_webhook") {
      actionsExecuted.push(`call_webhook: POST ${act.webhookUrl ?? "https://api.powerweave.studio/hooks"}`);
      appliedSummaries.push("Webhook dispatched");
    } else {
      actionsExecuted.push(`${act.type}: Executed action '${act.label}'`);
      appliedSummaries.push(act.label);
    }
  }

  const latencyMs = Date.now() - startTime;
  const status: "success" | "warning" = warnings.length > 0 ? "warning" : "success";

  const log: AutomationRunLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    automationId: rule.id,
    automationName: rule.name,
    boardName: updatedJob.boardName,
    itemId: updatedJob.id,
    itemName: updatedJob.jobTitle,
    triggeredAt: new Date().toISOString(),
    triggerReason,
    status,
    latencyMs: Math.max(12, latencyMs),
    details: {
      recipientsSent,
      warnings: warnings.length > 0 ? warnings : undefined,
      actionsExecuted,
      mergeValues: {
        client_name: updatedJob.clientName,
        job_title: updatedJob.jobTitle,
        amount: `$${updatedJob.amount.toLocaleString()}`,
        due_date: updatedJob.paymentDueDate,
        days_overdue: String(daysOverdue),
      },
    },
  };

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matched: true,
    status,
    reason: triggerReason,
    actionsExecuted,
    recipientsSent,
    warnings,
    log,
    updatedJob,
    appliedSummary: appliedSummaries.join(" · "),
  };
}
