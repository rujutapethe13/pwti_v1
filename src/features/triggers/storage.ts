"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type {
  Trigger,
  TriggerLog,
  TriggerItemAlert,
  TriggerAction,
  TriggerConditionGroup,
  TriggerEmailSettings,
} from "./types";

const TABLE_TRIGGERS = "triggers";
const TABLE_LOGS = "trigger_logs";
const TABLE_ALERTS = "trigger_item_alerts";

function rowToTrigger(row: any): Trigger {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? "",
    enabled: row.enabled ?? true,
    scopeMode: row.scope_mode || "selected",
    scopeWorkspaces: Array.isArray(row.scope_workspaces) ? row.scope_workspaces : [],
    scopeBoards: Array.isArray(row.scope_boards) ? row.scope_boards : [],
    runMode: row.run_mode || "manual",
    conditions: row.conditions || ({ logic: "AND", conditions: [], id: "root" } as unknown as TriggerConditionGroup),
    actions: Array.isArray(row.actions) ? row.actions : [] as TriggerAction[],
    emailSettings: {
      enabled: row.email_enabled ?? false,
      toType: row.email_to_type || "static",
      to: Array.isArray(row.email_to) ? row.email_to : [],
      toField: row.email_to_field || "",
      cc: Array.isArray(row.email_cc) ? row.email_cc : [],
      subject: row.email_subject || "",
      body: row.email_body || "",
      format: row.email_format || "per_item",
      frequencyHours: Number(row.email_frequency_hours) || 24,
    },
    lastRunAt: row.last_run_at,
    runCount: Number(row.run_count) || 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTriggers(): Promise<Trigger[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from(TABLE_TRIGGERS)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[triggers] listTriggers error:", error);
    return [];
  }

  return (data || []).map(rowToTrigger);
}

export async function getTrigger(id: string): Promise<Trigger | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from(TABLE_TRIGGERS)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[triggers] getTrigger error:", error);
    return null;
  }

  return data ? rowToTrigger(data) : null;
}

export async function createTrigger(input: Omit<Trigger, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<Trigger | null> {
  const supabase = await createServiceClient();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    organization_id: input.organizationId || null,
    workspace_id: input.workspaceId || null,
    name: input.name,
    description: input.description,
    enabled: input.enabled,
    scope_mode: input.scopeMode,
    scope_workspaces: input.scopeWorkspaces,
    scope_boards: input.scopeBoards,
    run_mode: input.runMode,
    conditions: input.conditions,
    actions: input.actions,
    email_enabled: input.emailSettings.enabled,
    email_to_type: input.emailSettings.toType,
    email_to: input.emailSettings.to,
    email_to_field: input.emailSettings.toField || null,
    email_cc: input.emailSettings.cc,
    email_subject: input.emailSettings.subject,
    email_body: input.emailSettings.body,
    email_format: input.emailSettings.format,
    email_frequency_hours: input.emailSettings.frequencyHours,
    run_count: 0,
    created_at: now,
    updated_at: now,
  };

  if (input.id) {
    payload.id = input.id;
  }

  const { data, error } = await supabase.from(TABLE_TRIGGERS).insert(payload).select().single();

  if (error) {
    console.error("[triggers] createTrigger error:", error);
    return null;
  }

  return rowToTrigger(data);
}

export async function updateTrigger(
  id: string,
  updates: Partial<
    Pick<
      Trigger,
      | "name"
      | "description"
      | "enabled"
      | "scopeMode"
      | "scopeWorkspaces"
      | "scopeBoards"
      | "runMode"
      | "conditions"
      | "actions"
      | "emailSettings"
    >
  >
): Promise<Trigger | null> {
  const supabase = await createServiceClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.enabled !== undefined) payload.enabled = updates.enabled;
  if (updates.scopeMode !== undefined) payload.scope_mode = updates.scopeMode;
  if (updates.scopeWorkspaces !== undefined) payload.scope_workspaces = updates.scopeWorkspaces;
  if (updates.scopeBoards !== undefined) payload.scope_boards = updates.scopeBoards;
  if (updates.runMode !== undefined) payload.run_mode = updates.runMode;
  if (updates.conditions !== undefined) payload.conditions = updates.conditions;
  if (updates.actions !== undefined) payload.actions = updates.actions;

  if (updates.emailSettings) {
    payload.email_enabled = updates.emailSettings.enabled;
    payload.email_to_type = updates.emailSettings.toType;
    payload.email_to = updates.emailSettings.to;
    payload.email_to_field = updates.emailSettings.toField || null;
    payload.email_cc = updates.emailSettings.cc;
    payload.email_subject = updates.emailSettings.subject;
    payload.email_body = updates.emailSettings.body;
    payload.email_format = updates.emailSettings.format;
    payload.email_frequency_hours = updates.emailSettings.frequencyHours;
  }

  const { data, error } = await supabase
    .from(TABLE_TRIGGERS)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[triggers] updateTrigger error:", error);
    return null;
  }

  return rowToTrigger(data);
}

export async function toggleTrigger(id: string, enabled: boolean): Promise<boolean> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from(TABLE_TRIGGERS)
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[triggers] toggleTrigger error:", error);
    return false;
  }

  return true;
}

export async function deleteTrigger(id: string): Promise<boolean> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from(TABLE_TRIGGERS).delete().eq("id", id);

  if (error) {
    console.error("[triggers] deleteTrigger error:", error);
    return false;
  }

  return true;
}

export async function touchTriggerRun(id: string): Promise<void> {
  const supabase = await createServiceClient();
  await supabase
    .from(TABLE_TRIGGERS)
    .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function createTriggerLog(params: {
  triggerId: string;
  boardId?: string;
  startedBy: string;
  runMode: Trigger["runMode"];
  matchedCount: number;
  emailedCount: number;
  failedCount: number;
  skippedCount: number;
  status: TriggerLog["status"];
  error?: string;
  details?: Record<string, unknown>;
}): Promise<TriggerLog | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from(TABLE_LOGS)
    .insert({
      trigger_id: params.triggerId,
      board_id: params.boardId || null,
      started_by: params.startedBy,
      run_mode: params.runMode,
      matched_count: params.matchedCount,
      emailed_count: params.emailedCount,
      failed_count: params.failedCount,
      skipped_count: params.skippedCount,
      status: params.status,
      error: params.error || null,
      details: params.details || {},
    })
    .select()
    .single();

  if (error) {
    console.error("[triggers] createTriggerLog error:", error);
    return null;
  }

  return {
    id: data.id,
    triggerId: data.trigger_id,
    boardId: data.board_id,
    startedBy: data.started_by,
    runMode: data.run_mode,
    matchedCount: data.matched_count,
    emailedCount: data.emailed_count,
    failedCount: data.failed_count,
    skippedCount: data.skipped_count,
    status: data.status,
    error: data.error,
    details: data.details,
    createdAt: data.created_at,
  };
}

export async function listTriggerLogs(triggerId?: string, limit = 100): Promise<TriggerLog[]> {
  const supabase = await createServiceClient();
  let query = supabase.from(TABLE_LOGS).select("*").order("created_at", { ascending: false }).limit(limit);

  if (triggerId) {
    query = query.eq("trigger_id", triggerId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[triggers] listTriggerLogs error:", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    triggerId: row.trigger_id,
    boardId: row.board_id,
    startedBy: row.started_by,
    runMode: row.run_mode,
    matchedCount: row.matched_count,
    emailedCount: row.emailed_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    status: row.status,
    error: row.error,
    details: row.details,
    createdAt: row.created_at,
  }));
}

export async function getItemAlert(triggerId: string, recordId: string): Promise<TriggerItemAlert | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from(TABLE_ALERTS)
    .select("*")
    .eq("trigger_id", triggerId)
    .eq("record_id", recordId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data
    ? {
        id: data.id,
        triggerId: data.trigger_id,
        recordId: data.record_id,
        boardId: data.board_id,
        lastAlertedAt: data.last_alerted_at,
        alertCount: Number(data.alert_count) || 1,
      }
    : null;
}

export async function recordItemAlert(params: {
  triggerId: string;
  recordId: string;
  boardId: string;
}): Promise<void> {
  const supabase = await createServiceClient();
  const now = new Date().toISOString();

  const existing = await getItemAlert(params.triggerId, params.recordId);
  if (existing) {
    await supabase
      .from(TABLE_ALERTS)
      .update({ last_alerted_at: now, alert_count: (existing.alertCount || 0) + 1, updated_at: now })
      .eq("id", existing.id);
    return;
  }

  await supabase.from(TABLE_ALERTS).insert({
    trigger_id: params.triggerId,
    record_id: params.recordId,
    board_id: params.boardId,
    last_alerted_at: now,
    alert_count: 1,
    created_at: now,
    updated_at: now,
  });
}
