import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { normalizeEmail, shouldSendAlert } from "./predicate";
import type { AlertLogEntry, AlertType } from "./types";

/**
 * Dedupe + cadence against public.alert_notification_logs.
 *
 * One row = one alert sent to one recipient for one record on one day. The
 * unique (record_id, alert_type, recipient_email, sent_on) constraint makes a
 * second cron run on the same day a no-op even if two requests race.
 */

export async function loadLogsForRecords(
  recordIds: string[],
): Promise<Map<string, AlertLogEntry[]>> {
  const byRecord = new Map<string, AlertLogEntry[]>();
  if (recordIds.length === 0) return byRecord;

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("alert_notification_logs")
    .select("record_id, alert_type, recipient_email, sent_on")
    .in("record_id", recordIds);
  if (error) {
    // A missing table (migration not applied yet) must not crash the run; the
    // worst case without logs is duplicate reminders, and the run reports it.
    console.error("[email-alerts] failed to load alert log:", error.message);
    return byRecord;
  }

  for (const row of data ?? []) {
    const list = byRecord.get(row.record_id as string) ?? [];
    list.push({
      recordId: row.record_id as string,
      alertType: row.alert_type as AlertType,
      recipientEmail: normalizeEmail(row.recipient_email as string),
      sentOn: row.sent_on as string,
    });
    byRecord.set(row.record_id as string, list);
  }
  return byRecord;
}

/** Filter one recipient's candidates through the cadence rule. */
export function applyCadence(
  candidates: Array<{ recordId: string; alertType: AlertType }>,
  logsByRecord: Map<string, AlertLogEntry[]>,
  recipientEmail: string,
  today: string,
  repeatIntervalDays: number,
): Array<{ recordId: string; alertType: AlertType }> {
  const email = normalizeEmail(recipientEmail);
  return candidates.filter((candidate) => {
    const logs = (logsByRecord.get(candidate.recordId) ?? []).filter(
      (log) => log.alertType === candidate.alertType && log.recipientEmail === email,
    );
    return shouldSendAlert(logs, today, repeatIntervalDays);
  });
}

/** Persist one sent alert line. Returns false when it was already recorded. */
export async function recordSentLog(entry: {
  organizationId: string;
  recordId: string;
  boardId: string | null;
  clientId: string | null;
  alertType: AlertType;
  recipientEmail: string;
  sentOn: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("alert_notification_logs").insert({
    organization_id: entry.organizationId,
    record_id: entry.recordId,
    board_id: entry.boardId,
    client_id: entry.clientId,
    alert_type: entry.alertType,
    recipient_email: normalizeEmail(entry.recipientEmail),
    sent_on: entry.sentOn,
    payload: entry.payload,
  });

  if (error) {
    // 23505 = unique violation → a same-day run already logged this alert.
    if (error.code === "23505") return false;
    console.error("[email-alerts] failed to record alert log:", error.message);
    return true; // The email went out; log failure must not block the digest.
  }
  return true;
}