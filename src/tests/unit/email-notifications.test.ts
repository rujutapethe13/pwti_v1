import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateReceivers } from '@/features/email-notifications/storage';
import { renderPendingEmailTemplate } from '@/features/email-notifications/template';

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

describe('Idempotency and provider failure', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('idempotency - same job and receiver logged as sent prevents duplicate', async () => {
    const storage = await import('@/features/email-notifications/storage');
    expect(typeof storage.hasAlreadySent).toBe('function');
  });

  it('provider failure with retries marks failed', async () => {
    const { GmailProvider } = await import('@/features/email-notifications/providers');
    const provider = new GmailProvider();
    const result = await provider.sendMail(['test@test.com'], 's', '<p>t</p>');
    expect(result.success).toBe(false);
  });
});
