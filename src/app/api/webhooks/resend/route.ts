import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resendProvider } from '@/features/email-notifications/resend';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('resend-signature');
  const rawBody = await req.text();

  if (!resendProvider.verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: { type: string; data: Record<string, unknown> } | null = null;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (event && event.type === 'email.received') {
    await resendProvider.handleInbound(event, rawBody);
  }

  return NextResponse.json({ received: true });
}
