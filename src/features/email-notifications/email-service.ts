
import { getEmailProvider } from './providers';
import { renderPendingEmailTemplate } from './template';
import { EmailNotificationPayload } from './types';

export class EmailService {
  private provider = getEmailProvider();

  /**
   * Sends a pending status notification email.
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

    return this.provider.sendMail(to, subject, html, text);
  }

  /**
   * Changes the email provider.
   */
  setProvider(providerType: string) {
    this.provider = getEmailProvider(providerType);
  }
}

export const emailService = new EmailService();
