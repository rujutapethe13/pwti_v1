"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notify";
import {
  listTriggers,
  getTrigger,
  touchTriggerRun,
  getItemAlert,
  recordItemAlert,
  createTriggerLog,
} from "./storage";
import type {
  Trigger,
  TriggerCondition,
  TriggerConditionGroup,
  CheckChangeTriggerInput,
  RunTriggerResult,
} from "./types";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export interface TriggerItem {
  recordId: string;
  boardId: string;
  boardName: string;
  title: string;
  cells: Record<string, unknown>;
  updatedAt?: string;
}

export interface RunTriggerCtx {
  boardId: string;
  boardName: string;
  trigger: Trigger;
  matchedItems: TriggerItem[];
  manual: boolean;
  force: boolean;
  startedBy: string;
  results: Array<{
    recordId: string;
    boardId: string;
    boardName: string;
    title: string;
    sent: boolean;
    skipped: boolean;
    error?: string;
  }>;
  matched: number;
  sent: number;
  failed: number;
  skipped: number;
}

/* ───────────────────────── condition evaluation ──────────────────────── */

function cellValue(item: TriggerItem, cond: TriggerCondition): unknown {
  if (cond.columnId && item.cells[cond.columnId] !== undefined) {
    return item.cells[cond.columnId];
  }
  const byLabel = Object.entries(item.cells).find(
    ([, v]) => typeof v === "string" && String(v).toLowerCase() === cond.columnName.toLowerCase()
  );
  if (byLabel) return byLabel[1];
  return item.cells[cond.columnName];
}

function asStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseDate(value: unknown): Date | null {
  const d = new Date(asStr(value));
  return isNaN(d.getTime()) ? null : d;
}

function condPasses(cond: TriggerCondition, item: TriggerItem): boolean {
  const raw = cellValue(item, cond);
  const strVal = asStr(raw).toLowerCase().trim();
  const target = asStr(cond.value).toLowerCase().trim();
  const op = cond.operator;

  if (op === "is_empty") return strVal === "" && raw !== 0 && raw !== false;
  if (op === "is_not_empty") return strVal !== "";

  if (op === "is_before" || op === "is_after") {
    const cellDate = parseDate(raw);
    let targetDate: Date | null = null;
    if (target === "today") {
      const now = new Date();
      targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      targetDate = parseDate(target);
    }
    if (!cellDate || !targetDate) return false;
    return op === "is_before" ? cellDate.getTime() < targetDate.getTime() : cellDate.getTime() > targetDate.getTime();
  }

  if (op === "greater_than" || op === "less_than") {
    const n = Number(raw);
    const m = Number(cond.value);
    if (!Number.isFinite(n) || !Number.isFinite(m)) return false;
    return op === "greater_than" ? n > m : n < m;
  }

  if (op === "equals") return strVal === target;
  if (op === "not_equals") return strVal !== target;
  if (op === "contains") return strVal.includes(target);
  if (op === "not_contains") return !strVal.includes(target);
  return true;
}

function groupPasses(group: TriggerConditionGroup, item: TriggerItem): boolean {
  let clean = true;
  for (const cond of group.conditions) {
    const passed = "logic" in cond
      ? groupPasses(cond as TriggerConditionGroup, item)
      : condPasses(cond as TriggerCondition, item);
    clean = clean ? passed : group.logic === "AND" ? clean && passed : clean || passed;
  }
  return group.conditions.length === 0 ? true : clean;
}

function matchesTrigger(trigger: Trigger, item: TriggerItem): boolean {
  return groupPasses(trigger.conditions, item);
}

export async function isItemInCooldown(
  trigger: Trigger,
  recordId: string
): Promise<boolean> {
  const existing = await getItemAlert(trigger.id, recordId);
  if (!existing) return false;
  const hours = trigger.emailSettings.frequencyHours || 24;
  const last = new Date(existing.lastAlertedAt).getTime();
  return Date.now() - last < hours * 60 * 60 * 1000;
}

function resolveColumnLabel(columns: Array<{ id: string; label: string; key: string }>, hint: string): string | undefined {
  const lower = hint.toLowerCase();
  const exact = columns.find((c) => c.label.toLowerCase() === lower || c.key.toLowerCase() === lower);
  if (exact) return exact.id;
  return columns.find((c) => c.label.toLowerCase().includes(lower) || c.key.toLowerCase().includes(lower))?.id;
}

function itemValueByHint(item: TriggerItem, columns: Array<{ id: string; label: string; key: string }>, hint: string): string {
  const colId = resolveColumnLabel(columns, hint);
  if (colId && item.cells[colId] !== undefined) return asStr(item.cells[colId]);
  const direct = Object.entries(item.cells).find(
    ([, v]) => asStr(v).toLowerCase() === hint.toLowerCase()
  );
  return direct ? asStr(direct[1]) : "";
}

function resolveRecipients(
  trigger: Trigger,
  item: TriggerItem,
  columns: Array<{ id: string; label: string; key: string }>
): string[] {
  const s = trigger.emailSettings;
  const emails = new Set<string>();
  for (const e of s.to) {
    const addr = String(e).trim();
    if (addr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) emails.add(addr.toLowerCase());
  }
  if (s.toType === "field" && s.toField) {
    const fieldVal = itemValueByHint(item, columns, s.toField);
    const addr = String(fieldVal).trim();
    if (addr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) emails.add(addr.toLowerCase());
  }
  for (const e of s.cc) {
    const addr = String(e).trim();
    if (addr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) emails.add(addr.toLowerCase());
  }
  return Array.from(emails);
}

function escapeHtml(value: unknown): string {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, val] of Object.entries(values)) {
    out = out.replaceAll(new RegExp(`\\{${key}\\}`, "g"), escapeHtml(val));
  }
  return out;
}

function itemLink(boardId: string, recordId: string): string {
  return `${APP_URL}/boards/${boardId}?item=${encodeURIComponent(recordId)}`;
}

/* ───────────────────────── actions ─────────────────────────────────────── */

function emailAction(trigger: Trigger): { enabled: boolean; config: any } | null {
  const act = trigger.actions.find((a) => a.type === "send_email" && a.enabled);
  return act ? { enabled: true, config: act.config } : null;
}

async function sendItemEmail(
  ctx: RunTriggerCtx,
  item: TriggerItem,
  columns: Array<{ id: string; label: string; key: string }>,
  recipientOverride?: string[]
): Promise<{ ok: boolean; error?: string }> {
  const { trigger } = ctx;
  const s = trigger.emailSettings;
  const recipients = recipientOverride ?? resolveRecipients(trigger, item, columns);
  if (recipients.length === 0) {
    return { ok: true, error: undefined };
  }

  const values: Record<string, string> = {
    trigger: trigger.name,
    board: item.boardName,
    title: item.title,
    status: itemValueByHint(item, columns, "Status"),
    due_date: itemValueByHint(item, columns, "Due Date"),
    amount: itemValueByHint(item, columns, "Amount"),
    client: itemValueByHint(item, columns, "Client"),
    batch: itemValueByHint(item, columns, "Batch"),
    link: itemLink(item.boardId, item.recordId),
  };

  const subject = renderTemplate(s.subject, values);
  const body = renderTemplate(s.body, values);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:600px;margin:0 auto;padding:24px;}table{width:100%;border-collapse:collapse;margin:16px 0;}td{border:1px solid #ddd;padding:8px;}a{color:#0ea5e9;}</style></head><body><h2>${escapeHtml(subject)}</h2><div>${body.replace(/\n/g, "<br>")}</div><p><a href="${escapeHtml(values.link)}">View item on board</a></p></body></html>`;

  return sendEmail({ to: recipients, cc: s.cc.length ? s.cc : undefined, subject, html, text: body });
}

/* ───────────────────────── runTrigger ──────────────────────────────────── */

export async function runTrigger(
  triggerId: string,
  opts: { manual?: boolean; force?: boolean; startedBy?: string } = {}
): Promise<RunTriggerResult> {
  const manual = opts.manual === true;
  const force = opts.force === true;
  const startedBy = opts.startedBy || (manual ? "manual" : "automatic");

  const trigger = await getTrigger(triggerId);
  const t = trigger;
  if (!t) {
    return { triggerId, matched: 0, sent: 0, failed: 0, skipped: 0, status: "failed", error: "Trigger not found", items: [] };
  }

  if (!t.enabled) {
    return { triggerId, matched: 0, sent: 0, failed: 0, skipped: 0, status: "ok", error: "Trigger is disabled", items: [] };
  }

  const isAutomatic = t.runMode === "automatic" || t.runMode === "both";
  const isManual = t.runMode === "manual" || t.runMode === "both";
  if (manual && !isManual) {
    return { triggerId, matched: 0, sent: 0, failed: 0, skipped: 0, status: "failed", error: "Trigger is not available for manual runs", items: [] };
  }
  if (!manual && !isAutomatic) {
    return { triggerId, matched: 0, sent: 0, failed: 0, skipped: 0, status: "failed", error: "Trigger is not automatic", items: [] };
  }

  const supabase = await createServiceClient();

  // Resolve boards in scope.
  let boardQuery = supabase.from("boards").select("id, name, workspace_id");
  if (t.scopeMode === "selected") {
    if (t.scopeBoards.length === 0) {
      return emptyResult(t, "No boards selected");
    }
    boardQuery = boardQuery.in("id", t.scopeBoards);
  } else if (t.scopeWorkspaces.length > 0) {
    boardQuery = boardQuery.in("workspace_id", t.scopeWorkspaces);
  }

  const { data: boards, error: boardsError } = await boardQuery;
  if (boardsError || !boards) {
    return { triggerId, matched: 0, sent: 0, failed: 0, skipped: 0, status: "failed", error: boardsError?.message || "Failed to load boards", items: [] };
  }

  const ctx: RunTriggerCtx = {
    boardId: "",
    boardName: "",
    trigger: t,
    matchedItems: [],
    manual,
    force,
    startedBy,
    results: [],
    matched: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  const emailAct = emailAction(t);

  for (const board of boards) {
    ctx.boardId = board.id;
    ctx.boardName = board.name;

    const { data: columns } = await supabase
      .from("columns")
      .select("id, key, label")
      .eq("board_id", board.id);
    const colList: Array<{ id: string; label: string; key: string }> = (columns || []).map((c) => ({
      id: c.id,
      label: c.label || c.key,
      key: c.key || c.id,
    }));

    const { data: records } = await supabase
      .from("records")
      .select("*, cell_values(*)")
      .eq("board_id", board.id)
      .is("archived_at", null);

    const items: TriggerItem[] = (records || []).map((r: any) => {
      const cells: Record<string, unknown> = {};
      for (const cv of r.cell_values || []) {
        cells[cv.column_id] = cv.value_text !== undefined && cv.value_text !== null ? cv.value_text : cv.value;
      }
      return {
        recordId: r.id,
        boardId: r.board_id,
        boardName: board.name,
        title: r.title || "Untitled",
        cells,
        updatedAt: r.updated_at,
      };
    });

    for (const item of items) {
      if (!matchesTrigger(t, item)) continue;
      ctx.matched++;
      ctx.matchedItems.push(item);

      if (!force && await isItemInCooldown(t, item.recordId)) {
        ctx.skipped++;
        ctx.results.push({ recordId: item.recordId, boardId: item.boardId, boardName: item.boardName, title: item.title, sent: false, skipped: true });
        continue;
      }

      // Run enabled actions (email first; extensible to other action types).
      if (emailAct && t.emailSettings.enabled) {
        const result = await sendItemEmail(ctx, item, colList);
        if (result.ok) {
          ctx.sent++;
          await recordItemAlert({ triggerId: t.id, recordId: item.recordId, boardId: item.boardId });
          ctx.results.push({ recordId: item.recordId, boardId: item.boardId, boardName: item.boardName, title: item.title, sent: true, skipped: false });
        } else {
          ctx.failed++;
          ctx.results.push({ recordId: item.recordId, boardId: item.boardId, boardName: item.boardName, title: item.title, sent: false, skipped: false, error: result.error });
        }
      } else {
        // No email action configured: item matched, nothing to send.
        ctx.results.push({ recordId: item.recordId, boardId: item.boardId, boardName: item.boardName, title: item.title, sent: false, skipped: false });
      }
    }
  }

  await touchTriggerRun(t.id);

  const status =
    ctx.failed > 0 ? "failed" : ctx.matched === 0 || ctx.sent === 0 ? "ok" : ctx.skipped > 0 ? "partial" : "ok";

  await createTriggerLog({
    triggerId: t.id,
    boardId: ctx.boardId || undefined,
    startedBy,
    runMode: manual ? "manual" : "automatic",
    matchedCount: ctx.matched,
    emailedCount: ctx.sent,
    failedCount: ctx.failed,
    skippedCount: ctx.skipped,
    status,
    error: ctx.failed > 0 ? "Some emails failed to send" : undefined,
    details: { items: ctx.results },
  });

  return {
    triggerId: t.id,
    matched: ctx.matched,
    sent: ctx.sent,
    failed: ctx.failed,
    skipped: ctx.skipped,
    status,
    error: ctx.failed > 0 ? "Some emails failed to send" : undefined,
    items: ctx.results,
  };
}

function emptyResult(t: Trigger, error: string): RunTriggerResult {
  return { triggerId: t.id, matched: 0, sent: 0, failed: 0, skipped: 0, status: "ok", error, items: [] };
}

/* ───────────────────────── change-based triggers ───────────────────────── */

/**
 * Called after a record/cell save. Fire-and-forget: the caller must NOT await
 * this in the user-facing path. Evaluates triggers scoped to the board whose
 * condition references the changed column and whose value matches the new
 * value (and differs from the old value), then runs their actions for that
 * single item (subject to the normal frequency window).
 */
export async function checkChangeTriggers(input: CheckChangeTriggerInput): Promise<void> {
  try {
    const triggers = await listTriggers();
    const boardId = input.boardId;

    const applicable = triggers.filter((t) => {
      if (!t.enabled) return false;
      if (t.runMode !== "automatic" && t.runMode !== "both") return false;
      if (t.scopeMode === "selected" && !t.scopeBoards.includes(boardId)) return false;
      return true;
    });

    for (const t of applicable) {
      const item: TriggerItem = {
        recordId: input.recordId,
        boardId,
        boardName: input.boardName,
        title: input.boardName,
        cells: {},
      };

      const emailAct = emailAction(t);
      if (!emailAct || !t.emailSettings.enabled) continue;

      const inCooldown = await isItemInCooldown(t, input.recordId);
      if (inCooldown) continue;

      const columns: Array<{ id: string; label: string; key: string }> = [];
      const recipients = resolveRecipients(t, item, columns);
      if (recipients.length === 0) continue;

      const values: Record<string, string> = {
        trigger: t.name,
        board: input.boardName,
        title: "",
        status: "",
        due_date: "",
        amount: "",
        client: "",
        batch: "",
        link: itemLink(input.boardId, input.recordId),
      };
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px;"><h2>${escapeHtml(values.trigger)}</h2><p>Item changed on board "${escapeHtml(input.boardName)}": ${escapeHtml(String(input.newValue || ""))}.</p><p><a href="${escapeHtml(values.link)}">View item</a></p></body></html>`;
      await sendEmail({ to: recipients, cc: t.emailSettings.cc.length ? t.emailSettings.cc : undefined, subject: renderTemplate(t.emailSettings.subject, values), html, text: renderTemplate(t.emailSettings.body, values) });
      await recordItemAlert({ triggerId: t.id, recordId: input.recordId, boardId });
      await createTriggerLog({
        triggerId: t.id,
        boardId,
        startedBy: input.startedBy,
        runMode: "automatic",
        matchedCount: 1,
        emailedCount: 1,
        failedCount: 0,
        skippedCount: 0,
        status: "ok",
        details: { item: input.recordId, column: input.columnName, changed: true },
      });
    }
  } catch (error: any) {
    // Never throw into the save path.
    console.error("[triggers] checkChangeTriggers error:", error.message || error);
  }
}

function groupChangeMatches(trigger: Trigger, input: CheckChangeTriggerInput): boolean {
  const conds: TriggerCondition[] = [];
  const collect = (group: TriggerConditionGroup) => {
    for (const c of group.conditions) {
      if ("logic" in c) collect(c as TriggerConditionGroup);
      else conds.push(c as TriggerCondition);
    }
  };
  collect(trigger.conditions);

  const colName = input.columnName || "";
  const colId = input.columnId || "";
  const newVal = asStr(input.newValue).toLowerCase().trim();
  const oldVal = asStr(input.oldValue).toLowerCase().trim();

  return conds.some((c) => {
    const sameColumn = (c.columnId && c.columnId === colId) || c.columnName.toLowerCase() === colName.toLowerCase();
    if (!sameColumn) return false;
    if (c.operator === "equals" && newVal !== "" && newVal !== oldVal && newVal === asStr(c.value).toLowerCase().trim()) return true;
    if (c.operator === "not_equals" && oldVal === asStr(c.value).toLowerCase().trim() && newVal !== oldVal) return true;
    if (c.operator === "is_not_empty" && newVal !== "" && oldVal === "") return true;
    return false;
  });
}
