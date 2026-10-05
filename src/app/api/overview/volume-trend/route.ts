import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTimeRangeQuery } from "@/features/overview/time-range";
import { fetchVolumeTrend } from "@/features/overview/volume-trend-service";

/**
 * Volume trend — one bucketed series per date column, for the Overview chart.
 *
 * Split out from `/api/overview` so this section owns its own loading, empty
 * and error state, and so a failure here cannot hide the rest of the page. The
 * endpoint returns both the received and the completed series plus a flag
 * saying whether the org has any completion-date column at all; the client
 * decides whether to offer the toggle.
 */
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

    const payload = await fetchVolumeTrend(supabase, { organizationId, range });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Overview volume trend error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load volume trend",
      },
      { status: 500 },
    );
  }
}
