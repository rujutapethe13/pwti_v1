import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getWorkspaceOverview } from "@/features/workspaces/overview-actions";

/**
 * Secured workspace overview data.
 *
 * Access is enforced inside `getWorkspaceOverview` via `getUserWorkspaceAccess`,
 * so a non-member never receives data — only a 403.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  const { data, error } = await getWorkspaceOverview(workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ data });
}
