import { NextRequest, NextResponse } from "next/server";
import {
  listTriggers,
  getTrigger,
  createTrigger,
  updateTrigger,
  toggleTrigger,
  deleteTrigger,
} from "@/features/triggers/storage";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const triggers = await listTriggers();
    return NextResponse.json({ triggers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body || !body.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const trigger = await createTrigger({
      name: body.name,
      description: body.description || "",
      enabled: body.enabled !== false,
      scopeMode: body.scopeMode || "selected",
      scopeWorkspaces: Array.isArray(body.scopeWorkspaces) ? body.scopeWorkspaces : [],
      scopeBoards: Array.isArray(body.scopeBoards) ? body.scopeBoards : [],
      runMode: body.runMode || "manual",
      conditions: body.conditions || { logic: "AND", conditions: [] },
      actions: Array.isArray(body.actions) ? body.actions : [],
      emailSettings: {
        enabled: !!body.emailSettings?.enabled,
        toType: body.emailSettings?.toType || "static",
        to: Array.isArray(body.emailSettings?.to) ? body.emailSettings.to : [],
        toField: body.emailSettings?.toField || "",
        cc: Array.isArray(body.emailSettings?.cc) ? body.emailSettings.cc : [],
        subject: body.emailSettings?.subject || "",
        body: body.emailSettings?.body || "",
        format: body.emailSettings?.format || "per_item",
        frequencyHours: Number(body.emailSettings?.frequencyHours) || 24,
      },
    });

    if (!trigger) {
      return NextResponse.json({ error: "Failed to create trigger" }, { status: 500 });
    }

    return NextResponse.json({ trigger }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    if (typeof body.enabled === "boolean") {
      const ok = await toggleTrigger(body.id, body.enabled);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Failed to toggle trigger" }, { status: 500 });
    }

    const updates: Record<string, unknown> = {};
    const allowed: (keyof typeof updates)[] = [
      "name", "description", "scopeMode", "scopeWorkspaces", "scopeBoards", "runMode", "conditions", "actions",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (body.emailSettings) {
      updates.emailSettings = body.emailSettings;
    }

    const trigger = await updateTrigger(body.id, updates as any);
    if (!trigger) {
      return NextResponse.json({ error: "Failed to update trigger" }, { status: 500 });
    }

    return NextResponse.json({ trigger });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const ok = await deleteTrigger(id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Failed to delete trigger" }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
