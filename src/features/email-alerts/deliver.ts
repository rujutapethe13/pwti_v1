import "server-only";

import { isValidEmail } from "./predicate";
import { renderDigestEmail } from "./template";
import type { AlertCandidate } from "./types";

/**
 * Digest delivery.
 *
 * One email per recipient, covering all of that recipient's overdue jobs and
 * unpaid invoices. Kept separate from run.ts so the delivery rules can be unit
 * tested with a stub sender (src/tests/unit/email-alerts.test.ts):
 *
 *   - a recipient with no valid address is skipped, not sent to;
 *   - a failing send is counted and logged, never thrown, so the remaining
 *     recipients still get their digest;
 *   - a dry run reports what would be sent and writes nothing.
 */

export interface SendRequest {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export type Sender = (request: SendRequest) => Promise<SendResult>;

export interface DigestGroup {
  email: string;
  candidates: AlertCandidate[];
}

export interface DeliverOptions {
  today: string;
  dryRun: boolean;
  /** Redirect every digest to this address (testing); empty means no override. */
  overrideTo?: string;
  appUrl: string;
  sender: Sender;
}

export interface DeliverResult {
  sent: number;
  failed: number;
  skipped: number;
  warnings: string[];
  /** Lines the caller must persist to the alert log. */
  logged: Array<{ email: string; candidate: AlertCandidate }>;
}

export async function deliverGroups(
  groups: Iterable<[string, AlertCandidate[]]>,
  options: DeliverOptions,
): Promise<DeliverResult> {
  const result: DeliverResult = { sent: 0, failed: 0, skipped: 0, warnings: [], logged: [] };
  const overrideTo = (options.overrideTo ?? "").trim();
  const overrideValid = overrideTo !== "" && isValidEmail(overrideTo);

  for (const [email, groupCandidates] of groups) {
    const overdueJobs = groupCandidates.filter((c) => c.alertType === "job_overdue");
    const invoices = groupCandidates.filter((c) => c.alertType === "invoice_uncleared");

    if (!isValidEmail(email)) {
      result.skipped++;
      result.warnings.push(`skipped digest: "${email}" is not a valid email address`);
      continue;
    }

    if (options.dryRun) {
      result.sent++;
      result.warnings.push(
        `[dry-run] would send "${overdueJobs.length} overdue job(s), ${invoices.length} invoice(s)" to ${email}`,
      );
      continue;
    }

    const { subject, html, text } = renderDigestEmail({
      recipientEmail: email,
      overdueJobs,
      invoices,
      appUrl: options.appUrl,
    });
    const to = overrideValid ? overrideTo : email;

    let sendResult: SendResult;
    try {
      sendResult = await options.sender({ to, subject, html, text });
    } catch (err) {
      // A throwing sender is a failed send, not a failed run.
      sendResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!sendResult.ok) {
      result.failed++;
      result.warnings.push(`digest to ${email} failed: ${sendResult.error ?? "unknown error"}`);
      continue; // Not logged — the next run retries.
    }

    result.sent++;
    for (const candidate of groupCandidates) {
      result.logged.push({ email, candidate });
    }
    if (to !== email) {
      result.warnings.push(`digest for ${email} redirected to ${to} (EMAIL_OVERRIDE_TO)`);
    }
  }

  return result;
}