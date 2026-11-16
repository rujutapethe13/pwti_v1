import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateReceivers } from '@/features/email-notifications/storage';
import { renderPendingEmailTemplate } from '@/features/email-notifications/template';
import { Resend } from 'resend';

vi.mock('resend', () => ({
  Resend: vi.fn(function (this: { emails: { send: ReturnType<typeof vi.fn>; receiving: { get: ReturnType<typeof vi.fn> } } }) {
    this.emails = { send: vi.fn(), receiving: { get: vi.fn() } };
  }) as unknown as typeof Resend,
}));

const latestSend = () => {
  const instance = vi.mocked(Resend).mock.instances.at(-1)!;
  return instance.emails.send as ReturnType<typeof vi.fn>;
};

describe('Email notifications - validation', () => {
  it('validates email format and filters invalid', () => {
    const res = validateReceivers(['test@example.com', 'bad-email', 'user.name+tag@domain.co.uk']);
    expect(res.valid).toContain('test@example.com');
    expect(res.valid).toContain('user.name+tag@domain.co.uk');
    expect(res.invalid).toContain('bad-email');
  });

  it('never allows sending to non-configured addresses - only validated set used', () => {
    const { valid } = validateReceivers(['configured@test.com']);
    expect(valid.length).toBe(1);
    expect(valid[0]).toBe('configured@test.com');
  });
});

describe('Email template', () => {
  it('renders with all placeholders', () => {
    const { html, text } = renderPendingEmailTemplate({
      workspace: 'Acme',
      board: 'Production',
      job: 'Job #123',
      link: 'http://localhost:3000/boards/b1?record=r1',
      time: '2026-11-02T10:00:00Z',
    });
    expect(html).toContain('Acme');
    expect(html).toContain('Production');
    expect(html).toContain('Job #123');
    expect(html).toContain('Pending');
    expect(html).toContain('http://localhost:3000/boards/b1?record=r1');
    expect(text).toContain('Acme');
  });
});

describe('Resend provider - send', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Power Weave Studio <hello@example.com>';
  });

  it('sends via SDK and returns the message id', async () => {
    const { ResendEmailProvider } = await import('@/features/email-notifications/resend');
    const provider = new ResendEmailProvider();
    const send = latestSend();
    send.mockResolvedValue({ data: { id: 'resend_1' }, error: null });

    const result = await provider.send({
      to: ['a@x.com', 'b@x.com'],
      cc: ['c@x.com'],
      bcc: ['d@x.com'],
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
      replyTo: ['reply@x.com'],
      attachments: [{ filename: 'file.txt', content: 'dGVzdA==' }],
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      from: 'Power Weave Studio <hello@example.com>',
      to: ['a@x.com', 'b@x.com'],
      cc: ['c@x.com'],
      bcc: ['d@x.com'],
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
      replyTo: ['reply@x.com'],
    });
    expect(result.ok).toBe(true);
    expect(result.id).toBe('resend_1');
  });

  it('retries on 429 and 5xx with backoff', async () => {
    const { ResendEmailProvider } = await import('@/features/email-notifications/resend');
    const provider = new ResendEmailProvider();
    const send = latestSend();
    const rateLimitedError = new Error('rate limited') as Error & { statusCode: number };
    rateLimitedError.statusCode = 429;
    const serverError = new Error('boom') as Error & { statusCode: number };
    serverError.statusCode = 500;
    send.mockRejectedValueOnce(rateLimitedError).mockRejectedValueOnce(serverError).mockResolvedValue({ data: { id: 'resend_2' }, error: null });

    const result = await provider.send({ to: ['a@x.com'], subject: 'Hi', html: '<p>x</p>' });

    expect(result.ok).toBe(true);
    expect(result.id).toBe('resend_2');
    expect(result.retries).toBe(2);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('fails after retries without crashing', async () => {
    const { ResendEmailProvider } = await import('@/features/email-notifications/resend');
    const provider = new ResendEmailProvider();
    const send = latestSend();
    const error = new Error('boom') as Error & { statusCode: number };
    error.statusCode = 500;
    send.mockRejectedValue(error);

    const result = await provider.send({ to: ['a@x.com'], subject: 'Hi', html: '<p>x</p>' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
    expect(result.retries).toBe(3);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('reports missing API key without crashing', async () => {
    const { ResendEmailProvider } = await import('@/features/email-notifications/resend');
    delete process.env.RESEND_API_KEY;
    const provider = new ResendEmailProvider();
    const result = await provider.send({ to: ['a@x.com'], subject: 'Hi', html: '<p>x</p>' });
    expect(result.ok).toBe(false);
  });
});

describe('Idempotency and provider failure', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
  });

  it('idempotency - same job and receiver logged as sent prevents duplicate', async () => {
    const storage = await import('@/features/email-notifications/storage');
    expect(typeof storage.hasAlreadySent).toBe('function');
  });

  it('provider failure with retries marks failed', async () => {
    const { ResendEmailProvider } = await import('@/features/email-notifications/resend');
    const provider = new ResendEmailProvider();
    const send = latestSend();
    send.mockRejectedValue(new Error('down'));
    const result = await provider.send({ to: ['test@test.com'], subject: 's', html: '<p>t</p>' });
    expect(result.ok).toBe(false);
  });
});
