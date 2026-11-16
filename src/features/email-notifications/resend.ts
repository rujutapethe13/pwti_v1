import { Resend } from 'resend';
import crypto from 'node:crypto';
import { storeInboundEmail } from './inbound-storage';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const SIG_TOLERANCE_MS = 5 * 60 * 1000;
const DEFAULT_FROM = 'Power Weave Studio <no-reply@powerweave.studio>';

export interface SendEmailInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  retries?: number;
}

export interface StoredInboundEmail {
  id: string;
  resendId: string;
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  receivedAt: string;
  headers: Record<string, string>;
  attachments: Array<{
    id: string;
    filename: string | null;
    contentType: string | null;
    size: number;
    contentId: string | null;
    disposition: string | null;
  }>;
}

export class ResendEmailProvider {
  private client: Resend | null;
  private from: string;

  constructor(apiKey?: string, from?: string) {
    const key = apiKey ?? process.env.RESEND_API_KEY;
    this.client = key ? new Resend(key) : null;
    this.from = from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM;
  }

  async send(input: SendEmailInput): Promise<SendResult> {
    if (!this.client) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }
    const toList = Array.isArray(input.to) ? input.to : [input.to];

    const payload: Parameters<Resend['emails']['send']>[0] = {
      from: this.from,
      to: toList,
      subject: input.subject,
      html: input.html,
    };

    if (input.cc) {
      payload.cc = Array.isArray(input.cc) ? input.cc : [input.cc];
    }
    if (input.bcc) {
      payload.bcc = Array.isArray(input.bcc) ? input.bcc : [input.bcc];
    }
    if (input.text) {
      payload.text = input.text;
    }
    if (input.replyTo) {
      payload.replyTo = Array.isArray(input.replyTo) ? input.replyTo : [input.replyTo];
    }
    if (input.attachments && input.attachments.length > 0) {
      payload.attachments = input.attachments.map((a) => ({
        filename: a.filename,
        content:
          typeof a.content === 'string'
            ? a.content
            : Buffer.from(a.content).toString('base64'),
        content_type: a.contentType,
      }));
    }

    let lastError: unknown;
    let retries = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data, error } = await this.client.emails.send(payload);
        if (error) {
          throw new Error(typeof error === 'string' ? error : String(error.message ?? error));
        }
        return { ok: true, id: data?.id, retries };
      } catch (err) {
        lastError = err;
        const status = (err as { statusCode?: number })?.statusCode;
        const retryable =
          status === 429 || (typeof status === 'number' && status >= 500 && status < 600);
        if (!retryable || attempt === MAX_RETRIES) {
          break;
        }
        retries = attempt + 1;
        await this.sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    console.error('[resend] send failed after retries:', message);
    return { ok: false, error: message, retries };
  }

  verifySignature(rawBody: string | Buffer, signature: string | null): boolean {
    if (!signature) {
      return false;
    }
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      return false;
    }

    let timestamp: string | null = null;
    let v1: string | null = null;
    for (const part of signature.split(',')) {
      const sep = part.indexOf('=');
      if (sep === -1) {
        continue;
      }
      const key = part.slice(0, sep).trim();
      const value = part.slice(sep + 1).trim();
      if (key === 't') {
        timestamp = value;
      } else if (key === 'v1') {
        v1 = value;
      }
    }

    if (!timestamp || !v1) {
      return false;
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts * 1000) > SIG_TOLERANCE_MS) {
      return false;
    }

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString() : rawBody;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  async handleInbound(
    event: { type: string; data: Record<string, unknown> },
    _rawBody?: string
  ): Promise<{ processed: boolean; id?: string; error?: string }> {
    try {
      if (!this.client) {
        throw new Error('RESEND_API_KEY not configured');
      }
      if (event.type !== 'email.received') {
        return { processed: false };
      }

      const data = event.data as Record<string, unknown>;
      const emailId = data.email_id as string | undefined;
      if (!emailId) {
        return { processed: false, error: 'missing email_id' };
      }

      const { data: email, error } = await this.client.emails.receiving.get(emailId);
      if (error || !email) {
        throw new Error(typeof error === 'string' ? error : String(error?.message ?? 'fetch failed'));
      }

      const stored = await storeInboundEmail({
        resendId: email.id,
        messageId: email.message_id,
        from: email.from,
        to: Array.isArray(email.to) ? email.to : [],
        subject: email.subject ?? '',
        html: email.html ?? null,
        text: email.text ?? null,
        receivedAt: email.created_at,
        headers: email.headers ?? {},
        attachments: Array.isArray(email.attachments)
          ? email.attachments.map((a) => ({
              id: a.id,
              filename: a.filename ?? null,
              contentType: a.content_type ?? null,
              size: a.size,
              contentId: a.content_id ?? null,
              disposition: a.content_disposition ?? null,
            }))
          : [],
      });

      return { processed: true, id: stored.id ?? undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[resend] inbound handling failed:', message);
      return { processed: false, error: message };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const resendProvider = new ResendEmailProvider();
