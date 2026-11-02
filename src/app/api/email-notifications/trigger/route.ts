import { NextRequest, NextResponse } from 'next/server';
import { listAutomations } from '@/features/email-notifications/storage';
import { handleJobStatusChanged } from '@/features/email-notifications/trigger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { boardId } = body;
    if (!boardId) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }
    const automations = await listAutomations(boardId);
    await handleJobStatusChanged(body, automations as any);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
