import nodemailer from 'nodemailer';

export interface EmailProvider {
  sendMail(to: string | string[], subject: string, html: string, text?: string): Promise<{ success: boolean; id?: string; error?: string }>;
}

export class GmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Gmail with OAuth2 - use Gmail SMTP or Gmail API
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });
  }

  async sendMail(to: string | string[], subject: string, html: string, text?: string) {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.GMAIL_FROM || process.env.GMAIL_USER,
        to,
        subject,
        html,
        text,
      });
      return { success: true, id: info.messageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class OutlookProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Microsoft Graph / Outlook SMTP with OAuth2
    this.transporter = nodemailer.createTransport({
      host: process.env.OUTLOOK_SMTP_HOST || 'smtp.office365.com',
      port: Number(process.env.OUTLOOK_SMTP_PORT) || 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: process.env.OUTLOOK_USER,
        clientId: process.env.OUTLOOK_CLIENT_ID,
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
        refreshToken: process.env.OUTLOOK_REFRESH_TOKEN,
        tenantId: process.env.OUTLOOK_TENANT_ID,
      },
    });
  }

  async sendMail(to: string | string[], subject: string, html: string, text?: string) {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.OUTLOOK_FROM || process.env.OUTLOOK_USER,
        to,
        subject,
        html,
        text,
      });
      return { success: true, id: info.messageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export function getEmailProvider(type?: string): EmailProvider {
  const provider = (type || process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();
  if (provider === 'outlook') {
    return new OutlookProvider();
  }
  return new GmailProvider();
}
