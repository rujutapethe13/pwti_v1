function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPendingEmailTemplate(vars: {
  workspace: string;
  board: string;
  job: string;
  link: string;
  time: string;
}): { html: string; text: string } {
  const workspace = escapeHtml(vars.workspace);
  const board = escapeHtml(vars.board);
  const job = escapeHtml(vars.job);
  const link = escapeHtml(vars.link);
  const time = escapeHtml(vars.time);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Job Pending</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Job/Task Pending</h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Workspace</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${workspace}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Board</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${board}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Job/Task</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${job}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 8px; border: 1px solid #ddd;">Pending</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time it became pending</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${time}</td></tr>
  </table>
  <p style="margin-top: 16px;"><a href="${link}">View Job/Board</a></p>
</body>
</html>`;

  const text = `Job/Task Pending

Workspace: ${vars.workspace}
Board: ${vars.board}
Job/Task: ${vars.job}
Status: Pending
Time it became pending: ${vars.time}
Link: ${vars.link}`;

  return { html, text };
}
