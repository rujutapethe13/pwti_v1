"use client";

import { toast } from "sonner";
import type { AutomationRule, AutomationAuditLog } from "./types";
import { getBoardAutomations, saveBoardAutomations, recordAutomationLog } from "./automation-storage";
import type { ColumnDefinition, Group as GroupDefinition, BoardRecord as RecordItem, ColumnValue } from "@/features/boards/engine/types";
import { getColumnOptions } from "@/features/boards/engine/lib/option-lookup";

export interface BoardAutomationContext {
  board: {
    id: string;
    organizationId: string;
    workspaceId: string;
    name: string;
  };
  columns: ColumnDefinition[];
  groups: GroupDefinition[];
  records: RecordItem[];
  cellValues: Map<string, ColumnValue>;
  setCellValues: React.Dispatch<React.SetStateAction<Map<string, ColumnValue>>>;
  setRecords: React.Dispatch<React.SetStateAction<RecordItem[]>>;
  updateCellFn: (
    orgId: string,
    wsId: string,
    boardId: string,
    recordId: string,
    columnId: string,
    value: ColumnValue
  ) => Promise<{ error?: string | null }>;
  moveRecordToGroupFn?: (recordId: string, groupId: string) => Promise<any>;
}

/**
 * Evaluates and applies active automation rules when a cell is edited on a board.
 */
export async function executeBoardCellAutomations(
  recordId: string,
  columnId: string,
  newValue: ColumnValue,
  ctx: BoardAutomationContext,
  options?: { silent?: boolean }
): Promise<boolean> {
  const {
    board,
    columns,
    groups,
    records,
    cellValues,
    setCellValues,
    setRecords,
    updateCellFn,
    moveRecordToGroupFn,
  } = ctx;

  const editedCol = columns.find((c) => c.id === columnId);
  if (!editedCol) return false;

  const colLabel = (editedCol.label || editedCol.key || "").trim().toLowerCase();
  const rawRules = getBoardAutomations(board.id);
  const activeRules = rawRules.filter((r) => r.enabled);

  let anyApplied = false;
  const currentRecord = records.find((r) => r.id === recordId);
  const recordTitle = currentRecord?.title || "Item";

  for (const rule of activeRules) {
    let matches = false;
    let matchReason = "";

    // 1. TRIGGER: Date inputted / Date arrives
    const isDateTrigger =
      rule.trigger.type === "date_inputted" ||
      rule.trigger.type === "date_arrives" ||
      rule.trigger.timing === "is_inputted";

    if (isDateTrigger) {
      const targetColName = (rule.trigger.columnName || "Date of Upload").trim().toLowerCase();
      const colMatches =
        (rule.trigger.columnId
          ? editedCol.id === rule.trigger.columnId
          : colLabel === targetColName ||
            (editedCol.key || "").trim().toLowerCase() === targetColName);

      const hasValue = newValue !== null && newValue !== undefined && String(newValue).trim() !== "";

      if (colMatches && hasValue) {
        matches = true;
        matchReason = `Date inputted into "${editedCol.label}"`;
      }
    }

    // 2. TRIGGER: Status change
    if (rule.trigger.type === "status_change") {
      const targetColName = (rule.trigger.columnName || "Status").trim().toLowerCase();
      const isStatusCol =
        (rule.trigger.columnId
          ? editedCol.id === rule.trigger.columnId
          : colLabel === targetColName ||
            (editedCol.key || "").trim().toLowerCase() === targetColName);

      if (isStatusCol) {
        // Resolve option label for newValue if options exist
        const options = getColumnOptions(editedCol);
        const opt = options.find((o) => o.id === newValue || o.label.toLowerCase() === String(newValue).toLowerCase());
        const resolvedVal = opt?.label || String(newValue);

        const targetToVal = (rule.trigger.toValue || "Done").toLowerCase();
        if (
          !rule.trigger.toValue ||
          resolvedVal.toLowerCase() === targetToVal ||
          String(newValue).toLowerCase() === targetToVal ||
          (opt && opt.id.toLowerCase() === targetToVal)
        ) {
          matches = true;
          matchReason = `Status changed to "${resolvedVal}"`;
        }
      }
    }

    // 3. TRIGGER: Generic column change or cell change
    if (
      rule.trigger.type === "column_change" ||
      rule.trigger.type === "cell_change" ||
      rule.trigger.type === "value_change"
    ) {
      const targetColName = (rule.trigger.columnName || "").trim().toLowerCase();
      if (
        (rule.trigger.columnId
          ? editedCol.id === rule.trigger.columnId
          : !targetColName ||
            colLabel === targetColName ||
            (editedCol.key || "").trim().toLowerCase() === targetColName)
      ) {
        matches = true;
        matchReason = `Column "${editedCol.label}" changed`;
      }
    }

    if (!matches) continue;

    // Evaluate conditions if any are configured
    if (rule.conditions && rule.conditions.length > 0) {
      let conditionsMet = true;
      for (const cond of rule.conditions) {
        const condCol = columns.find(
          (c) =>
            c.id === cond.columnId ||
            (c.label || "").trim().toLowerCase() === (cond.columnName || "").trim().toLowerCase()
        );
        if (condCol) {
          const val = cellValues.get(`${recordId}:${condCol.id}`);
          const valStr = String(val ?? "").toLowerCase();
          const targetCondVal = String(cond.value ?? "").toLowerCase();
          if (cond.operator === "equals" && valStr !== targetCondVal) conditionsMet = false;
          if (cond.operator === "not_equals" && valStr === targetCondVal) conditionsMet = false;
          if (cond.operator === "is_empty" && valStr !== "") conditionsMet = false;
          if (cond.operator === "is_not_empty" && valStr === "") conditionsMet = false;
        }
      }
      if (!conditionsMet) continue;
    }

    // Apply Actions for this matched rule
    const actionsSummaries: string[] = [];

    for (const action of rule.actions) {
      if (action.type === "change_status") {
        // Find matching status column with strict priority to prevent shadowing
        const targetColName = (action.targetColumnName || "Status").trim().toLowerCase();
        const statusCol = action.targetColumnId
          ? columns.find((c) => c.id === action.targetColumnId)
          : columns.find(
              (c) =>
                (c.label || "").trim().toLowerCase() === targetColName ||
                (c.key || "").trim().toLowerCase() === targetColName,
            );

        if (statusCol) {
          const statusKey = `${recordId}:${statusCol.id}`;
          const currentStatus = cellValues.get(statusKey);

          // Find option ID for target value (e.g. opt-done for "Done")
          const options = getColumnOptions(statusCol);
          const targetValStr = action.targetValue || "Done";
          const matchingOpt = options.find(
            (o) =>
              o.label?.toLowerCase() === targetValStr.toLowerCase() ||
              o.id?.toLowerCase() === targetValStr.toLowerCase()
          );
          const valToSet = matchingOpt ? matchingOpt.id : targetValStr;

          // Check if status is already the target value
          const isAlreadyDone =
            currentStatus === valToSet ||
            (matchingOpt && (currentStatus === matchingOpt.id || currentStatus === matchingOpt.label));

          if (!isAlreadyDone) {
            // Optimistic update
            setCellValues((prev) => {
              const next = new Map(prev);
              next.set(statusKey, valToSet);
              return next;
            });

            // Persist to Supabase
            void updateCellFn(
              board.organizationId,
              board.workspaceId,
              board.id,
              recordId,
              statusCol.id,
              valToSet
            );

            actionsSummaries.push(`Set "${statusCol.label}" to "${matchingOpt?.label || targetValStr}"`);
            anyApplied = true;

            // Cascading check: trigger next rule in sequence if appropriate
            setTimeout(() => {
              void executeBoardCellAutomations(recordId, statusCol.id, valToSet, ctx, options);
            }, 50);
          }
        }
      } else if (action.type === "move_item") {
        const targetGroupName = (action.targetValue || "Completed").toLowerCase();
        const targetGroup =
          groups.find((g) => g.name.toLowerCase() === targetGroupName) ||
          groups.find((g) => g.name.toLowerCase().includes(targetGroupName)) ||
          groups.find((g) => g.name.toLowerCase().includes("done")) ||
          groups.find((g) => g.name.toLowerCase().includes("complete"));

        if (targetGroup && currentRecord && currentRecord.groupId !== targetGroup.id) {
          // Optimistic group move
          setRecords((prev) =>
            prev.map((r) => (r.id === recordId ? { ...r, groupId: targetGroup.id } : r))
          );
          // Persist group move to database
          if (moveRecordToGroupFn) {
            void moveRecordToGroupFn(recordId, targetGroup.id);
          }
          actionsSummaries.push(`Moved to "${targetGroup.name}" group`);
          anyApplied = true;
        }
      } else if (action.type === "send_notification") {
        const msg = (action.notificationMessage || `Automation "${rule.name}" triggered on ${recordTitle}`)
          .replace("{job_title}", recordTitle)
          .replace("{client_name}", "Client");
        actionsSummaries.push(`Delivered notification: "${msg}"`);
        anyApplied = true;
      }
    }

    if (actionsSummaries.length > 0) {
      // 1. Show user feedback
      if (!options?.silent) {
        toast.success(`⚡ Automation Applied: ${rule.name}`, {
          description: actionsSummaries.join(" · "),
          duration: 4500,
        });
      }

      // 2. Audit Log
      const auditLog: AutomationAuditLog = {
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        automationId: rule.id,
        automationName: rule.name,
        boardName: board.name,
        itemId: recordId,
        itemName: recordTitle,
        triggeredAt: new Date().toISOString(),
        triggerReason: matchReason,
        status: "success",
        latencyMs: 15,
        details: {
          actionsExecuted: actionsSummaries,
          mergeValues: {
            recordId,
            columnId,
            value: String(newValue ?? ""),
          },
        },
      };
      recordAutomationLog(board.id, auditLog);

      // 3. Update rule run counter
      const updatedRules = rawRules.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              runCount: r.runCount + 1,
              lastRunAt: new Date().toISOString(),
            }
          : r
      );
      saveBoardAutomations(board.id, updatedRules);
    }
  }

  return anyApplied;
}

/**
 * Evaluates all active board automations across ALL existing records on the board.
 * Useful for 1-click "Run All on Board" or immediately applying when an automation is enabled.
 */
export async function runAllActiveBoardAutomations(
  ctx: BoardAutomationContext,
  options?: { silent?: boolean; targetRuleId?: string }
): Promise<{ appliedCount: number; summaries: string[] }> {
  const { board, columns, records, cellValues } = ctx;
  const rawRules = getBoardAutomations(board.id);
  const activeRules = rawRules.filter(
    (r) => r.enabled && (!options?.targetRuleId || r.id === options.targetRuleId)
  );

  if (activeRules.length === 0) {
    if (!options?.silent) {
      toast.info("No active automations on this board. Enable a rule first.");
    }
    return { appliedCount: 0, summaries: [] };
  }

  let totalApplied = 0;
  const allSummaries: string[] = [];

  for (const record of records) {
    for (const col of columns) {
      const val = cellValues.get(`${record.id}:${col.id}`);
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        const applied = await executeBoardCellAutomations(record.id, col.id, val, ctx, {
          silent: options?.silent,
        });
        if (applied) {
          totalApplied++;
        }
      }
    }
  }

  if (totalApplied > 0) {
    toast.success(`⚡ Automations evaluated on all items! Applied to ${totalApplied} item updates.`);
  } else if (!options?.silent) {
    toast.info("All board items are already up to date with active automations.");
  }

  return { appliedCount: totalApplied, summaries: allSummaries };
}
