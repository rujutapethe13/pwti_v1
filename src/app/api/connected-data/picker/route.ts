import { NextResponse } from "next/server";
import { searchTargetBoardRecords } from "@/features/boards/engine/actions/relationship-actions";
import { createRecord } from "@/features/boards/engine/actions";
import type { BoardRecord } from "@/features/boards/engine/types";

async function createBoardRecord(
  boardId: string,
  organizationId: string,
  workspaceId: string,
  title: string,
): Promise<{ data: BoardRecord | null; error: string | null; status: number }> {
  const formData = new FormData();
  formData.set("organizationId", organizationId);
  formData.set("workspaceId", workspaceId);
  formData.set("boardId", boardId);
  formData.set("title", title);
  formData.set("groupId", "");
  formData.set("cellValues", "{}");
  return createRecord(formData);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId");
  const organizationId = searchParams.get("organizationId");
  const workspaceId = searchParams.get("workspaceId");
  const query = searchParams.get("query") || "";
  const page = parseInt(searchParams.get("page") || "0", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (!boardId || !organizationId || !workspaceId) {
    return NextResponse.json({ data: null, error: "Missing required parameters", status: 400 });
  }

  const result = await searchTargetBoardRecords(boardId, query);
  if (!result.data) {
    return NextResponse.json({ data: [], totalCount: 0, hasMore: false });
  }

  const records: BoardRecord[] = result.data;
  const start = page * limit;
  const pageRecords = records.slice(start, start + limit);
  const totalCount = records.length;
  const hasMore = start + limit < totalCount;

  return NextResponse.json({
    data: {
      records: pageRecords.map((r) => ({
        recordId: r.id,
        title: r.title,
        subtitle: r.status,
        groupName: r.groupId ?? undefined,
        status: r.status,
      })),
      totalCount,
      hasMore,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { boardId, organizationId, workspaceId, title } = body;

    if (!boardId || !organizationId || !workspaceId || !title) {
      return NextResponse.json({ data: null, error: "Missing required fields", status: 400 });
    }

    const result = await createBoardRecord(boardId, organizationId, workspaceId, title);
    if (!result.data) {
      return NextResponse.json({ data: null, error: result.error, status: result.status });
    }

    return NextResponse.json({
      data: {
        id: result.data.id,
        title: result.data.title,
        status: result.data.status,
      },
    });
  } catch {
    return NextResponse.json({ data: null, error: "Failed to create record", status: 500 });
  }
}
