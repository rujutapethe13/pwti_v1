import { NextRequest, NextResponse } from 'next/server';
import { createAutomation, updateAutomation, toggleAutomation, listAutomations } from '@/features/email-notifications/storage';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get('boardId') || undefined;
    const automations = await listAutomations(boardId);
    return NextResponse.json({ automations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { boardId, workspaceId, organizationId, receiverEmails, enabled } = body;
    if (!boardId) {
      return NextResponse.json({ error: 'boardId required' }, { status: 400 });
    }
    if (!Array.isArray(receiverEmails) || receiverEmails.length === 0) {
      return NextResponse.json({ error: 'receiverEmails required' }, { status: 400 });
    }
    const automation = await createAutomation({ boardId, workspaceId, organizationId, receiverEmails, enabled });
    return NextResponse.json({ automation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const automation = await updateAutomation(id, updates);
    return NextResponse.json({ automation });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, enabled } = body;
    if (!id || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'id and enabled required' }, { status: 400 });
    }
    const automation = await toggleAutomation(id, enabled);
    return NextResponse.json({ automation });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
