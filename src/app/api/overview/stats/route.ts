import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getUserOrganizationId } from "@/lib/organization";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTimeRangeQuery } from "@/features/overview/time-range";
import { fetchOverviewStatCards } from "@/features/overview/stat-cards-service";

/**
 * Stat cards for the Overview page, scoped to the requested window.
 *
 * Split out from `/api/overview` so this section owns its own loading, empty and
 * error states: a failure here does not blank out the activity feed, charts, or
 * the rest of the page, and the rest of the page does not have to resolve before
 * the cards can render.
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

    const result = await fetchOverviewStatCards(supabase, {
      organizationId,
      range,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Overview stat cards error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load stat cards",
      },
      { status: 500 },
    );
  }
}
