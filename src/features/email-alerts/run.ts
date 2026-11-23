import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { detectAlerts } from "./detect";
import { deliverGroups } from "./deliver";
import { applyCadence, loadLogsForRecords, recordSentLog } from "./dedupe";
import { todayIso } from "./predicate";
import { RecipientResolver } from "./recipients";
import { resendProvider } from "@/features/email-notifications/resend";
import { renderDigestEmail } from "./template";
import type { AlertCandidate, AlertRunSummary } from "./types";

/**
 * Daily digest run for overdue jobs and invoice-clearance alerts.
 *
 * Pipeline:
 *   1. Resolve the organization(s) to check.
 *   2. Detect candidates from the Client 360 snapshot + invoice columns.
 *   3. Resolve recipients per candidate (board admins, assignees, super admin).
 *   4. Apply dedupe/cadence so each recipient gets at most one digest per day
 *      and each alert repeats only every ALERT_REPEAT_INTERVAL_DAYS days.
 *   5. Send one digest email per recipient; log every line; failures are
 *      isolated so one bad address cannot stop the rest.
 *
 * Environment:
 *   ALERT_ORGANIZATION_ID       — org id(s) to check, comma separated. When
 *                                 unset, the owner's organizations are used.
 *   ALERT_REPEAT_INTERVAL_DAYS  — reminder cadence in days (default 7).
 *   ALERTS_DRY_RUN              — "true"/"1" logs what would be sent, sends
 *                                 nothing and writes no log rows.
 *   EMAIL_OVERRIDE_TO           — redirect every digest to this address
 *                                 (testing). Logs still record the original
 *                                 recipients.
 */

function resolveDryRun(explicit: boolean | undefined): boolean {
  if (typeof explicit === "boolean") return explicit;
  const flag = (process.env.ALERTS_DRY_RUN ?? "").toLowerCase();
  return flag === "true" || flag === "1";
}

function resolveIntervalDays(): number {
  const raw = Number(process.env.ALERT_REPEAT_INTERVAL_DAYS ?? "7");
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 7;
}

async function resolveOrganizationIds(explicit?: string): Promise<string[]> {
  if (explicit) return [explicit];
  const env = (process.env.ALERT_ORGANIZATION_ID ?? "").trim();
  if (env) {
    return env
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  // Fallback: the configured owner's organizations. This keeps the cron
  // working without extra config in a single-organization deployment.
  const ownerEmail = (process.env.OWNER_EMAIL || "rujutapethe@gmail.com").toLowerCase();
  const supabase = await createServiceClient();
  try {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail);
    const userIds = (profiles ?? []).map((p) => p.id as string);
    if (userIds.length === 0) return [];
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .in("user_id", userIds);
    return [...new Set((memberships ?? []).map((m) => m.organization_id as string))];
  } catch (err) {
    console.warn("[email-alerts] owner organization lookup failed:", err);
    return [];
  }
}

interface DigestGroup {
  email: string;
  candidates: AlertCandidate[];
}

export async function runAlertDigest(options?: {
  today?: string;
  organizationId?: string;
  dryRun?: boolean;
}): Promise<AlertRunSummary> {
  const today = options?.today ?? todayIso();
  const dryRun = resolveDryRun(options?.dryRun);
  const intervalDays = resolveIntervalDays();
  const overrideTo = (process.env.EMAIL_OVERRIDE_TO ?? "").trim();

  const summary: AlertRunSummary = {
    organizationIds: [],
    candidates: 0,
    recipients: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    warnings: [],
  };

  const organizationIds = await resolveOrganizationIds(options?.organizationId);
  summary.organizationIds = organizationIds;
  if (organizationIds.length === 0) {
    summary.warnings.push(
      "No organization resolved — set ALERT_ORGANIZATION_ID or check the owner account.",
    );
    return summary;
  }

  for (const organizationId of organizationIds) {
    let detection;
    try {
      detection = await detectAlerts(organizationId, today);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.warnings.push(`detection failed for org ${organizationId}: ${message}`);
      continue;
    }
    if (detection.unmatchedClientRows > 0) {
      const examples = detection.ambiguousClientNames.slice(0, 5).map((name) => `"${name}"`);
      const more = detection.ambiguousClientNames.length > 5 ? ` (+${detection.ambiguousClientNames.length - 5} more)` : "";
      summary.warnings.push(
        `org ${organizationId}: ${detection.unmatchedClientRows} job(s) skipped — client name matched no client or alias` +
          (examples.length ? `; ambiguous names (merge these clients in Client 360): ${examples.join(", ")}${more}` : ""),
      );
    }
    if (detection.boardsWithoutDueDate > 0) {
      summary.warnings.push(
        `org ${organizationId}: ${detection.boardsWithoutDueDate} board(s) have no Due Date column — deadline alerts need one`,
      );
    }
    if (!detection.termsAvailable) {
      summary.warnings.push(
        `org ${organizationId}: invoice reminders are off — apply migration 20261118070000 (payment_term_days)`,
      );
    }
    // Attribution health: records examined but none matched means the client
    // column resolves to names that are not in the client directory. That is a
    // configuration problem worth surfacing, not a silent zero.
    if (detection.recordsExamined > 0 && detection.recordsMatchedToClient === 0) {
      summary.warnings.push(
        `org ${organizationId}: ${detection.recordsExamined} job(s) examined but none matched a client — check the client column labels and client_360_clients`,
      );
    }
    const candidates = detection.candidates;
    summary.candidates += candidates.length;
    if (candidates.length === 0) continue;

    const logsByRecord = await loadLogsForRecords([...new Set(candidates.map((c) => c.recordId))]);

    // Group this org's candidates into one digest per recipient email.
    const groups = new Map<string, AlertCandidate[]>();
    const resolver = await RecipientResolver.create(organizationId);
    for (const candidate of candidates) {
      let resolved;
      try {
        resolved = await resolver.forCandidate(candidate);
      } catch (err) {
        summary.warnings.push(
          `recipient resolution failed for ${candidate.recordId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      summary.warnings.push(...resolved.warnings);
      for (const email of resolved.emails) {
        const allowed = applyCadence([candidate], logsByRecord, email, today, intervalDays);
        if (allowed.length === 0) {
          summary.skipped++;
          continue;
        }
        const group = groups.get(email) ?? [];
        group.push(candidate);
        groups.set(email, group);
      }
    }
    summary.recipients += groups.size;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pwti-v1.vercel.app";

    const delivery = await deliverGroups(groups, {
      today,
      dryRun,
      overrideTo,
      appUrl,
      sender: (request) => resendProvider.send(request),
    });
    summary.sent += delivery.sent;
    summary.failed += delivery.failed;
    summary.skipped += delivery.skipped;
    summary.warnings.push(...delivery.warnings);

    for (const { email, candidate } of delivery.logged) {
      await recordSentLog({
        organizationId,
        recordId: candidate.recordId,
        boardId: candidate.boardId,
        clientId: candidate.clientId,
        alertType: candidate.alertType,
        recipientEmail: email,
        sentOn: today,
        payload: {
          daysOverdue: candidate.daysOverdue,
          dueDate: candidate.dueDate,
          invoiceAmount: candidate.invoiceAmount,
          overrideTo: overrideTo || null,
        },
      });
    }
  }

  return summary;
}