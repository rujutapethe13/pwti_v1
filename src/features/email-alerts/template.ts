/**
 * Digest email template — one email per recipient covering all their overdue
 * jobs and unpaid invoices.
 *
 * Constraints honoured here:
 *   - Table-based layout with inline CSS only (Outlook + Gmail safe).
 *   - Every job / client / user string is HTML-escaped before insertion.
 *   - A plain-text alternative is generated from the same data.
 */

import type { AlertCandidate, DigestPayload } from "./types";

const BRAND_GREEN = "#15803d";
const BRAND_DARK = "#111827";
const BRAND_RED = "#b91c1c";
const BRAND_AMBER = "#b45309";
const BRAND_MUTED = "#6b7280";
const BRAND_BORDER = "#e5e7eb";

const APP_NAME = "Powerweave Studio OS";
const SUPPORT_SIGNATURE = "Powerweave Studio OS — automated alerts";

export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function boardLink(candidate: AlertCandidate, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const path = candidate.boardSlug ? `/${candidate.boardSlug}` : `/boards/${candidate.boardId}`;
  return `${base}${path}`;
}

function clientLink(candidate: AlertCandidate, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/client-360?client=${encodeURIComponent(candidate.clientId)}`;
}

interface Row {
  title: string;
  board: string;
  client: string;
  dateLabel: string;
  date: string;
  daysOverdue: number;
  amount: string | null;
  link: string;
}

function toRows(candidates: AlertCandidate[], appUrl: string, kind: "job" | "invoice"): Row[] {
  return candidates.map((c) => ({
    title: c.jobTitle,
    board: c.boardName,
    client: c.clientName,
    dateLabel: kind === "job" ? "Deadline" : "Invoice due",
    date: c.dueDate,
    daysOverdue: c.daysOverdue,
    amount: kind === "invoice" ? formatAmount(c.invoiceAmount) : null,
    link: kind === "job" ? boardLink(c, appUrl) : clientLink(c, appUrl),
  }));
}

function sectionRowsHtml(rows: Row[]): string {
  const head = `
    <tr>
      <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND_MUTED};border-bottom:2px solid ${BRAND_BORDER};">Job</th>
      <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND_MUTED};border-bottom:2px solid ${BRAND_BORDER};">Board / Client</th>
      <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND_MUTED};border-bottom:2px solid ${BRAND_BORDER};">Due date</th>
      <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND_MUTED};border-bottom:2px solid ${BRAND_BORDER};">Days overdue</th>
      <th style="padding:8px 10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${BRAND_MUTED};border-bottom:2px solid ${BRAND_BORDER};">Amount</th>
    </tr>`;

  const body = rows
    .map(
      (r) => `
    <tr>
      <td style="padding:10px;font-size:14px;border-bottom:1px solid ${BRAND_BORDER};">
        <a href="${escapeHtml(r.link)}" style="color:${BRAND_DARK};font-weight:600;text-decoration:none;">${escapeHtml(r.title)}</a>
      </td>
      <td style="padding:10px;font-size:13px;border-bottom:1px solid ${BRAND_BORDER};color:${BRAND_MUTED};">
        ${escapeHtml(r.board)}<br />${escapeHtml(r.client)}
      </td>
      <td style="padding:10px;font-size:13px;border-bottom:1px solid ${BRAND_BORDER};white-space:nowrap;">${escapeHtml(r.date ? formatDate(r.date) : "—")}</td>
      <td style="padding:10px;font-size:14px;font-weight:700;color:${BRAND_RED};border-bottom:1px solid ${BRAND_BORDER};">${r.daysOverdue}</td>
      <td style="padding:10px;font-size:13px;border-bottom:1px solid ${BRAND_BORDER};white-space:nowrap;">${r.amount == null ? "" : escapeHtml(r.amount)}</td>
    </tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;max-width:640px;">${head}${body}</table>`;
}

function sectionHtml(title: string, accent: string, rows: Row[]): string {
  if (rows.length === 0) return "";
  return `
  <div style="margin:28px 0 8px 0;">
    <p style="margin:0;font-size:14px;font-weight:700;color:${accent};">${escapeHtml(title)} (${rows.length})</p>
  </div>
  ${sectionRowsHtml(rows)}`;
}

/** Plain-text digest built from the same rows. */
function buildPlainText(payload: DigestPayload): string {
  const lines: string[] = [];
  lines.push(`${APP_NAME} — action needed`);
  lines.push("");
  lines.push(`Overdue jobs: ${payload.overdueJobs.length}`);
  for (const c of payload.overdueJobs) {
    lines.push(
      `  • ${c.jobTitle} — ${c.boardName} / ${c.clientName} — deadline ${formatDate(c.dueDate)} — ${c.daysOverdue} day(s) overdue`,
    );
    lines.push(`    ${boardLink(c, payload.appUrl)}`);
  }
  if (payload.invoices.length > 0) {
    lines.push("");
    lines.push(`Invoices not cleared: ${payload.invoices.length}`);
    for (const c of payload.invoices) {
      const amount = formatAmount(c.invoiceAmount);
      lines.push(
        `  • ${c.jobTitle} — ${c.boardName} / ${c.clientName} — invoice due ${formatDate(c.dueDate)} — ${c.daysOverdue} day(s) overdue${amount !== "—" ? ` — ${amount}` : ""}`,
      );
      lines.push(`    ${clientLink(c, payload.appUrl)}`);
    }
  }
  lines.push("");
  lines.push(SUPPORT_SIGNATURE);
  return lines.join("\n");
}

export function renderDigestEmail(payload: DigestPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const jobCount = payload.overdueJobs.length;
  const invoiceCount = payload.invoices.length;

  let subject: string;
  if (jobCount > 0 && invoiceCount > 0) {
    subject = `Action needed: ${jobCount} overdue job${jobCount === 1 ? "" : "s"}, ${invoiceCount} unpaid invoice${invoiceCount === 1 ? "" : "s"}`;
  } else if (jobCount > 0) {
    subject = `Action needed: ${jobCount} overdue job${jobCount === 1 ? "" : "s"}`;
  } else {
    subject = `Action needed: ${invoiceCount} unpaid invoice${invoiceCount === 1 ? "" : "s"}`;
  }

  const jobRows = toRows(payload.overdueJobs, payload.appUrl, "job");
  const invoiceRows = toRows(payload.invoices, payload.appUrl, "invoice");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f5f7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${BRAND_GREEN};padding:20px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;height:36px;background-color:${BRAND_DARK};border-radius:6px;text-align:center;vertical-align:middle;">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;">P</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;">${APP_NAME}</span>
                    <br />
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#dcfce7;">Overdue job &amp; invoice alerts</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${BRAND_DARK};">
                The following items need attention. This digest covers everything currently overdue for you.
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND_MUTED};">
                Reminders repeat every few days until the job is completed or the invoice is marked cleared.
              </p>
              ${sectionHtml("Past deadline", BRAND_RED, jobRows)}
              ${sectionHtml("Invoice not cleared", BRAND_AMBER, invoiceRows)}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background-color:#f9fafb;border-top:1px solid ${BRAND_BORDER};">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND_MUTED};">
                ${SUPPORT_SIGNATURE}. Manage this per client under Client 360 → Billing → Payment terms.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: buildPlainText(payload) };
}