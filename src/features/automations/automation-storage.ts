"use client";

import type { AutomationRule, AutomationAuditLog } from "./types";
import { INITIAL_AUTOMATION_RULES } from "./automation-mock-data";

const STORAGE_PREFIX = "powerweave_automations_";
const LOGS_STORAGE_PREFIX = "powerweave_automation_logs_";

// Memory cache for SSR or when localStorage is unavailable
const memoryRulesCache = new Map<string, AutomationRule[]>();
const memoryLogsCache = new Map<string, AutomationAuditLog[]>();

/**
 * Get active automation rules for a given board ID.
 */
export function getBoardAutomations(boardId: string): AutomationRule[] {
  if (typeof window === "undefined") {
    return memoryRulesCache.get(boardId) ?? INITIAL_AUTOMATION_RULES;
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${boardId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryRulesCache.set(boardId, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[automation-storage] Error reading localStorage:", err);
  }

  // Fallback to initial default rules
  const initial = INITIAL_AUTOMATION_RULES.map((r) => ({
    ...r,
    boardId,
  }));
  memoryRulesCache.set(boardId, initial);
  return initial;
}

/**
 * Save automation rules for a given board ID and broadcast change event.
 */
export function saveBoardAutomations(boardId: string, rules: AutomationRule[]): void {
  memoryRulesCache.set(boardId, rules);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${boardId}`, JSON.stringify(rules));
      window.dispatchEvent(
        new CustomEvent("automations:updated", {
          detail: { boardId, rules },
        })
      );
    } catch (err) {
      console.warn("[automation-storage] Error saving to localStorage:", err);
    }
  }
}

/**
 * Toggle an automation on or off.
 */
export function toggleBoardAutomation(
  boardId: string,
  ruleId: string,
  enabled: boolean
): AutomationRule[] {
  const current = getBoardAutomations(boardId);
  const updated = current.map((r) => (r.id === ruleId ? { ...r, enabled } : r));
  saveBoardAutomations(boardId, updated);
  return updated;
}

/**
 * Add or update a rule on a board.
 */
export function upsertBoardAutomation(boardId: string, rule: AutomationRule): AutomationRule[] {
  const current = getBoardAutomations(boardId);
  const existingIdx = current.findIndex((r) => r.id === rule.id);
  let updated: AutomationRule[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = rule;
  } else {
    updated = [rule, ...current];
  }
  saveBoardAutomations(boardId, updated);
  return updated;
}

/**
 * Delete a rule from a board.
 */
export function deleteBoardAutomation(boardId: string, ruleId: string): AutomationRule[] {
  const current = getBoardAutomations(boardId);
  const updated = current.filter((r) => r.id !== ruleId);
  saveBoardAutomations(boardId, updated);
  return updated;
}

/**
 * Record an execution log entry.
 */
export function recordAutomationLog(boardId: string, log: AutomationAuditLog): void {
  const currentLogs = getAutomationLogs(boardId);
  const updated = [log, ...currentLogs].slice(0, 50); // Keep last 50
  memoryLogsCache.set(boardId, updated);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${LOGS_STORAGE_PREFIX}${boardId}`, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent("automations:log-added", {
          detail: { boardId, log },
        })
      );
    } catch (err) {
      console.warn("[automation-storage] Error saving log to localStorage:", err);
    }
  }
}

/**
 * Retrieve execution history logs for a board.
 */
export function getAutomationLogs(boardId: string): AutomationAuditLog[] {
  if (typeof window === "undefined") {
    return memoryLogsCache.get(boardId) ?? [];
  }

  try {
    const raw = localStorage.getItem(`${LOGS_STORAGE_PREFIX}${boardId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryLogsCache.set(boardId, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[automation-storage] Error reading logs from localStorage:", err);
  }

  return memoryLogsCache.get(boardId) ?? [];
}
