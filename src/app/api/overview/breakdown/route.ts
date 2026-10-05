import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTimeRangeQuery } from "@/features/overview/time-range";
import { fetchVolumeBreakdown } from "@/features/overview/volume-breakdown-service";

/**
 * Volume breakdown — real per-job-type counts for the Overview donut.
 *
 * Split out from `/api/overview` so this section owns its own loading, empty and
 * error state and a failure here cannot hide the rest of the page. The endpoint
 * answers with the counts the database produced for the requested window plus a
 * flag saying whether the organization maps a job-type column at all; the client
 * decides how to present an org that has none.
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

    const payload = await fetchVolumeBreakdown(supabase, { organizationId, range });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Overview volume breakdown error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load volume breakdown",
      },
      { status: 500 },
    );
  }
}
