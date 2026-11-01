import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTimeRangeQuery } from "@/features/overview/time-range";
import { fetchOverviewDrilldown } from "@/features/overview/overview-drilldown-service";

export async function GET(request: NextRequest) {
  try {
    const organizationId = await getUserOrganizationId();
    if (!organizationId) {
      return NextResponse.json(
        {
          error:
            "Unable to determine organization. Please ensure you are a member of a workspace.",
        },
        { status: 401 },
      );
    }

    const supabase = await createServiceClient();
    const range = parseTimeRangeQuery(request.nextUrl.searchParams);
    const boardsParam = request.nextUrl.searchParams.get("boards");
    const boardIds =
      boardsParam && boardsParam.trim().length > 0
        ? boardsParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

    const result = await fetchOverviewDrilldown(supabase, {
      organizationId,
      range,
      boardIds,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Overview drilldown error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load overview drilldown details",
      },
      { status: 500 },
    );
  }
}
