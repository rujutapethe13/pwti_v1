"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AutomationRule, AutomationAction } from "./types";

export interface ApplyAutomationResult {
  success: boolean;
  message: string;
  affectedRecordsCount: number;
  updatedFields: string[];
  appliedCellUpdates?: Array<{
    recordId: string;
    columnId: string;
    value: any;
    valueText: string;
  }>;
}

/**
 * Server action to apply an automation rule's actions directly to board records in Supabase.
 */
export async function applyAutomationToBoard({
  boardId,
  rule,
  targetRecordId,
}: {
  boardId: string;
  rule: AutomationRule;
  targetRecordId?: string;
}): Promise<ApplyAutomationResult> {
  const supabase = await createServiceClient();

  // 1. Resolve board row by id or slug
  let realBoardId = boardId;
  const { data: boardRow } = await supabase
    .from("boards")
    .select("id, organization_id, workspace_id, slug")
    .or(`id.eq.${boardId},slug.eq.${boardId}`)
    .maybeSingle();

  if (boardRow) {
    realBoardId = boardRow.id;
  }

  // 2. Fetch columns for this board
  const { data: cols } = await supabase
    .from("columns")
    .select("id, key, label, type, settings")
    .eq("board_id", realBoardId)
    .is("deleted_at", null);

  // 3. Fetch records on this board
  let recordsQuery = supabase
    .from("records")
    .select("id, title, group_id")
    .eq("board_id", realBoardId);

  if (targetRecordId) {
    recordsQuery = recordsQuery.eq("id", targetRecordId);
  }

  const { data: records } = await recordsQuery;
  if (!records || records.length === 0) {
    return {
      success: false,
      message: "No records found on board to apply automation to.",
      affectedRecordsCount: 0,
      updatedFields: [],
    };
  }

  const updatedFields: string[] = [];
  const appliedCellUpdates: Array<{
    recordId: string;
    columnId: string;
    value: any;
    valueText: string;
  }> = [];
  let affectedCount = 0;

  // 3b. Determine which records qualify for this rule's trigger
  let eligibleRecords = records;
  const isDateTrigger =
    rule.trigger.type === "date_inputted" ||
    rule.trigger.type === "date_arrives" ||
    rule.trigger.timing === "is_inputted";

  if (isDateTrigger && !targetRecordId) {
    const triggerColName = (rule.trigger.columnName || "Date of Upload").trim().toLowerCase();
    const dateCol =
      cols?.find((c) => (c.label || "").trim().toLowerCase() === triggerColName) ??
      cols?.find((c) => (c.key || "").trim().toLowerCase() === triggerColName) ??
      cols?.find((c) => c.type === "date" && (c.label || "").toLowerCase().includes("upload")) ??
      cols?.find((c) => c.type === "date");

    if (dateCol) {
      const { data: dateCells } = await supabase
        .from("cell_values")
        .select("record_id, value, value_text")
        .eq("board_id", realBoardId)
        .eq("column_id", dateCol.id);

      const validRecordIds = new Set(
        (dateCells || [])
          .filter((c) => c.value !== null && c.value !== undefined && String(c.value).trim() !== "")
          .map((c) => c.record_id)
      );
      eligibleRecords = records.filter((r) => validRecordIds.has(r.id));
    }
  }

  // 4. Iterate over actions in the rule and apply them
  for (const action of rule.actions) {
    if (action.type === "change_status") {
      // Find matching status column with strict priority to avoid shadowing
      const targetColName = (action.targetColumnName ?? "Status").toLowerCase().trim();
      const statusCol =
        cols?.find((c) => (c.label || "").trim().toLowerCase() === targetColName) ??
        cols?.find((c) => (c.key || "").trim().toLowerCase() === targetColName) ??
        cols?.find(
          (c) =>
            c.type === "status" &&
            ((c.label || "").trim().toLowerCase() === "status" || c.key?.toLowerCase() === "tat")
        ) ??
        cols?.find((c) => (c.label || "").replace(/\s+/g, " ").trim().toLowerCase() === targetColName) ??
        cols?.find((c) => (c.label || "").trim().toLowerCase().includes(targetColName)) ??
        cols?.find((c) => c.type === "status");

      if (statusCol) {
        // Resolve option id if column has options (e.g. opt-done for "Done")
        const settings = statusCol.settings as any;
        const options: Array<{ id: string; label: string }> = settings?.options ?? settings?.labels ?? [];
        const targetValStr = action.targetValue ?? "Done";
        const matchingOpt = options.find(
          (opt) =>
            opt.label.toLowerCase() === targetValStr.toLowerCase() ||
            opt.id.toLowerCase() === targetValStr.toLowerCase()
        );
        const cellValToStore = matchingOpt ? matchingOpt.id : targetValStr;

        for (const rec of eligibleRecords) {
          const cellId = `${realBoardId}:${rec.id}:${statusCol.id}`;
          await supabase.from("cell_values").upsert(
            {
              id: cellId,
              organization_id: boardRow?.organization_id ?? "org-default",
              workspace_id: boardRow?.workspace_id ?? "ws-default",
              board_id: realBoardId,
              record_id: rec.id,
              column_id: statusCol.id,
              value: cellValToStore,
              value_text: targetValStr,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "board_id,record_id,column_id" }
          );

          appliedCellUpdates.push({
            recordId: rec.id,
            columnId: statusCol.id,
            value: cellValToStore,
            valueText: targetValStr,
          });
          affectedCount++;
        }
        updatedFields.push(`${statusCol.label || "Status"} -> ${targetValStr}`);
      }
    } else if (action.type === "move_item") {
      // Find groups on this board
      const { data: groups } = await supabase
        .from("groups")
        .select("id, name")
        .eq("board_id", realBoardId);

      const targetGroupName = (action.targetValue ?? "Completed").toLowerCase();
      const targetGroup =
        groups?.find((g) => g.name.toLowerCase().includes(targetGroupName)) ?? groups?.[0];

      if (targetGroup) {
        for (const rec of eligibleRecords) {
          await supabase.from("records").update({ group_id: targetGroup.id }).eq("id", rec.id);
          affectedCount++;
        }
        updatedFields.push(`Moved to group "${targetGroup.name}"`);
      }
    } else if (action.type === "set_date") {
      const targetColName = (action.targetColumnName ?? "Date of Upload").toLowerCase();
      const dateCol =
        cols?.find(
          (c) =>
            c.type === "date" &&
            (c.label?.toLowerCase().includes(targetColName) || c.key?.toLowerCase().includes(targetColName))
        ) ?? cols?.find((c) => c.type === "date");

      if (dateCol) {
        const todayStr = new Date().toISOString().slice(0, 10);
        for (const rec of eligibleRecords) {
          const cellId = `${realBoardId}:${rec.id}:${dateCol.id}`;
          await supabase.from("cell_values").upsert(
            {
              id: cellId,
              organization_id: boardRow?.organization_id ?? "org-default",
              workspace_id: boardRow?.workspace_id ?? "ws-default",
              board_id: realBoardId,
              record_id: rec.id,
              column_id: dateCol.id,
              value: todayStr,
              value_text: todayStr,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "board_id,record_id,column_id" }
          );

          appliedCellUpdates.push({
            recordId: rec.id,
            columnId: dateCol.id,
            value: todayStr,
            valueText: todayStr,
          });
          affectedCount++;
        }
        updatedFields.push(`${dateCol.label || "Date"} -> ${todayStr}`);
      }
    } else if (action.type === "assign_person") {
      const personCol = cols?.find((c) => c.type === "person");
      if (personCol) {
        const assigneeName = action.targetValue ?? "Current User";
        for (const rec of eligibleRecords) {
          const cellId = `${realBoardId}:${rec.id}:${personCol.id}`;
          await supabase.from("cell_values").upsert(
            {
              id: cellId,
              organization_id: boardRow?.organization_id ?? "org-default",
              workspace_id: boardRow?.workspace_id ?? "ws-default",
              board_id: realBoardId,
              record_id: rec.id,
              column_id: personCol.id,
              value: assigneeName,
              value_text: assigneeName,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "board_id,record_id,column_id" }
          );
          appliedCellUpdates.push({
            recordId: rec.id,
            columnId: personCol.id,
            value: assigneeName,
            valueText: assigneeName,
          });
          affectedCount++;
        }
        updatedFields.push(`Assigned to ${assigneeName}`);
      }
    }
  }

  // 5. Log the run in automation_runs
  try {
    await supabase.from("automation_runs").insert({
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      board_id: realBoardId,
      record_id: records[0]?.id ?? null,
      status: "success",
      details: {
        ruleId: rule.id,
        ruleName: rule.name,
        updatedFields,
        affectedCount,
        executedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn("[applyAutomationToBoard] Log insertion note:", err);
  }

  // 6. Revalidate pages
  if (boardRow?.slug) {
    revalidatePath(`/${boardRow.slug}`);
  }
  revalidatePath("/client-360");

  return {
    success: true,
    message: `Automation applied to ${affectedCount} board item(s): ${updatedFields.join(", ")}`,
    affectedRecordsCount: affectedCount,
    updatedFields,
    appliedCellUpdates,
  };
}
