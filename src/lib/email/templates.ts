import "server-only";

/**
 * Email templates for PowerWeave Studio.
 *
 * Each function returns { subject, html, text }. All user-provided values
 * are HTML-escaped to prevent header injection / XSS in rendered email.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\n");
}

/** Access request notification to the board owner (approve/deny links). */
export function accessRequestTemplate(vars: {
  requesterName: string;
  requesterEmail: string;
  boardName: string;
  approveUrl: string;
  denyUrl: string;
  requestId: string;
}): { subject: string; html: string; text: string } {
  const requesterName = escapeHtml(vars.requesterName);
  const requesterEmail = escapeHtml(vars.requesterEmail);
  const boardName = escapeHtml(vars.boardName);
  const requestId = escapeHtml(vars.requestId);
  const approveUrl = escapeHtml(vars.approveUrl);
  const denyUrl = escapeHtml(vars.denyUrl);

  const subject = `Board access request: "${boardName}"`;
  const html = `
<h2>Board access request</h2>
<p><strong>${requesterName}</strong> (${requesterEmail}) is requesting access to the board <strong>${boardName}</strong>.</p>
<table cellpadding="8" style="margin: 16px 0; border-collapse: collapse;">
  <tr><td style="border:1px solid #ddd;padding:8px;"><strong>Board:</strong></td><td style="border:1px solid #ddd;padding:8px;">${boardName}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:8px;"><strong>Requested by:</strong></td><td style="border:1px solid #ddd;padding:8px;">${requesterName} (${requesterEmail})</td></tr>
  <tr><td style="border:1px solid #ddd;padding:8px;"><strong>Request ID:</strong></td><td style="border:1px solid #ddd;padding:8px;">${requestId}</td></tr>
</table>
<p style="margin: 20px 0;">
  <a href="${approveUrl}" style="background:#10b981;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-right:12px;">Approve</a>
  <a href="${denyUrl}" style="background:#ef4444;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deny</a>
</p>
`;
  const text = `Board access request

${requesterName} (${requesterEmail}) is requesting access to the board "${boardName}".

Board: ${boardName}
Requested by: ${requesterName} (${requesterEmail})
Request ID: ${requestId}

Approve: ${approveUrl}
Deny: ${denyUrl}
`;

  return { subject, html, text };
}

/** Access decision (approved/declined) sent to the requester. */
export function accessDecisionTemplate(vars: {
  decision: "approved" | "declined";
  boardId: string;
  boardName?: string;
  requesterEmail: string;
}): { subject: string; html: string; text: string } {
  const decision = escapeHtml(vars.decision);
  const boardId = escapeHtml(vars.boardId);
  const boardName = escapeHtml(vars.boardName ?? boardId);
  const requesterEmail = escapeHtml(vars.requesterEmail);

  const subject = `Access request ${decision}`;
  const html = `
<p>Your access request for board <strong>${boardName}</strong> has been ${decision}.</p>
${
  vars.decision === "approved"
    ? `<p>You can now open the board in Powerweave Studio OS.</p>`
    : `<p>If you need access, please contact a workspace administrator.</p>`
}
`;
  const text = `Your access request for board ${boardName} has been ${decision}.\n${
    vars.decision === "approved"
      ? "You can now open the board in Powerweave Studio OS."
      : "If you need access, please contact a workspace administrator."
  }`;

  return { subject, html, text };
}

/** Password reset link email. */
export function passwordResetTemplate(vars: { resetUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const resetUrl = escapeHtml(vars.resetUrl);
  const subject = "Reset your password";
  const html = `
<p>We received a request to reset your password.</p>
<p>
  <a href="${resetUrl}" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Reset password</a>
</p>
<p>This link can be used once and expires in 30 minutes.</p>
<p>If you did not request this, you can ignore this email — your password will not change.</p>
`;
  const text = `We received a request to reset your password.

Reset password: ${resetUrl}

This link can be used once and expires in 30 minutes.
If you did not request this, you can ignore this email — your password will not change.
`;

  return { subject, html, text };
}

/** Password changed confirmation email. */
export function passwordChangedTemplate(vars: { resetUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const resetUrl = escapeHtml(vars.resetUrl);
  const subject = "Your password was changed";
  const html = `
<p>Your password was changed.</p>
<p>If this wasn't you, reset it immediately:
  <a href="${resetUrl}" style="color:#4f46e5;text-decoration:underline;">reset your password</a>.
</p>
<p>All sessions have been signed out.</p>
`;
  const text = `Your password was changed.

If this wasn't you, reset it immediately: ${resetUrl}

All sessions have been signed out.
`;

  return { subject, html, text };
}

/** Job / task pending notification (board automation). */
export function jobPendingTemplate(vars: {
  workspace: string;
  board: string;
  job: string;
  link: string;
  time: string;
}): { subject: string; html: string; text: string } {
  const workspace = escapeHtml(vars.workspace);
  const board = escapeHtml(vars.board);
  const job = escapeHtml(vars.job);
  const link = escapeHtml(vars.link);
  const time = escapeHtml(vars.time);

  const subject = `Pending: ${job || "Production Update"}`;
  const html = `
<h2>Job/Task Pending</h2>
<table style="width: 100%; border-collapse: collapse;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Workspace</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${workspace}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Board</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${board}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Job/Task</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${job}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 8px; border: 1px solid #ddd;">Pending</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time it became pending</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${time}</td></tr>
</table>
<p style="margin-top: 16px;"><a href="${link}">View Job/Board</a></p>
`;
  const text = `Job/Task Pending

Workspace: ${vars.workspace}
Board: ${vars.board}
Job/Task: ${vars.job}
Status: Pending
Time it became pending: ${vars.time}
Link: ${vars.link}`;

  return { subject, html, text };
}

/** Generic trigger test email. */
export function triggerTestTemplate(vars: { to?: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Powerweave Studio OS — Trigger test email";
  const html = `
<h2>Trigger test email</h2>
<p>This is a sample email from your custom trigger system.</p>
<p>If you received it, email sending is working.</p>
`;
  const text = `Trigger test email from Powerweave Studio OS

This is a sample email from your custom trigger system.
If you received it, email sending is working.
`;

  return { subject, html, text };
}
