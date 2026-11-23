import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { fetchDashboardSummary, timeApi } from "@/lib/board-data-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return timeApi("/api/dashboard-summary", async () => {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Unable to determine organization. Please ensure you are a member of a workspace." },
        { status: 401 },
      );
    }

    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const summary = await fetchDashboardSummary(organizationId, { forceRefresh });

    return NextResponse.json({
      ...summary,
      cached: !forceRefresh,
    });
  });
}
