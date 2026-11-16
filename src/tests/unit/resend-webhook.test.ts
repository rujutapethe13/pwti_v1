import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { Resend } from 'resend';

const receivingGet = vi.fn();

vi.mock('resend', () => {
  const ResendMock = vi.fn(function (this: { emails: { send: ReturnType<typeof vi.fn>; receiving: { get: ReturnType<typeof vi.fn> } } }) {
    this.emails = { send: vi.fn(), receiving: { get: receivingGet } };
  }) as unknown as typeof Resend;
  return { Resend: ResendMock };
});

const secret = 'whsec_test';
function signBody(body: string) {
  const t = String(Math.floor(Date.now() / 1000) - 10);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return { headers: { 'resend-signature': `t=${t},v1=${v1}` } };
}

function makeSupabase(existing: { id: string } | null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: existing, error: null })),
    insert: vi.fn(() => chain),
    single: vi.fn(() =>
      Promise.resolve({
        data: existing ? null : { id: 'inbound_1' },
        error: null,
      }),
    ),
  };
  return {
    from: vi.fn(() => chain),
    insertChain: chain as { insert: ReturnType<typeof vi.fn> },
  };
}

let currentSupabase = makeSupabase(null);
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => currentSupabase,
}));

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    currentSupabase = makeSupabase(null);
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_WEBHOOK_SECRET = secret;
  });

  function providerInstance() {
    return vi.mocked(Resend).mock.instances.at(-1)!;
  }

  it('verifies signature, fetches and stores inbound email, returns 200', async () => {
    const { POST } = await import('@/app/api/webhooks/resend/route');
    const getMock = vi.fn().mockResolvedValue({
      data: {
        id: 'em_1',
        message_id: 'msg_1',
        from: 'customer@example.com',
        to: ['hello@yourdomain.com'],
        subject: 'Job update',
        html: '<p>hi</p>',
        text: 'hi',
        created_at: '2026-11-16T05:00:00Z',
        headers: {},
        attachments: [],
      },
      error: null,
    });
    providerInstance().emails.receiving.get = getMock;

    const body = JSON.stringify({
      type: 'email.received',
      created_at: '2026-11-16T05:00:00Z',
      data: { email_id: 'em_1', message_id: 'msg_1' },
    });
    const { headers } = signBody(body);
    const req = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers,
      body,
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(getMock).toHaveBeenCalledWith('em_1');
    expect(currentSupabase.insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ message_id: 'msg_1', resend_id: 'em_1' }),
    );
  });

  it('rejects invalid signature with 401', async () => {
    const { POST } = await import('@/app/api/webhooks/resend/route');
    const body = JSON.stringify({ type: 'email.received', data: { email_id: 'em_1' } });
    const req = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers: { 'resend-signature': 't=1,v1=bad' },
      body,
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
    expect(receivingGet).not.toHaveBeenCalled();
  });

  it('ignores duplicate delivery (idempotent) and still returns 200', async () => {
    currentSupabase = makeSupabase({ id: 'existing' });
    const { POST } = await import('@/app/api/webhooks/resend/route');
    const body = JSON.stringify({
      type: 'email.received',
      data: { email_id: 'em_2', message_id: 'msg_2' },
    });
    const { headers } = signBody(body);
    const req = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers,
      body,
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(currentSupabase.insertChain.insert).not.toHaveBeenCalled();
  });

  it('ignores non-email.received events and returns 200', async () => {
    const { POST } = await import('@/app/api/webhooks/resend/route');
    const body = JSON.stringify({ type: 'email.bounced', data: {} });
    const { headers } = signBody(body);
    const req = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers,
      body,
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(currentSupabase.insertChain.insert).not.toHaveBeenCalled();
  });

  it('returns 200 even when inbound handling throws', async () => {
    receivingGet.mockRejectedValue(new Error('down'));
    const { POST } = await import('@/app/api/webhooks/resend/route');
    const body = JSON.stringify({ type: 'email.received', data: { email_id: 'em_1' } });
    const { headers } = signBody(body);
    const req = new Request('http://localhost/api/webhooks/resend', {
      method: 'POST',
      headers,
      body,
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
  });
});

describe('ResendEmailProvider.verifySignature', () => {
  const secret = 'whsec_test';
  const makeSignedBody = (body: string, opts: { t?: number; tampered?: boolean } = {}) => {
    const t = opts.t ?? Math.floor(Date.now() / 1000) - 10;
    const payload = opts.tampered ? body + 'x' : body;
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    return { body: payload, signature: `t=${t},v1=${v1}` };
  };

  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it('accepts a valid signature', async () => {
    const mod = await import('@/features/email-notifications/resend');
    const provider = new mod.ResendEmailProvider();
    const { body, signature } = makeSignedBody('{"a":1}');
    expect(provider.verifySignature(body, signature)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const mod = await import('@/features/email-notifications/resend');
    const provider = new mod.ResendEmailProvider();
    const { body, signature } = makeSignedBody('{"a":1}');
    expect(provider.verifySignature(body + 'x', signature)).toBe(false);
  });

  it('rejects an expired timestamp', async () => {
    const mod = await import('@/features/email-notifications/resend');
    const provider = new mod.ResendEmailProvider();
    const { body, signature } = makeSignedBody('{"a":1}', { t: Math.floor(Date.now() / 1000) - 1000 });
    expect(provider.verifySignature(body, signature)).toBe(false);
  });

  it('rejects a missing signature', async () => {
    const mod = await import('@/features/email-notifications/resend');
    const provider = new mod.ResendEmailProvider();
    expect(provider.verifySignature('{"a":1}', null)).toBe(false);
  });

  it('rejects when the webhook secret is not configured', async () => {
    const mod = await import('@/features/email-notifications/resend');
    const provider = new mod.ResendEmailProvider();
    delete process.env.RESEND_WEBHOOK_SECRET;
    const { body, signature } = makeSignedBody('{"a":1}');
    expect(provider.verifySignature(body, signature)).toBe(false);
    process.env.RESEND_WEBHOOK_SECRET = secret;
  });
});
