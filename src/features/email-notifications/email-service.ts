import { renderPendingEmailTemplate } from './template';
import type { EmailNotificationPayload } from './types';
import { resendProvider, type SendEmailInput } from './resend';

export class EmailService {
  /**
   * Sends a pending status notification email via Resend.
   */
  async sendPendingNotification(
    to: string[],
    payload: EmailNotificationPayload
  ) {
    const { html, text } = renderPendingEmailTemplate({
      workspace: payload.workspaceName,
      board: payload.boardName,
      job: payload.jobName,
      link: payload.link,
      time: payload.time,
    });

    const subject = `Pending: ${payload.jobName || 'Production Update'}`;

    const input: SendEmailInput = { to, subject, html, text };
    return resendProvider.send(input);
  }
}

export const emailService = new EmailService();
